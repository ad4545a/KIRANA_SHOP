import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

const mockCustomers: Record<string, any> = {};
const mockBills: Record<string, any> = {};
const mockPayments: Record<string, any> = {};
const mockLedgers: Record<string, any[]> = {};

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockDoc = (collName: string, docId: string) => {
    return {
      get: jest.fn().mockImplementation(async () => {
        let data: any = null;
        if (collName === 'customers') data = mockCustomers[docId];
        else if (collName === 'bills') data = mockBills[docId];
        else if (collName === 'payments') data = mockPayments[docId];

        return {
          exists: !!data,
          id: docId,
          data: () => data,
        };
      }),
      set: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'payments') mockPayments[docId] = data;
        else if (collName === 'customers') mockCustomers[docId] = data;
        else if (collName === 'bills') mockBills[docId] = data;
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'customers' && mockCustomers[docId]) {
          mockCustomers[docId] = { ...mockCustomers[docId], ...data };
        } else if (collName === 'bills' && mockBills[docId]) {
          mockBills[docId] = { ...mockBills[docId], ...data };
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
                  const store = collName === 'payments' ? mockPayments : mockCustomers;
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
              where: jest.fn((field2: string, op2: string, val2: any) => {
                return {
                  get: jest.fn().mockImplementation(async () => {
                    const matchingDocs = Object.keys(mockBills)
                      .filter((id) => mockBills[id][field] === val && mockBills[id][field2] === val2)
                      .map((id) => ({ id, data: () => mockBills[id] }));
                    return { docs: matchingDocs };
                  }),
                };
              }),
              get: jest.fn().mockImplementation(async () => {
                const store = collName === 'payments' ? mockPayments : mockBills;
                const matchingDocs = Object.keys(store)
                  .filter((id) => store[id][field] === val)
                  .map((id) => ({ id, data: () => store[id] }));
                return { docs: matchingDocs };
              }),
            };
          }),
          orderBy: jest.fn(() => ({
            get: jest.fn().mockImplementation(async () => {
              return {
                docs: Object.keys(mockPayments).map((k) => ({
                  id: k,
                  data: () => mockPayments[k],
                })),
              };
            }),
          })),
        };
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

describe('Phase 7 — Payments & Udhaar Settlement Unit & Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockCustomers)) delete mockCustomers[key];
    for (const key of Object.keys(mockBills)) delete mockBills[key];
    for (const key of Object.keys(mockPayments)) delete mockPayments[key];
    for (const key of Object.keys(mockLedgers)) delete mockLedgers[key];

    mockCustomers['c1'] = {
      name: 'Ramesh Patel',
      phone: '9876543210',
      outstandingBalance: 10000,
      totalPurchases: 25000,
      totalBills: 3,
      isActive: true,
    };

    mockBills['b101'] = {
      billNumber: 101,
      customerId: 'c1',
      workerId: 'owner1',
      items: [],
      subtotal: 2000,
      discount: 0,
      totalAmount: 2000,
      paymentStatus: 'CREDIT',
      paymentBreakdown: { cash: 0, upi: 0, other: 0, credit: 2000 },
      appliedPaymentsTotal: 0,
      status: 'COMPLETED',
      createdAt: '2026-09-23T10:00:00Z',
    };

    mockBills['b102'] = {
      billNumber: 102,
      customerId: 'c1',
      workerId: 'owner1',
      items: [],
      subtotal: 3000,
      discount: 0,
      totalAmount: 3000,
      paymentStatus: 'CREDIT',
      paymentBreakdown: { cash: 0, upi: 0, other: 0, credit: 3000 },
      appliedPaymentsTotal: 0,
      status: 'COMPLETED',
      createdAt: '2026-09-23T10:05:00Z',
    };

    mockBills['b103'] = {
      billNumber: 103,
      customerId: 'c1',
      workerId: 'owner1',
      items: [],
      subtotal: 5000,
      discount: 0,
      totalAmount: 5000,
      paymentStatus: 'CREDIT',
      paymentBreakdown: { cash: 0, upi: 0, other: 0, credit: 5000 },
      appliedPaymentsTotal: 0,
      status: 'COMPLETED',
      createdAt: '2026-09-23T10:10:00Z',
    };
  });

  describe('1, 3, 4 & 5. FIFO Allocation, Overpayment Protection & Ledger Entry', () => {
    it('should allocate ₹4,000 via FIFO: Bill #101 (2000 fully paid), Bill #102 (2000 partially paid), update resultingBalance to ₹6,000', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', 'Bearer worker-token')
        .send({
          customerId: 'c1',
          amount: 4000,
          method: 'UPI',
          upiReference: 'UPI-REF-999',
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payment.amount).toBe(4000);
      expect(res.body.data.payment.appliedTo).toHaveLength(2);
      expect(res.body.data.payment.appliedTo[0]).toEqual({ billId: 'b101', amount: 2000 });
      expect(res.body.data.payment.appliedTo[1]).toEqual({ billId: 'b102', amount: 2000 });

      expect(mockBills['b101'].paymentStatus).toBe('PAID');
      expect(mockBills['b102'].paymentStatus).toBe('PARTIAL');

      expect(mockCustomers['c1'].outstandingBalance).toBe(6000);

      // Verify customer ledger entry creation
      const customerLedgerKey = 'customers_c1_ledger';
      expect(mockLedgers[customerLedgerKey]).toHaveLength(1);
      expect(mockLedgers[customerLedgerKey][0].type).toBe('PAYMENT_APPLIED');
      expect(mockLedgers[customerLedgerKey][0].amount).toBe(4000);
      expect(mockLedgers[customerLedgerKey][0].resultingBalance).toBe(6000);
    });

    it('5. should reject overpayment of ₹11,000 against ₹10,000 balance with 409 OVERPAYMENT_NOT_ALLOWED', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 11000,
          method: 'CASH',
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('OVERPAYMENT_NOT_ALLOWED');
      expect(mockCustomers['c1'].outstandingBalance).toBe(10000); // Unchanged
    });
  });

  describe('6. Manual Allocation Override', () => {
    it('should allow manual allocation to specific bills when valid', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 3000,
          method: 'CASH',
          manualAllocation: [
            { billId: 'b102', amount: 3000 },
          ],
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.data.payment.appliedTo[0]).toEqual({ billId: 'b102', amount: 3000 });
      expect(mockBills['b102'].paymentStatus).toBe('PAID');
      expect(mockCustomers['c1'].outstandingBalance).toBe(7000);
    });
  });

  describe('7. Idempotency Support', () => {
    it('should return idempotentReplay when payment idempotencyKey is replayed', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      mockPayments['pay_existing'] = {
        customerId: 'c1',
        amount: 2000,
        method: 'CASH',
        appliedTo: [{ billId: 'b101', amount: 2000 }],
        receivedBy: 'worker1',
        status: 'RECORDED',
        idempotencyKey: '880e8400-e29b-41d4-a716-446655440000',
        createdAt: new Date().toISOString(),
      };

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', 'Bearer worker-token')
        .send({
          idempotencyKey: '880e8400-e29b-41d4-a716-446655440000',
          customerId: 'c1',
          amount: 2000,
          method: 'CASH',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.idempotentReplay).toBe(true);
      expect(res.body.data.payment.amount).toBe(2000);
    });
  });
});
