export interface PaymentModeBreakdown {
  cash: number;
  upi: number;
  other: number;
  credit: number;
}

export interface LowStockProductItem {
  productId: string;
  name: string;
  sku?: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  displayUnit: string;
}

export interface WorkerPerformanceItem {
  workerId: string;
  workerName: string;
  billCount: number;
  totalSales: number;
  creditGiven: number;
  paymentsCollected: number;
}

export interface DashboardData {
  todayRevenue: number;
  monthlyRevenue: number;
  lifetimeRevenue: number;
  billCount: number;
  paymentModeBreakdown: PaymentModeBreakdown;
  outstandingUdhaarTotal: number;
  stockValue: number;
  lowStockProducts: LowStockProductItem[];
  grossProfit: number;
  workerPerformance: WorkerPerformanceItem[];
}
