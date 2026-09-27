import { firestore } from '../../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { UserRole } from '../../shared/constants/roles';
import { ProcessReturnDto } from './return.dto';
import { ProcessReturnResult, ReturnItemDetail, ReturnRecord } from './return.types';
import { Bill, BillStatus } from '../billing/billing.types';

export class ReturnService {
  /**
   * Process a Return (OWNER only per PRD §4, §10, §10.1):
   * 1. Idempotency Check (if idempotencyKey provided).
   * 2. Transactionally:
   *    a. Read original bill from `bills/{billId}`. Verify exists and is not already REVERSED.
   *    b. Validate each return item:
   *       - Exists in original bill items.
   *       - `requestedQty <= (item.qty - item.returnedQty)`. If exceeded → 409 EXCEEDS_RETURNABLE_QUANTITY.
   *    c. Calculate return item refund amounts (`qty * sellingPriceSnapshot`) & base unit quantity changes.
   *    d. Update `products/{productId}.currentStock` (+qtyBaseUnit) & write `RETURN` stock ledger entry (`products/{productId}/stockLedger/{entryId}`).
   *    e. Update bill line `returnedQty` (`item.returnedQty + requestedQty`).
   *    f. Determine new bill status: `REVERSED` if all lines fully returned, otherwise `PARTIALLY_RETURNED`.
   *    g. Update `bills/{billId}` status and items.
   *    h. If `refundMethod === 'CREDIT'` and customer is attached:
   *       - Write `RETURN_CREDIT` customer ledger entry (`customers/{customerId}/ledger/{entryId}`) with `resultingBalance`.
   *       - Atomically update `customer.outstandingBalance` (`- totalRefund`).
   *    i. Save return record to `returns/{returnId}`.
   * 3. Write audit log entry `PROCESS_RETURN`.
   */
  public async processReturn(
    dto: ProcessReturnDto,
    actorId: string,
    actorRole: UserRole
  ): Promise<ProcessReturnResult> {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existingQuery = await firestore
        .collection(COLLECTIONS.RETURNS)
        .where('idempotencyKey', '==', dto.idempotencyKey)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        const data = existingDoc.data();
        return {
          returnRecord: {
            returnId: existingDoc.id,
            originalBillId: data.originalBillId,
            items: data.items,
            totalRefund: data.totalRefund,
            refundMethod: data.refundMethod,
            reason: data.reason,
            processedBy: data.processedBy,
            idempotencyKey: data.idempotencyKey,
            createdAt: data.createdAt,
          },
          updatedBillStatus: data.updatedBillStatus || 'PARTIALLY_RETURNED',
          idempotentReplay: true,
        };
      }
    }

    const now = new Date().toISOString();
    const returnRef = firestore.collection(COLLECTIONS.RETURNS).doc();
    const returnId = returnRef.id;

    let finalTotalRefund = 0;
    let finalUpdatedBillStatus: BillStatus = 'PARTIALLY_RETURNED';
    let finalResultingBalance: number | undefined = undefined;
    let createdReturnRecord: ReturnRecord | null = null;

    // 2. Firestore Transaction for Atomic Return Processing
    await firestore.runTransaction(async (transaction) => {
      // a. Read bill
      const billRef = firestore.collection(COLLECTIONS.BILLS).doc(dto.originalBillId);
      const billSnap = await transaction.get(billRef);

      if (!billSnap.exists) {
        throw new AppError('Original bill not found', HTTP_STATUS.NOT_FOUND, 'BILL_NOT_FOUND');
      }

      const billData = billSnap.data() as Bill;
      if (billData.status === 'REVERSED') {
        throw new AppError('Bill has already been fully reversed', HTTP_STATUS.CONFLICT, 'BILL_ALREADY_REVERSED');
      }

      // b. Validate items are present on the bill and check return quantity guard (PRD §10.1)
      const updatedBillItems = billData.items.map((item) => ({ ...item }));

      for (const returnInput of dto.items) {
        const billLineIndex = updatedBillItems.findIndex((i) => i.productId === returnInput.productId);
        if (billLineIndex === -1) {
          throw new AppError(
            `Product '${returnInput.productId}' is not present in original bill #${billData.billNumber}`,
            HTTP_STATUS.BAD_REQUEST,
            'PRODUCT_NOT_IN_BILL'
          );
        }
      }

      // Pre-fetch product documents for base unit calculation
      const productIds = Array.from(new Set(dto.items.map((i) => i.productId)));
      const productSnaps = await Promise.all(
        productIds.map((id) => transaction.get(firestore.collection(COLLECTIONS.PRODUCTS).doc(id)))
      );

      const productMap = new Map<string, any>();
      for (const snap of productSnaps) {
        if (!snap.exists) {
          throw new AppError(`Product with ID '${snap.id}' not found`, HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
        }
        productMap.set(snap.id, snap.data()!);
      }

      const returnItemDetails: ReturnItemDetail[] = [];
      let totalRefund = 0;

      for (const returnInput of dto.items) {
        const billLineIndex = updatedBillItems.findIndex((i) => i.productId === returnInput.productId);
        const billLine = updatedBillItems[billLineIndex];
        const returnableQty = billLine.qty - (billLine.returnedQty || 0);

        if (returnInput.qty > returnableQty + 0.0001) {
          throw new AppError(
            `Requested return quantity (${returnInput.qty}) exceeds returnable quantity (${returnableQty}) for product '${billLine.productName}'`,
            HTTP_STATUS.CONFLICT,
            'EXCEEDS_RETURNABLE_QUANTITY'
          );
        }

        const product = productMap.get(returnInput.productId);
        const conversionFactor = product.unitConversionFactor || 1;
        const qtyBaseUnit = Math.round(returnInput.qty * conversionFactor);
        const lineRefund = Math.round(returnInput.qty * billLine.sellingPriceSnapshot * 100) / 100;

        totalRefund += lineRefund;
        billLine.returnedQty = Math.round(((billLine.returnedQty || 0) + returnInput.qty) * 1000) / 1000;

        returnItemDetails.push({
          productId: returnInput.productId,
          qty: returnInput.qty,
          qtyBaseUnit,
          refundAmount: lineRefund,
        });
      }

      totalRefund = Math.round(totalRefund * 100) / 100;
      finalTotalRefund = totalRefund;

      // c. Restock inventory & write RETURN stock ledger entry for each item
      for (const itemDetail of returnItemDetails) {
        const prodRef = firestore.collection(COLLECTIONS.PRODUCTS).doc(itemDetail.productId);
        transaction.update(prodRef, {
          currentStock: FieldValue.increment(itemDetail.qtyBaseUnit) as any,
          updatedAt: now,
        });

        const stockLedgerRef = prodRef.collection('stockLedger').doc();
        transaction.set(stockLedgerRef, {
          entryId: stockLedgerRef.id,
          productId: itemDetail.productId,
          type: 'RETURN',
          quantityChangeBaseUnit: itemDetail.qtyBaseUnit,
          referenceId: returnId,
          createdBy: actorId,
          createdAt: now,
        });
      }

      // d. Determine new bill status (REVERSED if all line items fully returned, else PARTIALLY_RETURNED)
      const isFullyReturned = updatedBillItems.every((item) => item.returnedQty >= item.qty - 0.0001);
      finalUpdatedBillStatus = isFullyReturned ? 'REVERSED' : 'PARTIALLY_RETURNED';

      // e. Update Bill document
      transaction.update(billRef, {
        items: updatedBillItems,
        status: finalUpdatedBillStatus,
        updatedAt: now,
      });

      // f. Handle Customer Udhaar / Credit Reversal (PRD §10, §11)
      if (dto.refundMethod === 'CREDIT') {
        if (!billData.customerId) {
          throw new AppError(
            'Cannot refund via CREDIT for a walk-in bill without a customer reference',
            HTTP_STATUS.BAD_REQUEST,
            'CUSTOMER_REQUIRED_FOR_CREDIT_REFUND'
          );
        }

        const customerRef = firestore.collection(COLLECTIONS.CUSTOMERS).doc(billData.customerId);
        const custSnap = await transaction.get(customerRef);

        if (!custSnap.exists) {
          throw new AppError('Associated customer not found', HTTP_STATUS.NOT_FOUND, 'CUSTOMER_NOT_FOUND');
        }

        const custData = custSnap.data()!;
        const previousBalance = custData.outstandingBalance || 0;
        const newBalance = Math.max(0, Math.round((previousBalance - totalRefund) * 100) / 100);
        finalResultingBalance = newBalance;

        // Write RETURN_CREDIT customer ledger entry with resultingBalance snapshot
        const custLedgerRef = customerRef.collection('ledger').doc();
        transaction.set(custLedgerRef, {
          entryId: custLedgerRef.id,
          type: 'RETURN_CREDIT',
          amount: totalRefund,
          direction: 'CREDIT',
          referenceType: 'RETURN',
          referenceId: returnId,
          resultingBalance: newBalance,
          createdBy: actorId,
          createdAt: now,
          note: `Return credit for bill #${billData.billNumber}`,
        });

        // Update customer outstandingBalance
        transaction.update(customerRef, {
          outstandingBalance: newBalance,
          updatedAt: now,
        });
      }

      // g. Save return document
      createdReturnRecord = {
        returnId,
        originalBillId: dto.originalBillId,
        items: returnItemDetails,
        totalRefund,
        refundMethod: dto.refundMethod,
        reason: dto.reason.trim(),
        processedBy: actorId,
        idempotencyKey: dto.idempotencyKey,
        createdAt: now,
      };

      transaction.set(returnRef, {
        ...createdReturnRecord,
        updatedBillStatus: finalUpdatedBillStatus,
      });
    });

    // 3. Write Audit Log Entry
    try {
      await firestore.collection(COLLECTIONS.AUDIT_LOGS).add({
        actorId,
        actorRole,
        action: 'PROCESS_RETURN',
        targetType: 'RETURN',
        targetId: returnId,
        afterState: {
          originalBillId: dto.originalBillId,
          totalRefund: finalTotalRefund,
          refundMethod: dto.refundMethod,
          updatedBillStatus: finalUpdatedBillStatus,
        },
        createdAt: now,
      });
    } catch (e) {
      // Non-blocking audit log
    }

    return {
      returnRecord: createdReturnRecord!,
      updatedBillStatus: finalUpdatedBillStatus,
      resultingBalance: finalResultingBalance,
      idempotentReplay: false,
    };
  }

  /**
   * Retrieve return record by ID (OWNER only).
   */
  public async getReturnById(returnId: string): Promise<ReturnRecord> {
    const docSnap = await firestore.collection(COLLECTIONS.RETURNS).doc(returnId).get();

    if (!docSnap.exists) {
      throw new AppError('Return record not found', HTTP_STATUS.NOT_FOUND, 'RETURN_NOT_FOUND');
    }

    const data = docSnap.data()!;
    return {
      returnId: docSnap.id,
      originalBillId: data.originalBillId,
      items: data.items,
      totalRefund: data.totalRefund,
      refundMethod: data.refundMethod,
      reason: data.reason,
      processedBy: data.processedBy,
      idempotencyKey: data.idempotencyKey,
      createdAt: data.createdAt,
    };
  }

  /**
   * List returns (OWNER only).
   */
  public async listReturns(): Promise<ReturnRecord[]> {
    const snapshot = await firestore.collection(COLLECTIONS.RETURNS).orderBy('createdAt', 'desc').get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        returnId: doc.id,
        originalBillId: data.originalBillId,
        items: data.items,
        totalRefund: data.totalRefund,
        refundMethod: data.refundMethod,
        reason: data.reason,
        processedBy: data.processedBy,
        idempotencyKey: data.idempotencyKey,
        createdAt: data.createdAt,
      };
    });
  }
}

export const returnService = new ReturnService();
