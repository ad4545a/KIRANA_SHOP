import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

const mockBills: Record<string, any> = {};
const mockProducts: Record<string, any> = {};
const mockCustomers: Record<string, any> = {};
const mockReturns: Record<string, any> = {};
const mockLedgers: Record<string, any[]> = {};
const mockStockLedgers: Record<string, any[]> = {};
const mockAuditLogs: any[] = [];

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockQuery = (collName: string, filters: { field: string; op: string; val: any }[]): any => {
    return {
      limit: jest.fn(() => ({
        get: jest.fn().mockImplementation(async () => {
          let store: Record<string, any> = {};
          if (collName === 'returns') store = mockReturns;
          const foundKey = Object.keys(store).find((k) => filters.every((f) => store[k][f.field] === f.val));
          if (foundKey) {
            return { empty: false, docs: [{ id: foundKey, data: () => store[foundKey] }] };
          }
          return { empty: true, docs: [] };
        }),
      })),
      get: jest.fn().mockImplementation(async () => {
        let store: Record<string, any> = {};
        if (collName === 'returns') store = mockReturns;
        const docs = Object.keys(store)
          .filter((k) => filters.every((f) => store[k][f.field] === f.val))
          .map((k) => ({ id: k, data: () => store[k] }));
        return { docs, empty: docs.length === 0 };
      }),
    };
  };

  const mockDoc = (collName: string, docId: string) => {
    return {
      get: jest.fn().mockImplementation(async () => {
        let data: any = null;
        if (collName === 'bills') data = mockBills[docId];
        else if (collName === 'products') data = mockProducts[docId];
        else if (collName === 'customers') data = mockCustomers[docId];
        else if (collName === 'returns') data = mockReturns[docId];

        return {
          exists: !!data,
          id: docId,
          data: () => data,
        };
      }),
      set: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'returns') mockReturns[docId] = data;
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'products' && mockProducts[docId]) {
          if (data.currentStock && typeof data.currentStock === 'object' && data.currentStock.operand) {
            mockProducts[docId].currentStock = (mockProducts[docId].currentStock || 0) + data.currentStock.operand;
          } else if (typeof data.currentStock === 'number') {
            mockProducts[docId].currentStock = data.currentStock;
          }
        } else if (collName === 'bills' && mockBills[docId]) {
          mockBills[docId] = { ...mockBills[docId], ...data };
        } else if (collName === 'customers' && mockCustomers[docId]) {
          mockCustomers[docId] = { ...mockCustomers[docId], ...data };
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
                if (subColl === 'ledger') {
                  if (!mockLedgers[key]) mockLedgers[key] = [];
                  mockLedgers[key].push({ id: entryId, ...entryData });
                } else if (subColl === 'stockLedger') {
                  if (!mockStockLedgers[key]) mockStockLedgers[key] = [];
                  mockStockLedgers[key].push({ id: entryId, ...entryData });
                }
              }),
            };
          }),
        };
      }),
    };
  };

  return {
    ...originalModule,
    FieldValue: {
      increment: (n: number) => ({ operand: n }),
    },
    adminAuth: {
      verifyIdToken: jest.fn(),
    },
    firestore: {
      collection: jest.fn((collName: string) => {
        if (collName === 'auditLogs') {
          return {
            add: jest.fn().mockImplementation(async (logData: any) => {
              mockAuditLogs.push(logData);
              return { id: `log_${mockAuditLogs.length}` };
            }),
          };
        }
        return {
          doc: jest.fn((id?: string) => {
            const actualId = id || `doc_${Date.now()}`;
            return mockDoc(collName, actualId);
          }),
          where: jest.fn((field: string, op: string, val: any) => {
            return mockQuery(collName, [{ field, op, val }]);
          }),
          orderBy: jest.fn(() => ({
            get: jest.fn().mockImplementation(async () => {
              const store = collName === 'returns' ? mockReturns : mockBills;
              const docs = Object.keys(store).map((id) => ({ id, data: () => store[id] }));
              return { docs, empty: docs.length === 0 };
            }),
          })),
        };
      }),
      runTransaction: jest.fn().mockImplementation(async (updateFunction: any) => {
        const mockTransaction = {
          get: async (ref: any) => {
            return ref.get();
          },
          set: (ref: any, data: any) => {
            ref.set(data);
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

describe('Phase 10 — Returns & Stock Reversal Unit & Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(mockBills)) delete mockBills[k];
    for (const k of Object.keys(mockProducts)) delete mockProducts[k];
    for (const k of Object.keys(mockCustomers)) delete mockCustomers[k];
    for (const k of Object.keys(mockReturns)) delete mockReturns[k];
    for (const k of Object.keys(mockLedgers)) delete mockLedgers[k];
    for (const k of Object.keys(mockStockLedgers)) delete mockStockLedgers[k];
    mockAuditLogs.length = 0;

    // Seed mock data
    mockProducts['p1'] = {
      name: 'Wheat Flour',
      unitType: 'COUNT',
      baseUnit: 'pc',
      displayUnit: 'kg',
      unitConversionFactor: 1,
      purchasePrice: 40,
      sellingPrice: 50,
      currentStock: 10,
      isActive: true,
    };

    mockProducts['p2'] = {
      name: 'Mustard Oil',
      unitType: 'COUNT',
      baseUnit: 'pc',
      displayUnit: 'L',
      unitConversionFactor: 1,
      purchasePrice: 100,
      sellingPrice: 120,
      currentStock: 20,
      isActive: true,
    };

    mockCustomers['c1'] = {
      name: 'Anil Kumar',
      phone: '9988776655',
      outstandingBalance: 1000,
      isActive: true,
    };

    mockBills['b1'] = {
      billNumber: 101,
      customerId: 'c1',
      workerId: 'w1',
      items: [
        {
          productId: 'p1',
          productName: 'Wheat Flour',
          qty: 5,
          qtyBaseUnit: 5,
          unit: 'kg',
          sellingPriceSnapshot: 50,
          costPriceSnapshot: 40,
          lineTotal: 250,
          returnedQty: 0,
        },
        {
          productId: 'p2',
          productName: 'Mustard Oil',
          qty: 2,
          qtyBaseUnit: 2,
          unit: 'L',
          sellingPriceSnapshot: 120,
          costPriceSnapshot: 100,
          lineTotal: 240,
          returnedQty: 0,
        },
      ],
      subtotal: 490,
      discount: 0,
      totalAmount: 490,
      paymentStatus: 'CREDIT',
      paymentBreakdown: { cash: 0, upi: 0, other: 0, credit: 490 },
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };
  });

  describe('Security & Authorization (RBAC)', () => {
    it('1. should reject unauthenticated return requests (401)', async () => {
      const res = await request(app).post('/api/v1/returns').send({
        originalBillId: 'b1',
        items: [{ productId: 'p1', qty: 2 }],
        refundMethod: 'CASH',
        reason: 'Defective packaging',
      });

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('2. should reject WORKER role from processing a return (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer worker-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 2 }],
          refundMethod: 'CASH',
          reason: 'Worker attempt',
        });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. should allow OWNER role to process a return (200 OK)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 2 }],
          refundMethod: 'CASH',
          reason: 'Customer changed mind',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Return Quantity Guard & Validation', () => {
    it('4. should reject return if product is not in original bill (400 PRODUCT_NOT_IN_BILL)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p_unknown', qty: 1 }],
          refundMethod: 'CASH',
          reason: 'Wrong item',
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('PRODUCT_NOT_IN_BILL');
    });

    it('5. should reject return if requested quantity exceeds returnable quantity (409 EXCEEDS_RETURNABLE_QUANTITY)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 10 }], // Sold: 5, Requested: 10
          refundMethod: 'CASH',
          reason: 'Excess return request',
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('EXCEEDS_RETURNABLE_QUANTITY');
      expect(mockProducts['p1'].currentStock).toBe(10); // Unchanged
    });

    it('6. should reject repeated returns exceeding original quantity across multiple attempts', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      // First return: 4 out of 5 items
      await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 4 }],
          refundMethod: 'CASH',
          reason: 'First return of 4',
        });

      // Second return attempt: 2 items (only 1 remaining returnable)
      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 2 }],
          refundMethod: 'CASH',
          reason: 'Second return attempt',
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('EXCEEDS_RETURNABLE_QUANTITY');
    });
  });

  describe('Partial Return & Stock Restoration', () => {
    it('7. should restock inventory, update returnedQty, set status to PARTIALLY_RETURNED, and write RETURN stock ledger entry', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 3 }],
          refundMethod: 'CASH',
          reason: 'Partial return of 3kg flour',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.updatedBillStatus).toBe('PARTIALLY_RETURNED');
      expect(res.body.data.returnRecord.totalRefund).toBe(150); // 3 * 50

      // Stock increased from 10 to 13
      expect(mockProducts['p1'].currentStock).toBe(13);

      // Bill line returnedQty updated to 3
      expect(mockBills['b1'].items[0].returnedQty).toBe(3);
      expect(mockBills['b1'].status).toBe('PARTIALLY_RETURNED');

      // Stock ledger entry recorded
      const stockLedgerKey = 'products_p1_stockLedger';
      expect(mockStockLedgers[stockLedgerKey]).toHaveLength(1);
      expect(mockStockLedgers[stockLedgerKey][0].type).toBe('RETURN');
      expect(mockStockLedgers[stockLedgerKey][0].quantityChangeBaseUnit).toBe(3);

      // Audit log recorded
      expect(mockAuditLogs).toHaveLength(1);
      expect(mockAuditLogs[0].action).toBe('PROCESS_RETURN');
    });
  });

  describe('Full Return & Udhaar Credit Reversal', () => {
    it('8. should perform full reversal, set status to REVERSED, write RETURN_CREDIT customer ledger entry, and update customer.outstandingBalance', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          originalBillId: 'b1',
          items: [
            { productId: 'p1', qty: 5 },
            { productId: 'p2', qty: 2 },
          ],
          refundMethod: 'CREDIT',
          reason: 'Full order returned',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.updatedBillStatus).toBe('REVERSED');
      expect(res.body.data.returnRecord.totalRefund).toBe(490); // (5*50) + (2*120) = 250 + 240
      expect(res.body.data.resultingBalance).toBe(510); // 1000 - 490

      // Inventory restocked
      expect(mockProducts['p1'].currentStock).toBe(15); // 10 + 5
      expect(mockProducts['p2'].currentStock).toBe(22); // 20 + 2

      // Bill status updated to REVERSED
      expect(mockBills['b1'].status).toBe('REVERSED');

      // Customer outstanding balance updated
      expect(mockCustomers['c1'].outstandingBalance).toBe(510);

      // Customer RETURN_CREDIT ledger entry written
      const customerLedgerKey = 'customers_c1_ledger';
      expect(mockLedgers[customerLedgerKey]).toHaveLength(1);
      expect(mockLedgers[customerLedgerKey][0].type).toBe('RETURN_CREDIT');
      expect(mockLedgers[customerLedgerKey][0].amount).toBe(490);
      expect(mockLedgers[customerLedgerKey][0].resultingBalance).toBe(510);
    });
  });

  describe('Idempotency Replay', () => {
    it('9. should return idempotentReplay when same idempotencyKey is replayed', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      mockReturns['ret_existing'] = {
        originalBillId: 'b1',
        items: [{ productId: 'p1', qty: 2, qtyBaseUnit: 2, refundAmount: 100 }],
        totalRefund: 100,
        refundMethod: 'CASH',
        reason: 'Initial return',
        processedBy: 'o1',
        idempotencyKey: 'c80e8400-e29b-41d4-a716-446655441111',
        createdAt: new Date().toISOString(),
        updatedBillStatus: 'PARTIALLY_RETURNED',
      };

      const res = await request(app)
        .post('/api/v1/returns')
        .set('Authorization', 'Bearer owner-token')
        .send({
          idempotencyKey: 'c80e8400-e29b-41d4-a716-446655441111',
          originalBillId: 'b1',
          items: [{ productId: 'p1', qty: 2 }],
          refundMethod: 'CASH',
          reason: 'Initial return',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.idempotentReplay).toBe(true);
      expect(res.body.data.returnRecord.totalRefund).toBe(100);
    });
  });
});
