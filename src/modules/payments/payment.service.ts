import { firestore } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { notificationService } from '../notifications/notification.service';
import { CreatePaymentDto } from './payment.dto';
import { Payment, PaymentAllocationItem } from './payment.types';

export class PaymentService {
  /**
   * Records a payment against customer Udhaar & allocates to bills:
   * 1. Idempotency Check (PRD §7)
   * 2. Execute Firestore Transaction:
   *    a. Read customer & verify active state + outstanding balance
   *    b. Check overpayment (payment.amount > customer.outstandingBalance) → 409 (PRD §6.2)
   *    c. Fetch open bills (paymentStatus IN ['CREDIT', 'PARTIAL']), sorted by createdAt ASC
   *    d. Perform FIFO or Manual Allocation against bill remaining balances
   *    e. Create Payment document (`payments/{paymentId}`)
   *    f. Create `PAYMENT_APPLIED` customer ledger entry (`customers/{customerId}/ledger/{entryId}`) with `resultingBalance`
   *    g. Recompute customer `outstandingBalance` & update customer document
   *    h. Create Audit Log entry
   */
  public async createPayment(
    dto: CreatePaymentDto,
    actorId: string
  ): Promise<{ payment: Payment; idempotentReplay?: boolean }> {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existingQuery = await firestore
        .collection(COLLECTIONS.PAYMENTS)
        .where('idempotencyKey', '==', dto.idempotencyKey)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        const data = existingDoc.data();
        return {
          payment: {
            paymentId: existingDoc.id,
            customerId: data.customerId,
            amount: data.amount,
            method: data.method,
            upiReference: data.upiReference,
            appliedTo: data.appliedTo,
            receivedBy: data.receivedBy,
            status: data.status,
            idempotencyKey: data.idempotencyKey,
            createdAt: data.createdAt,
          },
          idempotentReplay: true,
        };
      }
    }

    const now = new Date().toISOString();
    const paymentRef = firestore.collection(COLLECTIONS.PAYMENTS).doc();
    const paymentId = paymentRef.id;

    let appliedAllocations: PaymentAllocationItem[] = [];

    // 2. Execute Firestore Transaction for Atomic Settlement
    await firestore.runTransaction(async (transaction) => {
      // a. Verify customer
      const customerRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc(dto.customerId);
      const custSnap = await transaction.get(customerRef);

      if (!custSnap.exists) {
        throw new AppError('Customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
      }

      const custData = custSnap.data()!;
      if (!custData.isActive) {
        throw new AppError('Customer account is inactive', HTTP_STATUS.BAD_REQUEST, 'INACTIVE_CUSTOMER');
      }

      const currentOutstanding = custData.outstandingBalance || 0;

      // b. Overpayment Protection (PRD §6.2)
      if (dto.amount > currentOutstanding) {
        throw new AppError(
          `Payment amount (₹${dto.amount}) exceeds outstanding balance (₹${currentOutstanding})`,
          HTTP_STATUS.CONFLICT,
          'OVERPAYMENT_NOT_ALLOWED'
        );
      }

      // c. Fetch open bills for customer (paymentStatus IN ['CREDIT', 'PARTIAL'])
      // Sorted by createdAt ASC (FIFO)
      const openBillsQuery = firestore
        .collection(COLLECTIONS.BILLS)
        .where('customerId', '==', dto.customerId)
        .where('status', '==', 'COMPLETED');

      const openBillsSnap = await transaction.get(openBillsQuery);
      let openBills: Record<string, any>[] = openBillsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((b: any) => b.paymentStatus === 'CREDIT' || b.paymentStatus === 'PARTIAL')
        .sort((a: any, b: any) => (a.createdAt > b.createdAt ? 1 : -1));

      appliedAllocations = [];

      // d. Allocation Logic
      if (dto.manualAllocation && dto.manualAllocation.length > 0) {
        // Manual Allocation Override (PRD §6.1)
        const manualTotal = dto.manualAllocation.reduce((sum, item) => sum + item.amount, 0);
        if (Math.abs(manualTotal - dto.amount) > 0.01) {
          throw new AppError(
            `Sum of manual allocations (₹${manualTotal}) does not match payment amount (₹${dto.amount})`,
            HTTP_STATUS.BAD_REQUEST,
            'INVALID_MANUAL_ALLOCATION'
          );
        }

        for (const alloc of dto.manualAllocation) {
          const targetBill = openBills.find((b: any) => b.id === alloc.billId);
          if (!targetBill) {
            throw new AppError(
              `Bill ID '${alloc.billId}' is not an open bill for this customer`,
              HTTP_STATUS.BAD_REQUEST,
              'INVALID_ALLOCATION_TARGET'
            );
          }

          // Calculate remaining unpaid amount on bill
          const currentCreditPaid = targetBill.appliedPaymentsTotal || 0;
          const remainingBillBalance = (targetBill.paymentBreakdown?.credit || 0) - currentCreditPaid;

          if (alloc.amount > remainingBillBalance + 0.01) {
            throw new AppError(
              `Allocation ₹${alloc.amount} exceeds bill #${targetBill.billNumber} remaining credit balance (₹${remainingBillBalance})`,
              HTTP_STATUS.BAD_REQUEST,
              'ALLOCATION_EXCEEDS_BILL_BALANCE'
            );
          }

          const newCreditPaid = currentCreditPaid + alloc.amount;
          const totalBillCredit = targetBill.paymentBreakdown?.credit || 0;

          let newPaymentStatus = targetBill.paymentStatus;
          if (newCreditPaid >= totalBillCredit - 0.01) {
            newPaymentStatus = 'PAID';
          } else {
            newPaymentStatus = 'PARTIAL';
          }

          const billRef = firestore.collection(COLLECTIONS.BILLS).doc(targetBill.id);
          transaction.update(billRef, {
            appliedPaymentsTotal: newCreditPaid,
            paymentStatus: newPaymentStatus,
            updatedAt: now,
          });

          appliedAllocations.push({ billId: targetBill.id, amount: alloc.amount });
        }
      } else {
        // Default FIFO Allocation (PRD §6.1)
        let unallocated = dto.amount;

        for (const bill of openBills) {
          if (unallocated <= 0) break;

          const currentCreditPaid = bill.appliedPaymentsTotal || 0;
          const totalBillCredit = bill.paymentBreakdown?.credit || 0;
          const remainingBillBalance = Math.max(0, totalBillCredit - currentCreditPaid);

          if (remainingBillBalance <= 0) continue;

          const allocAmount = Math.min(unallocated, remainingBillBalance);
          const newCreditPaid = currentCreditPaid + allocAmount;

          let newPaymentStatus = bill.paymentStatus;
          if (newCreditPaid >= totalBillCredit - 0.01) {
            newPaymentStatus = 'PAID';
          } else {
            newPaymentStatus = 'PARTIAL';
          }

          const billRef = firestore.collection(COLLECTIONS.BILLS).doc(bill.id);
          transaction.update(billRef, {
            appliedPaymentsTotal: newCreditPaid,
            paymentStatus: newPaymentStatus,
            updatedAt: now,
          });

          appliedAllocations.push({ billId: bill.id, amount: allocAmount });
          unallocated -= allocAmount;
        }
      }

      // e. Create Payment document
      const paymentData: Omit<Payment, 'paymentId'> = {
        customerId: dto.customerId,
        amount: dto.amount,
        method: dto.method,
        upiReference: dto.upiReference || null,
        appliedTo: appliedAllocations,
        receivedBy: actorId,
        status: 'RECORDED',
        idempotencyKey: dto.idempotencyKey,
        createdAt: now,
      };
      transaction.set(paymentRef, paymentData);

      // f. Write PAYMENT_APPLIED customer ledger entry with resultingBalance (PRD §5, §6.1, §11)
      const resultingBalance = currentOutstanding - dto.amount;
      const custLedgerRef = customerRef.collection('ledger').doc();

      transaction.set(custLedgerRef, {
        entryId: custLedgerRef.id,
        type: 'PAYMENT_APPLIED',
        amount: dto.amount,
        direction: 'CREDIT',
        referenceType: 'PAYMENT',
        referenceId: paymentId,
        resultingBalance: resultingBalance,
        createdBy: actorId,
        createdAt: now,
        note: `Payment received via ${dto.method}`,
      });

      // g. Update customer outstandingBalance cached field
      transaction.update(customerRef, {
        outstandingBalance: resultingBalance,
        updatedAt: now,
      });
    });

    // Write Audit Log Entry
    try {
      await firestore.collection(COLLECTIONS.AUDIT_LOGS).add({
        actorId,
        action: 'RECORD_PAYMENT',
        targetType: 'PAYMENT',
        targetId: paymentId,
        afterState: { customerId: dto.customerId, amount: dto.amount, method: dto.method },
        createdAt: now,
      });
    } catch (e) {
      // Non-blocking audit log
    }

    // Non-blocking Notification Creation & FCM push per PRD §7/§14
    try {
      await notificationService.createAndSendNotification({
        type: 'PAYMENT_RECEIVED',
        title: `Payment Received: ₹${dto.amount}`,
        message: `Payment of ₹${dto.amount} received via ${dto.method}`,
        referenceId: paymentId,
        channel: 'PUSH',
      });
    } catch (e) {
      // Non-blocking notification delivery failure
    }

    const createdPayment: Payment = {
      paymentId,
      customerId: dto.customerId,
      amount: dto.amount,
      method: dto.method,
      upiReference: dto.upiReference || null,
      appliedTo: appliedAllocations,
      receivedBy: actorId,
      status: 'RECORDED',
      idempotencyKey: dto.idempotencyKey,
      createdAt: now,
    };

    return {
      payment: createdPayment,
      idempotentReplay: false,
    };
  }

  /**
   * Retrieves single payment by ID (OWNER + WORKER).
   */
  public async getPaymentById(paymentId: string): Promise<Payment> {
    const docSnap = await firestore.collection(COLLECTIONS.PAYMENTS).doc(paymentId).get();

    if (!docSnap.exists) {
      throw new AppError('Payment record not found', HTTP_STATUS.NOT_FOUND, 'PAYMENT_NOT_FOUND');
    }

    const data = docSnap.data()!;
    return {
      paymentId: docSnap.id,
      customerId: data.customerId,
      amount: data.amount,
      method: data.method,
      upiReference: data.upiReference,
      appliedTo: data.appliedTo,
      receivedBy: data.receivedBy,
      status: data.status,
      idempotencyKey: data.idempotencyKey,
      createdAt: data.createdAt,
    };
  }

  /**
   * Lists payments (OWNER + WORKER).
   */
  public async listPayments(customerId?: string): Promise<Payment[]> {
    let query: FirebaseFirestore.Query = firestore.collection(COLLECTIONS.PAYMENTS);

    if (customerId) {
      query = query.where('customerId', '==', customerId);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        paymentId: doc.id,
        customerId: data.customerId,
        amount: data.amount,
        method: data.method,
        upiReference: data.upiReference,
        appliedTo: data.appliedTo,
        receivedBy: data.receivedBy,
        status: data.status,
        idempotencyKey: data.idempotencyKey,
        createdAt: data.createdAt,
      };
    });
  }
}

export const paymentService = new PaymentService();
