import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

const mockCustomers: Record<string, any> = {};
const mockProducts: Record<string, any> = {};
const mockUsers: Record<string, any> = {};
const mockBills: Record<string, any> = {};
const mockPayments: Record<string, any> = {};

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockQuery = (collName: string, filters: { field: string; op: string; val: any }[]): any => {
    return {
      where: jest.fn((field2: string, op2: string, val2: any) => {
        return mockQuery(collName, [...filters, { field: field2, op: op2, val: val2 }]);
      }),
      get: jest.fn().mockImplementation(async () => {
        let store: Record<string, any> = {};
        if (collName === 'customers') store = mockCustomers;
        else if (collName === 'products') store = mockProducts;
        else if (collName === 'users') store = mockUsers;
        else if (collName === 'bills') store = mockBills;
        else if (collName === 'payments') store = mockPayments;

        const docs = Object.keys(store)
          .filter((id) => {
            const item = store[id];
            return filters.every((f) => item[f.field] === f.val);
          })
          .map((id) => ({
            id,
            data: () => store[id],
          }));

        return { docs, empty: docs.length === 0 };
      }),
    };
  };

  return {
    ...originalModule,
    adminAuth: {
      verifyIdToken: jest.fn(),
    },
    firestore: {
      collection: jest.fn((collName: string) => {
        return {
          where: jest.fn((field: string, op: string, val: any) => {
            return mockQuery(collName, [{ field, op, val }]);
          }),
          get: jest.fn().mockImplementation(async () => {
            let store: Record<string, any> = {};
            if (collName === 'customers') store = mockCustomers;
            else if (collName === 'products') store = mockProducts;
            else if (collName === 'users') store = mockUsers;
            else if (collName === 'bills') store = mockBills;
            else if (collName === 'payments') store = mockPayments;

            const docs = Object.keys(store).map((id) => ({
              id,
              data: () => store[id],
            }));
            return { docs, empty: docs.length === 0 };
          }),
        };
      }),
    },
  };
});

describe('Phase 8 — Owner Dashboard & Analytics Unit & Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(mockCustomers)) delete mockCustomers[k];
    for (const k of Object.keys(mockProducts)) delete mockProducts[k];
    for (const k of Object.keys(mockUsers)) delete mockUsers[k];
    for (const k of Object.keys(mockBills)) delete mockBills[k];
    for (const k of Object.keys(mockPayments)) delete mockPayments[k];

    // Seed mock database
    mockUsers['u_owner'] = { name: 'Store Owner', role: 'OWNER', status: 'ACTIVE' };
    mockUsers['u_worker'] = { name: 'Ramesh Worker', role: 'WORKER', status: 'ACTIVE' };

    mockCustomers['c1'] = { name: 'Customer 1', outstandingBalance: 3000, isActive: true };
    mockCustomers['c2'] = { name: 'Customer 2', outstandingBalance: 2000, isActive: true };

    mockProducts['p1'] = {
      name: 'Basmati Rice',
      category: 'Grains',
      currentStock: 50, // 5kg in 100g base units or count
      minimumStock: 100, // Low stock condition: 50 <= 100
      unitConversionFactor: 1,
      purchasePrice: 80,
      sellingPrice: 100,
      displayUnit: 'kg',
      isActive: true,
    };

    mockProducts['p2'] = {
      name: 'Sunflower Oil',
      category: 'Oil',
      currentStock: 500,
      minimumStock: 50,
      unitConversionFactor: 1,
      purchasePrice: 120,
      sellingPrice: 150,
      displayUnit: 'L',
      isActive: true,
    };

    const todayStr = new Date().toISOString().split('T')[0];

    mockBills['b1'] = {
      billNumber: 1,
      workerId: 'u_worker',
      status: 'COMPLETED',
      totalAmount: 500,
      paymentBreakdown: { cash: 200, upi: 100, other: 0, credit: 200 },
      items: [
        { productId: 'p1', qty: 2, sellingPriceSnapshot: 100, costPriceSnapshot: 80 },
        { productId: 'p2', qty: 2, sellingPriceSnapshot: 150, costPriceSnapshot: 120 },
      ],
      createdAt: `${todayStr}T10:00:00.000Z`,
    };

    mockPayments['pay1'] = {
      customerId: 'c1',
      amount: 1000,
      receivedBy: 'u_worker',
      status: 'RECORDED',
      createdAt: `${todayStr}T11:00:00.000Z`,
    };
  });

  describe('Security & Access Control', () => {
    it('1. should deny access to unauthenticated requests (401)', async () => {
      const res = await request(app).get('/api/v1/analytics/dashboard');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('2. should deny access to WORKER role (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'u_worker', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. should grant access to OWNER role (200 OK)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'u_owner', role: 'OWNER' });

      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Dashboard Metrics Calculation', () => {
    it('4. should correctly aggregate revenue, profit, stock value, Udhaar, and low-stock items', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'u_owner', role: 'OWNER' });

      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      const data = res.body.data;

      // Revenue checks
      expect(data.todayRevenue).toBe(500);
      expect(data.lifetimeRevenue).toBe(500);
      expect(data.billCount).toBe(1);

      // Payment Breakdown checks
      expect(data.paymentModeBreakdown).toEqual({
        cash: 200,
        upi: 100,
        other: 0,
        credit: 200,
      });

      // Outstanding Udhaar total check: 3000 + 2000 = 5000
      expect(data.outstandingUdhaarTotal).toBe(5000);

      // Stock Value check: (50 * 80) + (500 * 120) = 4000 + 60000 = 64000
      expect(data.stockValue).toBe(64000);

      // Low stock check: p1 (50 <= 100)
      expect(data.lowStockProducts).toHaveLength(1);
      expect(data.lowStockProducts[0].productId).toBe('p1');
      expect(data.lowStockProducts[0].name).toBe('Basmati Rice');

      // Gross profit check based on price snapshots:
      // Item 1: (100 - 80) * 2 = 40
      // Item 2: (150 - 120) * 2 = 60
      // Total Gross Profit = 100
      expect(data.grossProfit).toBe(100);

      // Worker performance check
      expect(data.workerPerformance).toHaveLength(1);
      expect(data.workerPerformance[0]).toEqual({
        workerId: 'u_worker',
        workerName: 'Ramesh Worker',
        billCount: 1,
        totalSales: 500,
        creditGiven: 200,
        paymentsCollected: 1000,
      });
    });

    it('5. should handle empty database gracefully without crashing', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'u_owner', role: 'OWNER' });

      for (const k of Object.keys(mockCustomers)) delete mockCustomers[k];
      for (const k of Object.keys(mockProducts)) delete mockProducts[k];
      for (const k of Object.keys(mockBills)) delete mockBills[k];
      for (const k of Object.keys(mockPayments)) delete mockPayments[k];

      const res = await request(app)
        .get('/api/v1/analytics/dashboard')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      const data = res.body.data;

      expect(data.todayRevenue).toBe(0);
      expect(data.monthlyRevenue).toBe(0);
      expect(data.lifetimeRevenue).toBe(0);
      expect(data.billCount).toBe(0);
      expect(data.paymentModeBreakdown).toEqual({ cash: 0, upi: 0, other: 0, credit: 0 });
      expect(data.outstandingUdhaarTotal).toBe(0);
      expect(data.stockValue).toBe(0);
      expect(data.lowStockProducts).toEqual([]);
      expect(data.grossProfit).toBe(0);
      expect(data.workerPerformance).toEqual([]);
    });
  });
});
