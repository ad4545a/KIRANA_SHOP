export interface PurchaseItemInput {
  productId: string;
  quantity: number; // quantity in displayUnit or transacted unit
  purchasePrice?: number; // optional override; defaults to product.purchasePrice
}

export interface PurchaseItemSnapshot {
  productId: string;
  productName: string;
  quantity: number;
  quantityBaseUnit: number;
  unit: string; // displayUnit snapshot
  purchasePriceSnapshot: number;
  lineTotal: number;
}

export interface Purchase {
  purchaseId: string;
  supplierId?: string;
  items: PurchaseItemSnapshot[];
  totalAmount: number;
  invoiceRef?: string;
  createdBy: string;
  idempotencyKey?: string;
  createdAt: string;
}

export type StockLedgerType = 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN';

export interface StockLedgerEntry {
  entryId: string;
  productId: string;
  type: StockLedgerType;
  quantityChangeBaseUnit: number;
  referenceId: string;
  createdBy: string;
  createdAt: string;
}
