import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

const mockCustomers: Record<string, any> = {};
const mockLedgers: Record<string, any[]> = {};
const mockAuditLogs: any[] = [];

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockQuery = (collName: string, filters: { field: string; op: string; val: any }[]): any => {
    return {
      where: jest.fn((field2: string, op2: string, val2: any) => {
        return mockQuery(collName, [...filters, { field: field2, op: op2, val: val2 }]);
      }),
      orderBy: jest.fn(() => ({
        get: jest.fn().mockImplementation(async () => {
          let docs: any[] = [];
          if (collName === 'auditLogs') {
            docs = mockAuditLogs
              .filter((log) => filters.every((f) => log[f.field] === f.val))
              .map((log, index) => ({ id: `log_${index}`, data: () => log }));
          }
          return { docs, empty: docs.length === 0 };
        }),
      })),
      get: jest.fn().mockImplementation(async () => {
        let docs: any[] = [];
        if (collName === 'auditLogs') {
          docs = mockAuditLogs
            .filter((log) => filters.every((f) => log[f.field] === f.val))
            .map((log, index) => ({ id: `log_${index}`, data: () => log }));
        }
        return { docs, empty: docs.length === 0 };
      }),
    };
  };

  const mockDoc = (collName: string, docId: string) => {
    return {
      get: jest.fn().mockImplementation(async () => {
        const data = collName === 'customers' ? mockCustomers[docId] : null;
        return {
          exists: !!data,
          id: docId,
          data: () => data,
        };
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'customers' && mockCustomers[docId]) {
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
                if (!mockLedgers[key]) mockLedgers[key] = [];
                mockLedgers[key].push({ id: entryId, ...entryData });
              }),
            };
          }),
          orderBy: jest.fn(() => ({
            get: jest.fn().mockImplementation(async () => {
              const key = `${collName}_${docId}_${subColl}`;
              const entries = mockLedgers[key] || [];
              return {
                docs: entries.map((e) => ({ id: e.id, data: () => e })),
              };
            }),
          })),
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
        if (collName === 'auditLogs') {
          return {
            add: jest.fn().mockImplementation(async (logData: any) => {
              mockAuditLogs.push(logData);
              return { id: `log_${mockAuditLogs.length}` };
            }),
            where: jest.fn((field: string, op: string, val: any) => {
              return mockQuery('auditLogs', [{ field, op, val }]);
            }),
            orderBy: jest.fn(() => ({
              get: jest.fn().mockImplementation(async () => {
                return {
                  docs: mockAuditLogs.map((log, index) => ({ id: `log_${index}`, data: () => log })),
                };
              }),
            })),
          };
        }
        return {
          doc: jest.fn((id?: string) => {
            const actualId = id || `doc_${Date.now()}`;
            return mockDoc(collName, actualId);
          }),
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

describe('Phase 9 — Audit Logging & Manual Ledger Adjustments Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(mockCustomers)) delete mockCustomers[k];
    for (const k of Object.keys(mockLedgers)) delete mockLedgers[k];
    mockAuditLogs.length = 0;

    mockCustomers['c1'] = {
      name: 'Suresh Sharma',
      phone: '9876543210',
      outstandingBalance: 5000,
      isActive: true,
    };
  });

  describe('Security & Authorization (RBAC)', () => {
    it('1. should reject unauthenticated adjustment requests (401)', async () => {
      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .send({
          customerId: 'c1',
          amount: 500,
          direction: 'CREDIT',
          reason: 'Correction for overcharge',
        });

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('2. should reject WORKER role from posting manual ledger adjustments (403)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer worker-token')
        .send({
          customerId: 'c1',
          amount: 500,
          direction: 'CREDIT',
          reason: 'Worker attempt',
        });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. should reject WORKER role from viewing customer full ledger history (403)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/customers/c1/ledger')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });

    it('4. should reject WORKER role from querying audit logs (403)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });
  });

  describe('Manual Ledger Adjustment Validation & Financial Integrity', () => {
    it('5. should reject adjustment if reason is missing (400 VALIDATION_ERROR)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 500,
          direction: 'CREDIT',
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('6. should reject adjustment if amount is 0 (400 VALIDATION_ERROR)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 0,
          direction: 'DEBIT',
          reason: 'Zero amount adjustment',
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
    });

    it('7. should reject adjustment resulting in negative balance (409 NEGATIVE_BALANCE_NOT_ALLOWED)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 6000,
          direction: 'CREDIT',
          reason: 'Excess credit attempt',
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('NEGATIVE_BALANCE_NOT_ALLOWED');
      expect(mockCustomers['c1'].outstandingBalance).toBe(5000); // Unchanged
    });

    it('8. should successfully process CREDIT adjustment, create ADJUSTMENT ledger entry with resultingBalance, update balance to 4000, and create audit log', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 1000,
          direction: 'CREDIT',
          reason: 'Waiver of dispute fee',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.previousBalance).toBe(5000);
      expect(res.body.data.resultingBalance).toBe(4000);
      expect(res.body.data.ledgerEntry.type).toBe('ADJUSTMENT');
      expect(res.body.data.ledgerEntry.resultingBalance).toBe(4000);
      expect(res.body.data.ledgerEntry.note).toBe('Waiver of dispute fee');

      // Customer balance updated
      expect(mockCustomers['c1'].outstandingBalance).toBe(4000);

      // Customer ledger entry saved
      const ledgerKey = 'customers_c1_ledger';
      expect(mockLedgers[ledgerKey]).toHaveLength(1);
      expect(mockLedgers[ledgerKey][0].type).toBe('ADJUSTMENT');
      expect(mockLedgers[ledgerKey][0].resultingBalance).toBe(4000);

      // Audit log created
      expect(mockAuditLogs).toHaveLength(1);
      expect(mockAuditLogs[0].action).toBe('MANUAL_LEDGER_ADJUSTMENT');
      expect(mockAuditLogs[0].beforeState.outstandingBalance).toBe(5000);
      expect(mockAuditLogs[0].afterState.outstandingBalance).toBe(4000);
      expect(mockAuditLogs[0].afterState.adjustmentReason).toBe('Waiver of dispute fee');
    });

    it('9. should successfully process DEBIT adjustment, increasing customer balance', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer owner-token')
        .send({
          customerId: 'c1',
          amount: 1500,
          direction: 'DEBIT',
          reason: 'Manual debit addition',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.previousBalance).toBe(5000);
      expect(res.body.data.resultingBalance).toBe(6500);
      expect(mockCustomers['c1'].outstandingBalance).toBe(6500);
    });
  });

  describe('Customer Ledger & Audit Log Retrieval (OWNER Only)', () => {
    it('10. should allow OWNER to retrieve full customer ledger history', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      // Post an adjustment first
      await request(app)
        .post('/api/v1/ledger/adjustment')
        .set('Authorization', 'Bearer owner-token')
        .send({ customerId: 'c1', amount: 500, direction: 'CREDIT', reason: 'Test history' });

      const res = await request(app)
        .get('/api/v1/customers/c1/ledger')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.ledger).toHaveLength(1);
      expect(res.body.data.ledger[0].type).toBe('ADJUSTMENT');
    });

    it('11. should allow OWNER to retrieve audit log entries', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.auditLogs).toBeDefined();
    });
  });
});
