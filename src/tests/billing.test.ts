import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

const mockProducts: Record<string, any> = {};
const mockCustomers: Record<string, any> = {};
const mockUsers: Record<string, any> = {};
const mockBills: Record<string, any> = {};
const mockLedgers: Record<string, any[]> = {};
let mockCounterLastNumber = 100;

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockDoc = (collName: string, docId: string) => {
    return {
      id: docId,
      get: jest.fn().mockImplementation(async () => {
        let data: any = null;
        if (collName === 'products') data = mockProducts[docId];
        else if (collName === 'customers') data = mockCustomers[docId];
        else if (collName === 'users') data = mockUsers[docId];
        else if (collName === 'bills') data = mockBills[docId];
        else if (collName === 'counters' && docId === 'bills') data = { lastNumber: mockCounterLastNumber };

        return {
          exists: !!data,
          id: docId,
          data: () => data,
        };
      }),
      set: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'bills') mockBills[docId] = data;
        else if (collName === 'products') mockProducts[docId] = data;
        else if (collName === 'customers') mockCustomers[docId] = data;
        else if (collName === 'counters' && docId === 'bills') mockCounterLastNumber = data.lastNumber;
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        const applyUpdate = (targetObj: any) => {
          for (const k of Object.keys(data)) {
            if (data[k] && typeof data[k] === 'object' && 'operand' in data[k]) {
              targetObj[k] = (targetObj[k] || 0) + data[k].operand;
            } else {
              targetObj[k] = data[k];
            }
          }
        };
        if (collName === 'products' && mockProducts[docId]) {
          applyUpdate(mockProducts[docId]);
        } else if (collName === 'customers' && mockCustomers[docId]) {
          applyUpdate(mockCustomers[docId]);
        }
      }),
      collection: jest.fn((subColl: string) => {
        return {
          doc: jest.fn((subId?: string) => {
            const entryId = subId || `sub_${Date.now()}`;
            return {
              id: entryId,
              set: jest.fn().mockImplementation(async (entryData: any) => {
                const key = `${collName}_${docId}_${subColl}`;
                if (!mockLedgers[key]) mockLedgers[key] = [];
                mockLedgers[key].push({ id: entryId, ...entryData });
              }),
            };
          }),
        };
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
          doc: jest.fn((id?: string) => {
            const actualId = id || `doc_${Date.now()}`;
            return mockDoc(collName, actualId);
          }),
          where: jest.fn((field: string, op: string, val: any) => {
            return {
              limit: jest.fn(() => ({
                get: jest.fn().mockImplementation(async () => {
                  const store = collName === 'bills' ? mockBills : mockProducts;
                  const foundId = Object.keys(store).find((k) => store[k][field] === val);
                  if (foundId) {
                    return {
                      empty: false,
                      docs: [{ id: foundId, data: () => store[foundId] }],
                    };
                  }
                  return { empty: true, docs: [] };
                }),
              })),
            };
          }),
          orderBy: jest.fn(() => ({
            get: jest.fn().mockImplementation(async () => {
              return {
                docs: Object.keys(mockBills).map((k) => ({
                  id: k,
                  data: () => mockBills[k],
                })),
              };
            }),
          })),
        };
      }),
      getAll: jest.fn().mockImplementation(async (...refs: any[]) => {
        return refs.map((r) => {
          const id = r.id || 'p1';
          return {
            exists: !!mockProducts[id],
            id: id,
            data: () => mockProducts[id],
          };
        });
      }),
      runTransaction: jest.fn().mockImplementation(async (updateFunction: any) => {
        const mockTransaction = {
          get: async (ref: any) => {
            return ref.get();
          },
          set: (ref: any, data: any, options?: any) => {
            ref.set(data, options);
          },
          update: (ref: any, data: any) => {
            ref.update(data);
          },
        };
        await updateFunction(mockTransaction);
      }),
    },
  };
});

