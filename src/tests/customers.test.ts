import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

const mockCustomers: Record<string, any> = {};

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockDoc = (docId: string) => {
    return {
      get: jest.fn().mockImplementation(async () => {
        const data = mockCustomers[docId];
        return {
          exists: !!data,
          id: docId,
          data: () => data,
        };
      }),
      set: jest.fn().mockImplementation(async (data: any) => {
        mockCustomers[docId] = data;
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        if (mockCustomers[docId]) {
          mockCustomers[docId] = { ...mockCustomers[docId], ...data };
        }
      }),
    };
  };

  return {
    ...originalModule,
    adminAuth: {
      verifyIdToken: jest.fn(),
    },
    firestore: {
      collection: jest.fn(() => {
        return {
          doc: jest.fn((id?: string) => {
            const actualId = id || `cust_${Object.keys(mockCustomers).length + 1}`;
            return mockDoc(actualId);
          }),
          where: jest.fn((field: string, op: string, val: any) => {
            return {
              where: jest.fn((field2: string, op2: string, val2: any) => {
                return {
                  get: jest.fn().mockImplementation(async () => {
                    const matchingDocs = Object.keys(mockCustomers)
                      .filter((id) => mockCustomers[id][field] === val && mockCustomers[id][field2] === val2)
                      .map((id) => ({
                        id,
                        data: () => mockCustomers[id],
                      }));
                    return { docs: matchingDocs };
                  }),
                };
              }),
              get: jest.fn().mockImplementation(async () => {
                const matchingDocs = Object.keys(mockCustomers)
                  .filter((id) => mockCustomers[id][field] === val)
                  .map((id) => ({
                    id,
                    data: () => mockCustomers[id],
                  }));
                return { docs: matchingDocs };
              }),
            };
          }),
          get: jest.fn().mockImplementation(async () => {
            const allDocs = Object.keys(mockCustomers).map((id) => ({
              id,
              data: () => mockCustomers[id],
            }));
            return { docs: allDocs };
          }),
        };
      }),
    },
  };
});

describe('Phase 5 — Customer Management Unit & Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockCustomers)) {
      delete mockCustomers[key];
    }
  });

  describe('1. Customer Creation (OWNER & WORKER)', () => {
    it('should allow WORKER to create a customer (PRD §4)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', 'Bearer worker-token')
        .send({
          name: 'Ramesh Kumar',
          phone: '9876543210',
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customer.name).toBe('Ramesh Kumar');
      expect(res.body.data.customer.outstandingBalance).toBe(0);
      expect(res.body.data.customer.isActive).toBe(true);
    });

    it('should allow OWNER to create a customer', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', 'Bearer owner-token')
        .send({
          name: 'Suresh Patel',
          phone: '9123456789',
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 VALIDATION_ERROR on short phone number', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', 'Bearer worker-token')
        .send({
          name: 'Short Phone Customer',
          phone: '123',
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 409 CUSTOMER_PHONE_EXISTS on duplicate active phone', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      mockCustomers['c1'] = {
        name: 'Existing Customer',
        phone: '9876543210',
        outstandingBalance: 0,
        totalPurchases: 0,
        totalBills: 0,
        isActive: true,
      };

      const res = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', 'Bearer worker-token')
        .send({
          name: 'New Customer Same Phone',
          phone: '9876543210',
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('CUSTOMER_PHONE_EXISTS');
    });
  });

  describe('2. Retrieval & Listing', () => {
    beforeEach(() => {
      mockCustomers['c1'] = {
        name: 'Anita Sharma',
        phone: '9988776655',
        outstandingBalance: 150,
        totalPurchases: 1200,
        totalBills: 5,
        isActive: true,
      };
    });

    it('should retrieve single customer by ID', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/customers/c1')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.customer.name).toBe('Anita Sharma');
      expect(res.body.data.customer.outstandingBalance).toBe(150);
    });

    it('should return 404 CUSTOMER_NOT_FOUND for non-existent customer', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/customers/c_missing')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('should list and search customers by name or phone', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/customers?search=Anita')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.customers).toHaveLength(1);
      expect(res.body.data.customers[0].phone).toBe('9988776655');
    });
  });

  describe('3. Updates & Deactivation', () => {
    beforeEach(() => {
      mockCustomers['c1'] = {
        name: 'Vikram Singh',
        phone: '9888877777',
        outstandingBalance: 0,
        totalPurchases: 0,
        totalBills: 0,
        isActive: true,
      };
    });

    it('should allow WORKER to update customer contact details', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .patch('/api/v1/customers/c1')
        .set('Authorization', 'Bearer worker-token')
        .send({
          name: 'Vikram Singh Updated',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.customer.name).toBe('Vikram Singh Updated');
    });

    it('should allow OWNER to deactivate a customer (soft delete)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .patch('/api/v1/customers/c1/status')
        .set('Authorization', 'Bearer owner-token')
        .send({
          isActive: false,
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.customer.isActive).toBe(false);
      expect(mockCustomers['c1']).toBeDefined(); // Soft-deleted record preserved
    });

    it('should deny WORKER from deactivating a customer (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .patch('/api/v1/customers/c1/status')
        .set('Authorization', 'Bearer worker-token')
        .send({
          isActive: false,
        });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
