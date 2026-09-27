import { firestore } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { UserRole } from '../../shared/constants/roles';
import { Customer, CustomerLedgerEntry, ManualLedgerAdjustmentResult } from './customer.types';
import { CreateCustomerDto, CustomerQueryDto, ManualAdjustmentDto, UpdateCustomerDto, UpdateCustomerStatusDto } from './customer.dto';

export class CustomerService {
  /**
   * Helper to check phone uniqueness among active customers.
   */
  private async checkPhoneUniqueness(phone: string, excludeCustomerId?: string): Promise<void> {
    const trimmedPhone = phone.trim();
    const snapshot = await firestore
      .collection(COLLECTIONS.CUSTOMERS)
      .where('phone', '==', trimmedPhone)
      .where('isActive', '==', true)
      .get();

    const conflictingDoc = snapshot.docs.find((doc) => doc.id !== excludeCustomerId);
    if (conflictingDoc) {
      throw new AppError(
        `Customer with phone number '${trimmedPhone}' already exists`,
        HTTP_STATUS.CONFLICT,
        'CUSTOMER_PHONE_EXISTS'
      );
    }
  }

  /**
   * Create a new customer (OWNER + WORKER per PRD §4).
   * Note: Financial fields (outstandingBalance, totalPurchases, totalBills) start at 0.
   */
  public async createCustomer(dto: CreateCustomerDto): Promise<Customer> {
    await this.checkPhoneUniqueness(dto.phone);

    const docRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc();
    const now = new Date().toISOString();

    const newCustomerData: Omit<Customer, 'customerId'> = {
      name: dto.name.trim(),
      phone: dto.phone.trim(),
      outstandingBalance: 0,
      totalPurchases: 0,
      totalBills: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(newCustomerData);

    return {
      customerId: docRef.id,
      ...newCustomerData,
    };
  }

  /**
   * Get single customer by ID (OWNER + WORKER per PRD §4).
   */
  public async getCustomerById(customerId: string): Promise<Customer> {
    const docSnap = await firestore.collection(COLLECTIONS.CUSTOMERS).doc(customerId).get();

    if (!docSnap.exists) {
      throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
    }

    const data = docSnap.data()!;
    return {
      customerId: docSnap.id,
      name: data.name,
      phone: data.phone,
      outstandingBalance: data.outstandingBalance ?? 0,
      totalPurchases: data.totalPurchases ?? 0,
      totalBills: data.totalBills ?? 0,
      lastPurchaseAt: data.lastPurchaseAt,
      isActive: data.isActive,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  /**
   * List and search customers (OWNER + WORKER per PRD §4).
   */
  public async listCustomers(query: CustomerQueryDto): Promise<Customer[]> {
    let collectionRef: FirebaseFirestore.Query = firestore.collection(COLLECTIONS.CUSTOMERS);

    if (query.isActive !== undefined) {
      const activeBool = query.isActive === 'true';
      collectionRef = collectionRef.where('isActive', '==', activeBool);
    }

    const snapshot = await collectionRef.get();
    let customers = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        customerId: doc.id,
        name: data.name || '',
        phone: data.phone || '',
        outstandingBalance: data.outstandingBalance ?? 0,
        totalPurchases: data.totalPurchases ?? 0,
        totalBills: data.totalBills ?? 0,
        lastPurchaseAt: data.lastPurchaseAt,
        isActive: data.isActive,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Customer;
    });

    if (query.search && query.search.trim() !== '') {
      const searchLower = query.search.trim().toLowerCase();
      customers = customers.filter(
        (c) => c.name.toLowerCase().includes(searchLower) || c.phone.includes(searchLower)
      );
    }

    return customers;
  }

  /**
   * Update customer contact info (OWNER + WORKER per PRD §4).
   * Note: Financial fields cannot be edited directly through this endpoint.
   */
  public async updateCustomer(customerId: string, dto: UpdateCustomerDto): Promise<Customer> {
    const docRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc(customerId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
    }

    if (dto.phone) {
      await this.checkPhoneUniqueness(dto.phone, customerId);
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      updatedAt: now,
    };

    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.phone !== undefined) updatePayload.phone = dto.phone.trim();

    await docRef.update(updatePayload);

    return this.getCustomerById(customerId);
  }

