export type PaymentMethod = 'CASH' | 'UPI' | 'OTHER';
export type PaymentRecordStatus = 'RECORDED' | 'REVERSED';

export interface PaymentAllocationItem {
  billId: string;
  amount: number;
}

export interface Payment {
  paymentId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  upiReference?: string | null;
  appliedTo: PaymentAllocationItem[];
  receivedBy: string;
  status: PaymentRecordStatus;
  idempotencyKey?: string;
  createdAt: string;
}
