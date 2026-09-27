export interface PaymentBreakdown {
  cash: number;
  upi: number;
  other: number;
  credit: number;
}

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'CREDIT';
export type BillStatus = 'COMPLETED' | 'REVERSED' | 'PARTIALLY_RETURNED';

export interface BillItemInput {
  productId: string;
  qty: number; // in displayUnit / transacted unit
}

export interface BillItemSnapshot {
  productId: string;
  productName: string;
  qty: number;
  qtyBaseUnit: number;
  unit: string;
  sellingPriceSnapshot: number;
  costPriceSnapshot: number;
  lineTotal: number;
  returnedQty: number;
}

export interface Bill {
  billId: string;
  billNumber: number;
  customerId?: string | null;
  workerId: string;
  items: BillItemSnapshot[];
  subtotal: number;
  discount: number;
  discountApprovedBy?: string | null;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  paymentBreakdown: PaymentBreakdown;
  status: BillStatus;
  idempotencyKey?: string;
  createdAt: string;
}
