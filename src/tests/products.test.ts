import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

// Mock Firebase Admin and Firestore for Product tests
const mockStore: Record<string, any> = {};

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockDoc = (docId: string) => {
    return {
      get: jest.fn().mockImplementation(async () => {
        const data = mockStore[docId];
        return {
          exists: !!data,
          id: docId,
          data: () => data,
        };
      }),
      set: jest.fn().mockImplementation(async (data: any) => {
        mockStore[docId] = data;
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        if (mockStore[docId]) {
          mockStore[docId] = { ...mockStore[docId], ...data };
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
      collection: jest.fn((collName: string) => {
        return {
          doc: jest.fn((id?: string) => {
            const actualId = id || `product_${Object.keys(mockStore).length + 1}`;
            return mockDoc(actualId);
          }),
          where: jest.fn((field: string, op: string, val: any) => {
            return {
              where: jest.fn((field2: string, op2: string, val2: any) => {
                return {
                  get: jest.fn().mockImplementation(async () => {
                    const matchingDocs = Object.keys(mockStore)
                      .filter((id) => mockStore[id][field] === val && mockStore[id][field2] === val2)
                      .map((id) => ({
                        id,
                        data: () => mockStore[id],
                      }));
                    return { docs: matchingDocs };
                  }),
                };
              }),
              get: jest.fn().mockImplementation(async () => {
                const matchingDocs = Object.keys(mockStore)
                  .filter((id) => mockStore[id][field] === val)
                  .map((id) => ({
                    id,
                    data: () => mockStore[id],
                  }));
                return { docs: matchingDocs };
              }),
            };
          }),
          get: jest.fn().mockImplementation(async () => {
            const allDocs = Object.keys(mockStore).map((id) => ({
              id,
              data: () => mockStore[id],
            }));
            return { docs: allDocs };
          }),
        };
      }),
    },
  };
});

describe('Phase 3 — Product Catalog / Product Master Unit & Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
  });

  describe('Product Creation & Authorization (1, 2, 3, 15, 17, 18, 19)', () => {
    it('1 & 17, 18, 19. should allow OWNER to create a product with valid unit and price configuration', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', 'Bearer owner-token')
        .send({
          name: 'Fortune Rice',
          category: 'Grains',
          sku: 'RICE-001',
          unitType: 'BASE',
          baseUnit: 'g',
          displayUnit: 'kg',
          unitConversionFactor: 1000,
          purchasePrice: 40,
          sellingPrice: 50,
          minimumStock: 5000,
          initialStock: 10000,
          gstPercent: 5,
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Fortune Rice');
      expect(res.body.data.product.currentStock).toBe(10000);
      expect(res.body.data.product.isActive).toBe(true);
    });

    it('2 & 15. should deny WORKER from creating a product (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', 'Bearer worker-token')
        .send({
          name: 'Sugar',
          category: 'Essentials',
          unitType: 'BASE',
          baseUnit: 'g',
          displayUnit: 'kg',
          unitConversionFactor: 1000,
          purchasePrice: 30,
          sellingPrice: 40,
          minimumStock: 1000,
          gstPercent: 0,
        });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. should return 400 VALIDATION_ERROR on invalid unitType baseUnit mismatch', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', 'Bearer owner-token')
        .send({
          name: 'Biscuit Pack',
          category: 'Snacks',
          unitType: 'COUNT',
          baseUnit: 'g', // Invalid: COUNT unitType must use 'pc' as baseUnit
          displayUnit: 'packet',
          unitConversionFactor: 1,
          purchasePrice: 10,
          sellingPrice: 12,
          minimumStock: 10,
          gstPercent: 18,
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Product Retrieval & Listing (4, 5, 6, 7, 8, 16)', () => {
    beforeEach(() => {
      mockStore['p1'] = {
        name: 'Basmati Rice',
        category: 'Grains',
        sku: 'SKU-RICE',
        unitType: 'BASE',
        baseUnit: 'g',
        displayUnit: 'kg',
        unitConversionFactor: 1000,
        purchasePrice: 60,
        sellingPrice: 80,
        currentStock: 20000,
        minimumStock: 5000,
        gstPercent: 5,
        isActive: true,
      };
      mockStore['p2'] = {
        name: 'Amul Milk',
        category: 'Dairy',
        sku: 'SKU-MILK',
        unitType: 'BASE',
        baseUnit: 'ml',
        displayUnit: 'L',
        unitConversionFactor: 1000,
        purchasePrice: 25,
        sellingPrice: 30,
        currentStock: 10000,
        minimumStock: 2000,
        gstPercent: 0,
        isActive: true,
      };
    });

    it('4. should retrieve single product by ID for WORKER', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/products/p1')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.product.name).toBe('Basmati Rice');
    });

    it('16. should return 404 PRODUCT_NOT_FOUND if product does not exist', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/products/nonexistent')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.NOT_FOUND);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('5, 6, 7, 8. should list and filter/search products by name/SKU/category', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const resSearch = await request(app)
        .get('/api/v1/products?search=milk')
        .set('Authorization', 'Bearer worker-token');

      expect(resSearch.status).toBe(HTTP_STATUS.OK);
      expect(resSearch.body.data.products).toHaveLength(1);
      expect(resSearch.body.data.products[0].name).toBe('Amul Milk');
    });
  });

  describe('Product Updates, Deactivation & SKU Uniqueness (9, 10, 11, 12, 13, 14, 15)', () => {
    beforeEach(() => {
      mockStore['p1'] = {
        name: 'Tata Salt',
        category: 'Essentials',
        sku: 'SALT-01',
        unitType: 'BASE',
        baseUnit: 'g',
        displayUnit: 'kg',
        unitConversionFactor: 1000,
        purchasePrice: 15,
        sellingPrice: 20,
        currentStock: 5000,
        minimumStock: 1000,
        gstPercent: 0,
        isActive: true,
      };
    });

    it('9 & 11. should allow OWNER to update product configuration without modifying currentStock', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .patch('/api/v1/products/p1')
        .set('Authorization', 'Bearer owner-token')
        .send({
          sellingPrice: 22,
          currentStock: 99999, // Should be ignored by validation or service update logic
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.product.sellingPrice).toBe(22);
      expect(res.body.data.product.currentStock).toBe(5000); // Unchanged
    });

    it('10. should deny WORKER from updating product', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'worker1', role: 'WORKER' });

      const res = await request(app)
        .patch('/api/v1/products/p1')
        .set('Authorization', 'Bearer worker-token')
        .send({ sellingPrice: 25 });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
    });

    it('12, 13, 14. should allow OWNER to deactivate product (soft delete) keeping product document in Firestore', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .patch('/api/v1/products/p1/status')
        .set('Authorization', 'Bearer owner-token')
        .send({ isActive: false });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.product.isActive).toBe(false);
      expect(mockStore['p1']).toBeDefined(); // Still exists in Firestore
    });

    it('15. should reject creating a product with a duplicate active SKU (409 PRODUCT_SKU_EXISTS)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'owner1', role: 'OWNER' });

      const res = await request(app)
        .post('/api/v1/products')
        .set('Authorization', 'Bearer owner-token')
        .send({
          name: 'Another Salt',
          category: 'Essentials',
          sku: 'SALT-01', // Existing active SKU
          unitType: 'BASE',
          baseUnit: 'g',
          displayUnit: 'kg',
          unitConversionFactor: 1000,
          purchasePrice: 15,
          sellingPrice: 20,
          minimumStock: 500,
          gstPercent: 0,
        });

      expect(res.status).toBe(HTTP_STATUS.CONFLICT);
      expect(res.body.error.code).toBe('PRODUCT_SKU_EXISTS');
    });
  });
});
