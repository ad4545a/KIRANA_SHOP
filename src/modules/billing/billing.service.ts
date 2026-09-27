import { firestore } from '../../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { ROLES, UserRole } from '../../shared/constants/roles';
import { userService } from '../users/user.service';
import { notificationService } from '../notifications/notification.service';
import { CreateBillDto } from './billing.dto';
import { Bill, BillItemSnapshot, PaymentStatus } from './billing.types';

export class BillingService {
  /**
   * Concurrency-safe POS Bill Creation:
   * 1. Idempotency Check (PRD §7)
   * 2. Validate Worker Discount Limit (PRD §9)
   * 3. Validate customer & products pre-transaction
   * 4. Execute Firestore Transaction (PRD §7, §8):
   *    - Counter increment (`counters/bills`)
   *    - Verify stock in base units
   *    - Write bill doc (`bills/{billId}`)
   *    - Decrement product `currentStock` & write `SALE` stock ledger
   *    - If Udhaar portion: write `SALE_CREDIT` customer ledger & update customer balance
   *    - Update `dailySummary/{today}`
   * 5. Write audit log entry
   */
  public async createBill(
    dto: CreateBillDto,
    actorId: string,
    actorRole: UserRole
  ): Promise<{ bill: Bill; idempotentReplay?: boolean }> {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existingQuery = await firestore
        .collection(COLLECTIONS.BILLS)
        .where('idempotencyKey', '==', dto.idempotencyKey)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        const data = existingDoc.data();
        return {
          bill: {
            billId: existingDoc.id,
            billNumber: data.billNumber,
            customerId: data.customerId,
            workerId: data.workerId,
            items: data.items,
            subtotal: data.subtotal,
            discount: data.discount,
            discountApprovedBy: data.discountApprovedBy,
            totalAmount: data.totalAmount,
            paymentStatus: data.paymentStatus,
            paymentBreakdown: data.paymentBreakdown,
            status: data.status,
            idempotencyKey: data.idempotencyKey,
            createdAt: data.createdAt,
          },
          idempotentReplay: true,
        };
      }
    }

    // Pre-fetch items and validate product availability
    const productIds = Array.from(new Set(dto.items.map((i) => i.productId)));
    const productRefs = productIds.map((id) => firestore.collection(COLLECTIONS.PRODUCTS).doc(id));
    const productSnaps = await firestore.getAll(...productRefs);

    const productMap = new Map<string, any>();
    for (const snap of productSnaps) {
      if (!snap.exists) {
        throw new AppError(`Product with ID '${snap.id}' not found`, HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
      }
      const data = snap.data()!;
      if (!data.isActive) {
        throw new AppError(`Cannot sell inactive product '${data.name}'`, HTTP_STATUS.BAD_REQUEST, 'INACTIVE_PRODUCT');
      }
      productMap.set(snap.id, data);
    }

    // Pre-calculate subtotal & item snapshots
    let subtotal = 0;
    const itemSnapshots: { itemSnapshot: BillItemSnapshot; quantityBaseUnit: number }[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);

      // Validate COUNT products have integer quantities
      if (product.unitType === 'COUNT' && !Number.isInteger(item.qty)) {
        throw new AppError(
          'This product can only be sold in whole units',
          HTTP_STATUS.BAD_REQUEST,
          'INVALID_QUANTITY_FOR_UNIT_TYPE'
        );
      }

      const qtyBaseUnit = Math.round(item.qty * product.unitConversionFactor);
      const lineTotal = Math.round(item.qty * product.sellingPrice * 100) / 100;

      subtotal += lineTotal;

      itemSnapshots.push({
        quantityBaseUnit: qtyBaseUnit,
        itemSnapshot: {
          productId: item.productId,
          productName: product.name,
          qty: item.qty,
          qtyBaseUnit,
          unit: product.displayUnit,
          sellingPriceSnapshot: product.sellingPrice,
          costPriceSnapshot: product.purchasePrice,
          lineTotal,
          returnedQty: 0,
        },
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // 2. Validate Worker Discount Limit (PRD §9)
    if (actorRole === ROLES.WORKER && dto.discount > 0) {
      const workerProfile = await userService.getUserProfile(actorId);
      const maxAmt = workerProfile?.maxDiscountAmount ?? 0;
      const maxPct = workerProfile?.maxDiscountPercent ?? 0;

      const allowedDiscountCap = Math.min(maxAmt, (subtotal * maxPct) / 100);

      if (dto.discount > allowedDiscountCap) {
        throw new AppError(
          `Discount of ₹${dto.discount} exceeds your worker limit of ₹${allowedDiscountCap}`,
          HTTP_STATUS.FORBIDDEN,
          'DISCOUNT_LIMIT_EXCEEDED'
        );
      }
    }

    const totalAmount = Math.max(0, Math.round((subtotal - dto.discount) * 100) / 100);

    // Validate payment breakdown matches totalAmount
    const sumPaid =
      dto.paymentBreakdown.cash +
      dto.paymentBreakdown.upi +
      dto.paymentBreakdown.other +
      dto.paymentBreakdown.credit;

    if (Math.abs(sumPaid - totalAmount) > 0.01) {
      throw new AppError(
        `Payment breakdown total (₹${sumPaid}) does not match bill total amount (₹${totalAmount})`,
        HTTP_STATUS.BAD_REQUEST,
        'INVALID_PAYMENT_BREAKDOWN'
      );
    }

    // Determine payment status
    let paymentStatus: PaymentStatus = 'PAID';
    if (dto.paymentBreakdown.credit >= totalAmount) {
      paymentStatus = 'CREDIT';
    } else if (dto.paymentBreakdown.credit > 0) {
      paymentStatus = 'PARTIAL';
    }

    // 3. Customer validation if customerId or credit portion present
    let customerRef: FirebaseFirestore.DocumentReference | null = null;
    if (dto.customerId) {
      customerRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc(dto.customerId);
      const custSnap = await customerRef.get();
      if (!custSnap.exists) {
        throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
      }
      if (!custSnap.data()!.isActive) {
        throw new AppError('Customer account is inactive', HTTP_STATUS.BAD_REQUEST, 'INACTIVE_CUSTOMER');
      }
    }

    const now = new Date().toISOString();
    const todayDateStr = now.split('T')[0]; // YYYY-MM-DD for dailySummary cache
    const billRef = firestore.collection(COLLECTIONS.BILLS).doc();
    const billId = billRef.id;

    let finalBillNumber = 0;

    // 4. Firestore Transaction for Atomic POS Bill Execution
    await firestore.runTransaction(async (transaction) => {
      // a. Perform ALL READS first (Firestore constraint: all reads before writes)
      // 1. Read counter
      const counterRef = firestore.collection(COLLECTIONS.COUNTERS).doc('bills');
      const counterSnap = await transaction.get(counterRef);

      let lastNumber = 0;
      if (counterSnap.exists) {
        lastNumber = counterSnap.data()!.lastNumber || 0;
      }
      finalBillNumber = lastNumber + 1;

      // 2. Read products stock
      const prodSnapshots: { prodRef: any; currentStock: number; item: typeof itemSnapshots[0] }[] = [];
      for (const item of itemSnapshots) {
        const prodRef = firestore.collection(COLLECTIONS.PRODUCTS).doc(item.itemSnapshot.productId);
        const prodSnap = await transaction.get(prodRef);

        if (!prodSnap.exists) {
          throw new AppError(`Product '${item.itemSnapshot.productName}' not found`, HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
        }

        const currentStock = prodSnap.data()!.currentStock || 0;
        if (currentStock < item.quantityBaseUnit) {
          throw new AppError(
            `Insufficient stock for '${item.itemSnapshot.productName}'. Available: ${currentStock}, Required: ${item.quantityBaseUnit}`,
            HTTP_STATUS.CONFLICT,
            'INSUFFICIENT_STOCK'
          );
        }
        prodSnapshots.push({ prodRef, currentStock, item });
      }

      // 3. Read customer details if Udhaar / customer bill
      let custSnapData: any = null;
      if (dto.customerId && customerRef) {
        const custSnap = await transaction.get(customerRef);
        if (custSnap.exists) {
          custSnapData = custSnap.data();
        }
      }

      // b. Perform ALL WRITES second
      // 1. Increment bill counter
      transaction.set(counterRef, { lastNumber: finalBillNumber }, { merge: true });

      // 2. Decrement stock & create SALE stock ledger entries
      for (const { prodRef, item } of prodSnapshots) {
        transaction.update(prodRef, {
          currentStock: FieldValue.increment(-item.quantityBaseUnit) as any,
          updatedAt: now,
        });

        const ledgerRef = prodRef.collection('stockLedger').doc();
        transaction.set(ledgerRef, {
          entryId: ledgerRef.id,
          productId: item.itemSnapshot.productId,
          type: 'SALE',
          quantityChangeBaseUnit: -item.quantityBaseUnit,
          referenceId: billId,
          createdBy: actorId,
          createdAt: now,
        });
      }

      // 3. Create Bill document
      const billData: Omit<Bill, 'billId'> = {
        billNumber: finalBillNumber,
        customerId: dto.customerId || null,
        workerId: actorId,
        items: itemSnapshots.map((i) => i.itemSnapshot),
        subtotal,
        discount: dto.discount,
        discountApprovedBy: dto.discount > 0 ? actorId : null,
        totalAmount,
        paymentStatus,
        paymentBreakdown: dto.paymentBreakdown,
        status: 'COMPLETED',
        idempotencyKey: dto.idempotencyKey,
        createdAt: now,
      };
      transaction.set(billRef, billData);

      // 4. Update Customer ledger & financial counters if Udhaar / customer bill
      if (dto.customerId && customerRef && custSnapData) {
        const currentBalance = custSnapData.outstandingBalance || 0;
        const currentTotalPurchases = custSnapData.totalPurchases || 0;
        const currentTotalBills = custSnapData.totalBills || 0;

        const udhaarAmount = dto.paymentBreakdown.credit;
        const newBalance = currentBalance + udhaarAmount;

        // If Udhaar portion > 0, write SALE_CREDIT customer ledger entry with resultingBalance (PRD §5, §11)
        if (udhaarAmount > 0) {
          const custLedgerRef = customerRef.collection('ledger').doc();
          transaction.set(custLedgerRef, {
            entryId: custLedgerRef.id,
            type: 'SALE_CREDIT',
            amount: udhaarAmount,
            direction: 'DEBIT',
            referenceType: 'BILL',
            referenceId: billId,
            resultingBalance: newBalance,
            createdBy: actorId,
            createdAt: now,
            note: `Udhaar sale for bill #${finalBillNumber}`,
          });
        }

        // Update customer document cached fields
        transaction.update(customerRef, {
          outstandingBalance: newBalance,
          totalPurchases: Math.round((currentTotalPurchases + totalAmount) * 100) / 100,
          totalBills: currentTotalBills + 1,
          lastPurchaseAt: now,
          updatedAt: now,
        });
      }

      // f. Update dailySummary cache document (PRD §7, §13)
      const summaryRef = firestore.collection(COLLECTIONS.DAILY_SUMMARY).doc(todayDateStr);
      transaction.set(
        summaryRef,
        {
          totalRevenue: FieldValue.increment(totalAmount),
          cashTotal: FieldValue.increment(dto.paymentBreakdown.cash),
          upiTotal: FieldValue.increment(dto.paymentBreakdown.upi),
          creditTotal: FieldValue.increment(dto.paymentBreakdown.credit),
          billCount: FieldValue.increment(1),
        },
        { merge: true }
      );
    });

    // 5. Write Audit Log Entry
    try {
      await firestore.collection(COLLECTIONS.AUDIT_LOGS).add({
        actorId,
        actorRole,
        action: 'CREATE_BILL',
        targetType: 'BILL',
        targetId: billId,
        afterState: { billNumber: finalBillNumber, totalAmount, paymentStatus },
        createdAt: now,
      });
    } catch (e) {
      // Non-blocking audit log
    }

    // 6. Non-blocking Notification Creation & FCM push per PRD §7 step 6
    try {
      await notificationService.createAndSendNotification({
        type: 'NEW_BILL',
        title: `New Sale: Bill #${finalBillNumber}`,
        message: `New bill #${finalBillNumber} created for ₹${totalAmount}`,
        referenceId: billId,
        channel: 'PUSH',
      });
    } catch (e) {
      // Non-blocking notification delivery failure per PRD §7
    }

    const createdBill: Bill = {
      billId,
      billNumber: finalBillNumber,
      customerId: dto.customerId || null,
      workerId: actorId,
      items: itemSnapshots.map((i) => i.itemSnapshot),
      subtotal,
      discount: dto.discount,
      discountApprovedBy: dto.discount > 0 ? actorId : null,
      totalAmount,
      paymentStatus,
      paymentBreakdown: dto.paymentBreakdown,
      status: 'COMPLETED',
      idempotencyKey: dto.idempotencyKey,
      createdAt: now,
    };

    return {
      bill: createdBill,
      idempotentReplay: false,
    };
  }

  /**
   * Retrieves single bill by ID (OWNER + WORKER).
   */
  public async getBillById(billId: string): Promise<Bill> {
    const docSnap = await firestore.collection(COLLECTIONS.BILLS).doc(billId).get();

    if (!docSnap.exists) {
      throw new AppError('Bill not found', HTTP_STATUS.NOT_FOUND, 'BILL_NOT_FOUND');
    }

    const data = docSnap.data()!;
    return {
      billId: docSnap.id,
      billNumber: data.billNumber,
      customerId: data.customerId,
      workerId: data.workerId,
      items: data.items,
      subtotal: data.subtotal,
      discount: data.discount,
      discountApprovedBy: data.discountApprovedBy,
      totalAmount: data.totalAmount,
      paymentStatus: data.paymentStatus,
      paymentBreakdown: data.paymentBreakdown,
      status: data.status,
      idempotencyKey: data.idempotencyKey,
      createdAt: data.createdAt,
    };
  }

  /**
   * Lists bills (OWNER + WORKER).
   */
  public async listBills(): Promise<Bill[]> {
    const snapshot = await firestore.collection(COLLECTIONS.BILLS).orderBy('createdAt', 'desc').get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        billId: doc.id,
        billNumber: data.billNumber,
        customerId: data.customerId,
        workerId: data.workerId,
        items: data.items,
        subtotal: data.subtotal,
        discount: data.discount,
        discountApprovedBy: data.discountApprovedBy,
        totalAmount: data.totalAmount,
        paymentStatus: data.paymentStatus,
        paymentBreakdown: data.paymentBreakdown,
        status: data.status,
        idempotencyKey: data.idempotencyKey,
        createdAt: data.createdAt,
      };
    });
  }
}

export const billingService = new BillingService();
