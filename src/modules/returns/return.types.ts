export type RefundMethod = 'CASH' | 'UPI' | 'CREDIT';

export interface ReturnItemDetail {
  productId: string;
  qty: number;
  qtyBaseUnit: number;
  refundAmount: number;
}

export interface ReturnRecord {
  returnId: string;
  originalBillId: string;
  items: ReturnItemDetail[];
  totalRefund: number;
  refundMethod: RefundMethod;
  reason: string;
  processedBy: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface ProcessReturnResult {
  returnRecord: ReturnRecord;
  updatedBillStatus: string;
  resultingBalance?: number;
  idempotentReplay?: boolean;
}