  /**
   * Soft delete / status update (OWNER only).
   */
  public async updateCustomerStatus(customerId: string, dto: UpdateCustomerStatusDto): Promise<Customer> {
    const docRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc(customerId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
    }

    const now = new Date().toISOString();
    await docRef.update({
      isActive: dto.isActive,
      updatedAt: now,
    });

    return this.getCustomerById(customerId);
  }

  /**
   * Post a manual ledger adjustment (OWNER only per PRD §4, §10, §11).
   * Atomically:
   * 1. Reads customer's current outstanding balance in a Firestore transaction.
   * 2. Validates customer exists and is active.
   * 3. Calculates resulting balance (DEBIT increases balance, CREDIT decreases balance).
   * 4. Ensures resulting balance is non-negative (rejection with 409 if negative).
   * 5. Writes type: 'ADJUSTMENT' ledger entry with resultingBalance snapshot.
   * 6. Updates customer.outstandingBalance.
   * 7. Creates auditLog entry.
   */
  public async postAdjustment(
    dto: ManualAdjustmentDto,
    actorId: string,
    actorRole: UserRole
  ): Promise<ManualLedgerAdjustmentResult> {
    const customerRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc(dto.customerId);
    const now = new Date().toISOString();

    let previousBalance = 0;
    let resultingBalance = 0;
    let createdLedgerEntry: CustomerLedgerEntry | null = null;

    await firestore.runTransaction(async (transaction) => {
      const custSnap = await transaction.get(customerRef);

      if (!custSnap.exists) {
        throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
      }

      const custData = custSnap.data()!;
      if (!custData.isActive) {
        throw new AppError('Customer account is inactive', HTTP_STATUS.BAD_REQUEST, 'INACTIVE_CUSTOMER');
      }

      previousBalance = custData.outstandingBalance || 0;

      // DEBIT adds to balance (customer owes more); CREDIT reduces balance (customer paid/credited)
      const absAmount = Math.abs(dto.amount);
      const balanceDelta = dto.direction === 'DEBIT' ? absAmount : -absAmount;
      resultingBalance = Math.round((previousBalance + balanceDelta) * 100) / 100;

      if (resultingBalance < 0) {
        throw new AppError(
          `Adjustment of ${dto.direction} ₹${absAmount} would result in a negative balance (₹${resultingBalance})`,
          HTTP_STATUS.CONFLICT,
          'NEGATIVE_BALANCE_NOT_ALLOWED'
        );
      }

      const ledgerRef = customerRef.collection('ledger').doc();
      const entryId = ledgerRef.id;

      createdLedgerEntry = {
        entryId,
        type: 'ADJUSTMENT',
        amount: absAmount,
        direction: dto.direction,
        referenceType: 'MANUAL',
        referenceId: entryId,
        resultingBalance,
        createdBy: actorId,
        createdAt: now,
        note: dto.reason.trim(),
      };

      transaction.set(ledgerRef, createdLedgerEntry);

      transaction.update(customerRef, {
        outstandingBalance: resultingBalance,
        updatedAt: now,
      });
    });

    // Write Audit Log Entry
    try {
      await firestore.collection(COLLECTIONS.AUDIT_LOGS).add({
        actorId,
        actorRole,
        action: 'MANUAL_LEDGER_ADJUSTMENT',
        targetType: 'CUSTOMER_LEDGER',
        targetId: dto.customerId,
        beforeState: { outstandingBalance: previousBalance },
        afterState: { outstandingBalance: resultingBalance, adjustmentReason: dto.reason.trim() },
        createdAt: now,
      });
    } catch (e) {
      // Non-blocking audit log
    }

    return {
      ledgerEntry: createdLedgerEntry!,
      previousBalance,
      resultingBalance,
      customerId: dto.customerId,
    };
  }

  /**
   * Get full customer ledger history (OWNER only per PRD §4).
   */
  public async getCustomerLedger(customerId: string): Promise<CustomerLedgerEntry[]> {
    const customerSnap = await firestore.collection(COLLECTIONS.CUSTOMERS).doc(customerId).get();
    if (!customerSnap.exists) {
      throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
    }

    const ledgerSnap = await firestore
      .collection(COLLECTIONS.CUSTOMERS)
      .doc(customerId)
      .collection('ledger')
      .orderBy('createdAt', 'desc')
      .get();

    return ledgerSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        entryId: doc.id,
        type: data.type,
        amount: data.amount,
        direction: data.direction,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        resultingBalance: data.resultingBalance,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
        note: data.note,
      };
    });
  }
}

export const customerService = new CustomerService();