describe('Phase 6 — POS Billing / Sales Unit & Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCounterLastNumber = 100;
    for (const key of Object.keys(mockProducts)) delete mockProducts[key];
    for (const key of Object.keys(mockCustomers)) delete mockCustomers[key];
    for (const key of Object.keys(mockUsers)) delete mockUsers[key];
    for (const key of Object.keys(mockBills)) delete mockBills[key];
    for (const key of Object.keys(mockLedgers)) delete mockLedgers[key];

    mockProducts['p1'] = {
      name: 'Sugar',
      category: 'Essentials',
      unitType: 'BASE',
      baseUnit: 'g',
      displayUnit: 'kg',
      unitConversionFactor: 1000,
      purchasePrice: 35,
      sellingPrice: 40,
      currentStock: 10000, // 10 kg
      minimumStock: 1000,
      gstPercent: 0,
      isActive: true,
    };

    mockCustomers['c1'] = {
      name: 'Ramesh',
      phone: '9876543210',
      outstandingBalance: 0,
      totalPurchases: 0,
      totalBills: 0,
      isActive: true,
    };

    mockUsers['w1'] = {
      name: 'Worker 1',
      phone: '9999999999',
      role: 'WORKER',
      status: 'ACTIVE',
      maxDiscountAmount: 50,
      maxDiscountPercent: 10,
    };
  });

  describe('1. POS Bill Creation (OWNER & WORKER)', () => {
    it('should allow WORKER to create cash bill within worker discount limits', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer worker-token')
        .send({
          items: [{ productId: 'p1', qty: 2 }], // 2 kg = 80 Rs subtotal
          discount: 5, // 5 Rs discount <= min(50, 80 * 10%) = 8 Rs
          paymentBreakdown: {
            cash: 75,
            upi: 0,
            other: 0,
            credit: 0,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bill.billNumber).toBe(101);
      expect(res.body.data.bill.subtotal).toBe(80);
      expect(res.body.data.bill.totalAmount).toBe(75);
      expect(res.body.data.bill.paymentStatus).toBe('PAID');
    });

    it('should reject bill when WORKER exceeds discount limits (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer worker-token')
        .send({
          items: [{ productId: 'p1', qty: 2 }], // 80 Rs subtotal
          discount: 20, // 20 Rs exceeds max allowed 8 Rs (10%)
          paymentBreakdown: {
            cash: 60,
            upi: 0,
            other: 0,
            credit: 0,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('DISCOUNT_LIMIT_EXCEEDED');
    });

    it('should create Udhaar credit bill and update customer financial counters', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          items: [{ productId: 'p1', qty: 2 }], // 80 Rs subtotal
          discount: 0,
          paymentBreakdown: {
            cash: 30,
            upi: 0,
            other: 0,
            credit: 50, // 50 Rs Udhaar
          },
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.bill.paymentStatus).toBe('PARTIAL');
    });
  });

  describe('2. Validation & Stock Guards', () => {
    it('should return 409 INSUFFICIENT_STOCK if requested quantity exceeds currentStock', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          items: [{ productId: 'p1', qty: 100 }], // 100 kg = 100,000 g > 10,000 g stock
          discount: 0,
          paymentBreakdown: {
            cash: 4000,
            upi: 0,
            other: 0,
            credit: 0,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should correctly sell 0.5 kg from baseUnit g stock and decrement stock by 500g', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          items: [{ productId: 'p1', qty: 0.5 }], // 0.5 kg = 500 g -> sellingPrice 40 * 0.5 = 20
          discount: 0,
          paymentBreakdown: {
            cash: 20,
            upi: 0,
            other: 0,
            credit: 0,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bill.totalAmount).toBe(20);
      expect(mockProducts['p1'].currentStock).toBe(9500); // 10000 - 500
    });

    it('should reject selling 0.5 of a COUNT product with 400 INVALID_QUANTITY_FOR_UNIT_TYPE', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      mockProducts['p_count'] = {
        name: 'Biscuit Packet',
        category: 'Snacks',
        unitType: 'COUNT',
        baseUnit: 'pc',
        displayUnit: 'packet',
        unitConversionFactor: 1,
        purchasePrice: 10,
        sellingPrice: 15,
        currentStock: 50,
        minimumStock: 10,
        gstPercent: 0,
        isActive: true,
      };

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          items: [{ productId: 'p_count', qty: 0.5 }],
          discount: 0,
          paymentBreakdown: {
            cash: 7.5,
            upi: 0,
            other: 0,
            credit: 0,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('INVALID_QUANTITY_FOR_UNIT_TYPE');
      expect(res.body.error.message).toBe('This product can only be sold in whole units');
    });

    it('should return 409 INSUFFICIENT_STOCK if requested decimal quantity exceeds baseUnit stock', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          items: [{ productId: 'p1', qty: 10.5 }], // 10.5 kg = 10,500 g > 10,000 g stock
          discount: 0,
          paymentBreakdown: {
            cash: 420,
            upi: 0,
            other: 0,
            credit: 0,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('should return 400 when credit portion is present without customerId', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          items: [{ productId: 'p1', qty: 1 }],
          discount: 0,
          paymentBreakdown: {
            cash: 0,
            upi: 0,
            other: 0,
            credit: 40,
          },
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. Idempotency Support', () => {
    it('should return idempotentReplay when idempotencyKey is replayed', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      mockBills['b_replay'] = {
        billNumber: 99,
        customerId: null,
        workerId: 'owner1',
        items: [],
        subtotal: 100,
        discount: 0,
        totalAmount: 100,
        paymentStatus: 'PAID',
        paymentBreakdown: { cash: 100, upi: 0, other: 0, credit: 0 },
        status: 'COMPLETED',
        idempotencyKey: '770e8400-e29b-41d4-a716-446655440000',
        createdAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/v1/bills')
        .set('Authorization', 'Bearer owner-token')
        .send({
          idempotencyKey: '770e8400-e29b-41d4-a716-446655440000',
          items: [{ productId: 'p1', qty: 1 }],
          paymentBreakdown: { cash: 40, upi: 0, other: 0, credit: 0 },
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.idempotentReplay).toBe(true);
      expect(res.body.data.bill.billNumber).toBe(99);
    });
  });
});
