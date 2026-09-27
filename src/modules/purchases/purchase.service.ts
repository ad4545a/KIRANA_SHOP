import { firestore } from '../../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreatePurchaseDto } from './purchase.dto';
import { Purchase, PurchaseItemSnapshot, StockLedgerEntry } from './purchase.types';

export class PurchaseService {
  /**
   * Records a stock purchase atomically:
   * 1. Check idempotencyKey replay if provided.
   * 2. Validate products exist & are active.
   * 3. Compute base unit quantity increase & price snapshot line totals.
   * 4. Perform Firestore transaction:
   *    - Create purchase doc (`purchases/{purchaseId}`)
   *    - Increment `currentStock` on `products/{productId}`
   *    - Create stock ledger entries (`products/{productId}/stockLedger/{entryId}`)
   */
  public async createPurchase(dto: CreatePurchaseDto, actorId: string): Promise<{ purchase: Purchase; idempotentReplay?: boolean }> {
    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existingQuery = await firestore
        .collection(COLLECTIONS.PURCHASES)
        .where('idempotencyKey', '==', dto.idempotencyKey)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        const existingDoc = existingQuery.docs[0];
        const data = existingDoc.data();
        return {
          purchase: {
            purchaseId: existingDoc.id,
            supplierId: data.supplierId,
            items: data.items,
            totalAmount: data.totalAmount,
            invoiceRef: data.invoiceRef,
            createdBy: data.createdBy,
            idempotencyKey: data.idempotencyKey,
            createdAt: data.createdAt,
          },
          idempotentReplay: true,
        };
      }
    }

    const now = new Date().toISOString();
    const purchaseRef = firestore.collection(COLLECTIONS.PURCHASES).doc();
    const purchaseId = purchaseRef.id;

    // 2. Fetch and validate all products involved
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
        throw new AppError(`Cannot record purchase for inactive product '${data.name}'`, HTTP_STATUS.BAD_REQUEST, 'INACTIVE_PRODUCT');
      }
      productMap.set(snap.id, data);
    }

    // 3. Prepare item snapshots and totals
    let totalAmount = 0;
    const itemSnapshots: PurchaseItemSnapshot[] = [];
    const stockLedgerOps: { productId: string; entryId: string; entry: StockLedgerEntry; quantityChangeBaseUnit: number }[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      
      // Calculate quantity change in base units (e.g., 2 kg displayUnit * 1000 factor = 2000 g baseUnit)
      const quantityBaseUnit = Math.round(item.quantity * product.unitConversionFactor);
      const priceSnapshot = item.purchasePrice ?? product.purchasePrice;
      const lineTotal = item.quantity * priceSnapshot;

      totalAmount += lineTotal;

      itemSnapshots.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        quantityBaseUnit,
        unit: product.displayUnit,
        purchasePriceSnapshot: priceSnapshot,
        lineTotal,
      });

      const ledgerRef = firestore
        .collection(COLLECTIONS.PRODUCTS)
        .doc(item.productId)
        .collection('stockLedger')
        .doc();

      stockLedgerOps.push({
        productId: item.productId,
        entryId: ledgerRef.id,
        quantityChangeBaseUnit: quantityBaseUnit,
        entry: {
          entryId: ledgerRef.id,
          productId: item.productId,
          type: 'PURCHASE',
          quantityChangeBaseUnit: quantityBaseUnit,
          referenceId: purchaseId,
          createdBy: actorId,
          createdAt: now,
        },
      });
    }

    // 4. Firestore Transaction for Atomic Execution
    await firestore.runTransaction(async (transaction) => {
      // Create Purchase Record
      const purchaseData: Omit<Purchase, 'purchaseId'> = {
        supplierId: dto.supplierId,
        items: itemSnapshots,
        totalAmount,
        invoiceRef: dto.invoiceRef,
        createdBy: actorId,
        idempotencyKey: dto.idempotencyKey,
        createdAt: now,
      };
      transaction.set(purchaseRef, purchaseData);

      // Increment product currentStock and create stockLedger docs
      for (const op of stockLedgerOps) {
        const prodRef = firestore.collection(COLLECTIONS.PRODUCTS).doc(op.productId);
        transaction.update(prodRef, {
          currentStock: FieldValue.increment(op.quantityChangeBaseUnit) as any,
          updatedAt: now,
        });

        const ledgerRef = prodRef.collection('stockLedger').doc(op.entryId);
        transaction.set(ledgerRef, op.entry);
      }
    });

    return {
      purchase: {
        purchaseId,
        supplierId: dto.supplierId,
        items: itemSnapshots,
        totalAmount,
        invoiceRef: dto.invoiceRef,
        createdBy: actorId,
        idempotencyKey: dto.idempotencyKey,
        createdAt: now,
      },
      idempotentReplay: false,
    };
  }

  /**
   * Retrieves a single purchase by ID (OWNER only).
   */
  public async getPurchaseById(purchaseId: string): Promise<Purchase> {
    const docSnap = await firestore.collection(COLLECTIONS.PURCHASES).doc(purchaseId).get();

    if (!docSnap.exists) {
      throw new AppError('Purchase record not found', HTTP_STATUS.NOT_FOUND, 'PURCHASE_NOT_FOUND');
    }

    const data = docSnap.data()!;
    return {
      purchaseId: docSnap.id,
      supplierId: data.supplierId,
      items: data.items,
      totalAmount: data.totalAmount,
      invoiceRef: data.invoiceRef,
      createdBy: data.createdBy,
      idempotencyKey: data.idempotencyKey,
      createdAt: data.createdAt,
    };
  }

  /**
   * Lists purchase records (OWNER only).
   */
  public async listPurchases(): Promise<Purchase[]> {
    const snapshot = await firestore.collection(COLLECTIONS.PURCHASES).orderBy('createdAt', 'desc').get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        purchaseId: doc.id,
        supplierId: data.supplierId,
        items: data.items,
        totalAmount: data.totalAmount,
        invoiceRef: data.invoiceRef,
        createdBy: data.createdBy,
        idempotencyKey: data.idempotencyKey,
        createdAt: data.createdAt,
      };
    });
  }

  /**
   * Retrieves product stock ledger entries (`products/{productId}/stockLedger`).
   */
  public async getStockLedger(productId: string): Promise<StockLedgerEntry[]> {
    const snapshot = await firestore
      .collection(COLLECTIONS.PRODUCTS)
      .doc(productId)
      .collection('stockLedger')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        entryId: doc.id,
        productId: data.productId,
        type: data.type,
        quantityChangeBaseUnit: data.quantityChangeBaseUnit,
        referenceId: data.referenceId,
        createdBy: data.createdBy,
        createdAt: data.createdAt,
      };
    });
  }
}

export const purchaseService = new PurchaseService();
