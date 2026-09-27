import * as admin from 'firebase-admin';
import { getApps, initializeApp, cert, getApp } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { getStorage, Storage } from 'firebase-admin/storage';
import { env } from './env';
import { logger } from './logger';

let adminAuth: Auth;
let firestore: Firestore;
let adminMessaging: Messaging;
let adminStorage: Storage;

// In-memory mock database for local development fallback
const mockStore: Record<string, Map<string, any>> = {
  products: new Map([
    [
      'prod-001',
      {
        productId: 'prod-001',
        name: 'Basmati Rice 5kg',
        category: 'Grains',
        sku: 'RICE-5KG',
        unitType: 'BASE',
        baseUnit: 'g',
        displayUnit: 'kg',
        unitConversionFactor: 1000,
        purchasePrice: 300,
        sellingPrice: 350,
        currentStock: 25000,
        minimumStock: 5000,
        gstPercent: 5,
        supplierId: 'SUP-101',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      'prod-002',
      {
        productId: 'prod-002',
        name: 'Sugar 1kg',
        category: 'Groceries',
        sku: 'SUGAR-1KG',
        unitType: 'BASE',
        baseUnit: 'g',
        displayUnit: 'kg',
        unitConversionFactor: 1000,
        purchasePrice: 38,
        sellingPrice: 45,
        currentStock: 50000,
        minimumStock: 10000,
        gstPercent: 5,
        supplierId: 'SUP-102',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      'prod-003',
      {
        productId: 'prod-003',
        name: 'Sunflower Oil 1L',
        category: 'Oils',
        sku: 'OIL-1L',
        unitType: 'BASE',
        baseUnit: 'ml',
        displayUnit: 'L',
        unitConversionFactor: 1000,
        purchasePrice: 140,
        sellingPrice: 160,
        currentStock: 30000,
        minimumStock: 5000,
        gstPercent: 5,
        supplierId: 'SUP-103',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  ]),
  purchases: new Map(),
  stock_ledger: new Map(),
  users: new Map([
    [
      'owner-user-001',
      {
        uid: 'owner-user-001',
        role: 'OWNER',
        email: 'owner@kirana.com',
        name: 'Kirana Shop Owner',
        status: 'ACTIVE',
      },
    ],
    [
      'worker-user-001',
      {
        uid: 'worker-user-001',
        role: 'WORKER',
        email: 'worker@kirana.com',
        name: 'Shop Worker',
        status: 'ACTIVE',
        maxDiscountAmount: 500,
        maxDiscountPercent: 5,
      },
    ],
  ]),
};

const createMockFirestore = (): any => {
  const getCollection = (colName: string) => {
    if (!mockStore[colName]) {
      mockStore[colName] = new Map();
    }
    const storeMap = mockStore[colName];

    const collectionObj: any = {
      doc: (docId?: string) => {
        const id = docId || `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        return {
          id,
          get: async () => {
            const data = storeMap.get(id);
            return {
              exists: !!data,
              id,
              data: () => data,
            };
          },
          set: async (data: any, options?: any) => {
            const existing = storeMap.get(id) || {};
            const merged = options?.merge ? { ...existing, ...data } : data;
            storeMap.set(id, merged);
            return merged;
          },
          update: async (data: any) => {
            const existing = storeMap.get(id) || {};
            const merged = { ...existing, ...data };
            storeMap.set(id, merged);
            return merged;
          },
          delete: async () => {
            storeMap.delete(id);
          },
          collection: (subColName: string) => getCollection(`${colName}/${id}/${subColName}`),
        };
      },

      add: async (data: any) => {
        const id = data.productId || data.purchaseId || data.entryId || data.uid || `doc-${Date.now()}`;
        storeMap.set(id, { ...data, id });
        return { id, get: async () => ({ exists: true, data: () => storeMap.get(id) }) };
      },

      get: async () => {
        const docs = Array.from(storeMap.entries()).map(([id, data]) => ({
          id,
          exists: true,
          data: () => data,
        }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },

      where: (field: string, op: string, value: any) => {
        const queryObj: any = {
          get: async () => {
            const all = Array.from(storeMap.entries()).map(([id, data]) => ({ id, data }));
            const filtered = all.filter(({ data }) => {
              if (op === '==') return data[field] === value;
              if (op === '!=') return data[field] !== value;
              if (op === '>=') return data[field] >= value;
              if (op === '<=') return data[field] <= value;
              return true;
            });
            const docs = filtered.map(({ id, data }) => ({
              id,
              exists: true,
              data: () => data,
            }));
            return { docs, empty: docs.length === 0, size: docs.length };
          },
          orderBy: () => queryObj,
          limit: () => queryObj,
          where: (f2: string, op2: string, v2: any) => queryObj,
        };
        return queryObj;
      },
      orderBy: () => collectionObj,
      limit: () => collectionObj,
    };

    return collectionObj;
  };

  return {
    collection: getCollection,
    runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
      const transactionObj = {
        get: async (docRef: any) => docRef.get(),
        set: (docRef: any, data: any, options?: any) => docRef.set(data, options),
        update: (docRef: any, data: any) => docRef.update(data),
        delete: (docRef: any) => docRef.delete(),
      };
      return updateFunction(transactionObj);
    },
    getAll: async (...docRefs: any[]) => {
      return Promise.all(
        docRefs.map(async (ref) => {
          return ref.get();
        })
      );
    },
  };
};

if (getApps().length === 0) {
  try {
    const app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
    });
    adminAuth = getAuth(app);
    firestore = getFirestore(app);
    firestore.settings({ ignoreUndefinedProperties: true });
    adminMessaging = getMessaging(app);
    adminStorage = getStorage(app);
    logger.info('Firebase Admin SDK initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Firebase Admin SDK');
    if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
      logger.warn('Running with in-memory Firestore fallback for local development / testing');
      adminAuth = {} as Auth;
      firestore = createMockFirestore();
      adminMessaging = {} as Messaging;
      adminStorage = {} as Storage;
    } else {
      throw error;
    }
  }
} else {
  const app = getApp();
  adminAuth = getAuth(app);
  firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  adminMessaging = getMessaging(app);
  adminStorage = getStorage(app);
}

export { adminAuth, firestore, adminMessaging, adminStorage };
