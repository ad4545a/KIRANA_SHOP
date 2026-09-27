export interface Customer {
  customerId: string;
  name: string;
  phone: string;
  outstandingBalance: number; // Derived/cached balance, default 0 at creation
  totalPurchases: number; // Total spending in ₹, default 0 at creation
  totalBills: number; // Count of bills, default 0 at creation
  lastPurchaseAt?: string;
  isActive: boolean; // Soft delete status
  createdAt?: string;
  updatedAt?: string;
}

export type LedgerEntryType = 'SALE_CREDIT' | 'PAYMENT_APPLIED' | 'ADJUSTMENT' | 'RETURN_CREDIT';
export type LedgerDirection = 'DEBIT' | 'CREDIT';
export type LedgerReferenceType = 'BILL' | 'PAYMENT' | 'RETURN' | 'MANUAL';

export interface CustomerLedgerEntry {
  entryId: string;
  type: LedgerEntryType;
  amount: number;
  direction: LedgerDirection;
  referenceType: LedgerReferenceType;
  referenceId: string;
  resultingBalance: number;
  createdBy: string;
  createdAt: string;
  note?: string;
}

export interface ManualLedgerAdjustmentResult {
  ledgerEntry: CustomerLedgerEntry;
  previousBalance: number;
  resultingBalance: number;
  customerId: string;
}
