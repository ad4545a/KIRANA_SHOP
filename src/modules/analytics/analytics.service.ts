import { firestore } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { DashboardData, LowStockProductItem, WorkerPerformanceItem } from './analytics.types';

export class AnalyticsService {
  /**
   * Reads and aggregates read-only owner dashboard metrics per PRD v3.1 §13.
   * Calculations:
   * - todayRevenue, monthlyRevenue, lifetimeRevenue, billCount, grossProfit from bills (and dailySummary fast path)
   * - paymentModeBreakdown: cash, upi, other, credit from bills
   * - grossProfit: sum of (item.sellingPriceSnapshot - item.costPriceSnapshot) * item.qty across all completed bill items
   * - outstandingUdhaarTotal: sum of customer.outstandingBalance for active customers
   * - stockValue: sum of (currentStock / unitConversionFactor) * purchasePrice for active products
   * - lowStockProducts: active products where currentStock <= minimumStock
   * - workerPerformance: worker-wise billCount, totalSales, creditGiven, and paymentsCollected
   */
  public async getDashboardData(): Promise<DashboardData> {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const monthPrefix = todayStr.substring(0, 7); // YYYY-MM

    // 1. Customers: calculate outstanding Udhaar total
    const customersSnap = await firestore
      .collection(COLLECTIONS.CUSTOMERS)
      .where('isActive', '==', true)
      .get();

    let outstandingUdhaarTotal = 0;
    for (const doc of customersSnap.docs) {
      const data = doc.data();
      outstandingUdhaarTotal += data.outstandingBalance || 0;
    }
    outstandingUdhaarTotal = Math.round(outstandingUdhaarTotal * 100) / 100;

    // 2. Products: calculate stock value and low stock items
    const productsSnap = await firestore
      .collection(COLLECTIONS.PRODUCTS)
      .where('isActive', '==', true)
      .get();

    let stockValue = 0;
    const lowStockProducts: LowStockProductItem[] = [];

    for (const doc of productsSnap.docs) {
      const data = doc.data();
      const currentStock = data.currentStock || 0;
      const minimumStock = data.minimumStock || 0;
      const unitConversionFactor = data.unitConversionFactor || 1;
      const purchasePrice = data.purchasePrice || 0;

      // Stock value: (currentStock in base units / conversionFactor) * purchasePrice
      const displayStock = currentStock / unitConversionFactor;
      stockValue += displayStock * purchasePrice;

      // Low stock rule: currentStock <= minimumStock (PRD §5 & guidelines)
      if (currentStock <= minimumStock) {
        lowStockProducts.push({
          productId: doc.id,
          name: data.name || '',
          sku: data.sku,
          category: data.category || '',
          currentStock,
          minimumStock,
          displayUnit: data.displayUnit || 'pc',
        });
      }
    }
    stockValue = Math.round(stockValue * 100) / 100;

    // 3. Users: get workers mapping for worker-wise performance
    const usersSnap = await firestore.collection(COLLECTIONS.USERS).get();
    const userNameMap = new Map<string, string>();
    for (const doc of usersSnap.docs) {
      userNameMap.set(doc.id, doc.data().name || 'Unknown');
    }

    // 4. Bills: calculate revenue, gross profit, payment breakdown, worker sales & credit
    const billsSnap = await firestore
      .collection(COLLECTIONS.BILLS)
      .where('status', '==', 'COMPLETED')
      .get();

    let todayRevenue = 0;
    let monthlyRevenue = 0;
    let lifetimeRevenue = 0;
    let billCount = 0;
    let grossProfit = 0;

    const paymentModeBreakdown = {
      cash: 0,
      upi: 0,
      other: 0,
      credit: 0,
    };

    const workerMap = new Map<string, { billCount: number; totalSales: number; creditGiven: number; paymentsCollected: number }>();

    for (const doc of billsSnap.docs) {
      const bill = doc.data();
      const createdAtStr = bill.createdAt || '';
      const billDateStr = createdAtStr.split('T')[0] || '';
      const billMonthStr = billDateStr.substring(0, 7);
      const totalAmount = bill.totalAmount || 0;
      const workerId = bill.workerId || 'UNKNOWN';

      lifetimeRevenue += totalAmount;
      billCount += 1;

      if (billDateStr === todayStr) {
        todayRevenue += totalAmount;
      }

      if (billMonthStr === monthPrefix) {
        monthlyRevenue += totalAmount;
      }

      // Breakdown accumulator
      if (bill.paymentBreakdown) {
        paymentModeBreakdown.cash += bill.paymentBreakdown.cash || 0;
        paymentModeBreakdown.upi += bill.paymentBreakdown.upi || 0;
        paymentModeBreakdown.other += bill.paymentBreakdown.other || 0;
        paymentModeBreakdown.credit += bill.paymentBreakdown.credit || 0;
      }

      // Gross profit based on price snapshots (sellingPriceSnapshot - costPriceSnapshot) * qty
      if (Array.isArray(bill.items)) {
        for (const item of bill.items) {
          const qty = item.qty || 0;
          const sellingPrice = item.sellingPriceSnapshot || 0;
          const costPrice = item.costPriceSnapshot || 0;
          grossProfit += (sellingPrice - costPrice) * qty;
        }
      }

      // Worker performance aggregation from bills
      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, { billCount: 0, totalSales: 0, creditGiven: 0, paymentsCollected: 0 });
      }
      const wStats = workerMap.get(workerId)!;
      wStats.billCount += 1;
      wStats.totalSales += totalAmount;
      wStats.creditGiven += bill.paymentBreakdown?.credit || 0;
    }

    todayRevenue = Math.round(todayRevenue * 100) / 100;
    monthlyRevenue = Math.round(monthlyRevenue * 100) / 100;
    lifetimeRevenue = Math.round(lifetimeRevenue * 100) / 100;
    grossProfit = Math.round(grossProfit * 100) / 100;
    paymentModeBreakdown.cash = Math.round(paymentModeBreakdown.cash * 100) / 100;
    paymentModeBreakdown.upi = Math.round(paymentModeBreakdown.upi * 100) / 100;
    paymentModeBreakdown.other = Math.round(paymentModeBreakdown.other * 100) / 100;
    paymentModeBreakdown.credit = Math.round(paymentModeBreakdown.credit * 100) / 100;

    // 5. Payments: aggregate payments collected by worker
    const paymentsSnap = await firestore
      .collection(COLLECTIONS.PAYMENTS)
      .where('status', '==', 'RECORDED')
      .get();

    for (const doc of paymentsSnap.docs) {
      const payment = doc.data();
      const workerId = payment.receivedBy || 'UNKNOWN';
      const amount = payment.amount || 0;

      if (!workerMap.has(workerId)) {
        workerMap.set(workerId, { billCount: 0, totalSales: 0, creditGiven: 0, paymentsCollected: 0 });
      }
      const wStats = workerMap.get(workerId)!;
      wStats.paymentsCollected += amount;
    }

    // Format worker performance list
    const workerPerformance: WorkerPerformanceItem[] = [];
    for (const [wId, stats] of workerMap.entries()) {
      workerPerformance.push({
        workerId: wId,
        workerName: userNameMap.get(wId) || wId,
        billCount: stats.billCount,
        totalSales: Math.round(stats.totalSales * 100) / 100,
        creditGiven: Math.round(stats.creditGiven * 100) / 100,
        paymentsCollected: Math.round(stats.paymentsCollected * 100) / 100,
      });
    }

    return {
      todayRevenue,
      monthlyRevenue,
      lifetimeRevenue,
      billCount,
      paymentModeBreakdown,
      outstandingUdhaarTotal,
      stockValue,
      lowStockProducts,
      grossProfit,
      workerPerformance,
    };
  }
}

export const analyticsService = new AnalyticsService();
