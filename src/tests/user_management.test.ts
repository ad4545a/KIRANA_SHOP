import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth, firestore } from '../config/firebase';

// Mock Firebase Admin
jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');
  
  const mockGet = jest.fn();
  const mockSet = jest.fn().mockResolvedValue({});
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockDoc = jest.fn(() => ({
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
  }));
  const mockWhere = jest.fn(() => ({
    get: jest.fn().mockResolvedValue({
      docs: [
        {
          id: 'worker1',
          data: () => ({
            name: 'Worker One',
            phone: '9876543210',
            role: 'WORKER',
            status: 'ACTIVE',
            maxDiscountAmount: 50,
            maxDiscountPercent: 5,
          }),
        },
      ],
    }),
  }));

  return {
    ...originalModule,
    adminAuth: {
      verifyIdToken: jest.fn(),
      createUser: jest.fn(),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      updateUser: jest.fn().mockResolvedValue({}),
      deleteUser: jest.fn().mockResolvedValue({}),
    },
    firestore: {
      collection: jest.fn(() => ({
        doc: mockDoc,
        where: mockWhere,
      })),
      listCollections: jest.fn().mockResolvedValue([]),
    },
    _mockDoc: mockDoc,
    _mockGet: mockGet,
  };
});

describe('Phase 2 — Auth & User Management Unit / Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;
  const mockCreateUser = adminAuth.createUser as jest.Mock;
  const mockSetCustomUserClaims = adminAuth.setCustomUserClaims as jest.Mock;
  const mockUpdateAuthUser = adminAuth.updateUser as jest.Mock;

  const mockGet = (require('../config/firebase') as any)._mockGet;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1 & 2. Authentication Token Verification', () => {
    it('1. should return 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2. should return 401 when token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3, 4 & 12. Valid Token Claims & GET /auth/me', () => {
    it('3 & 12. should authenticate OWNER and return safe profile information', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner123',
        role: 'OWNER',
        email: 'owner@shop.com',
      });
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          name: 'Shop Owner',
          phone: '9999999999',
          role: 'OWNER',
          status: 'ACTIVE',
        }),
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toEqual({
        uid: 'owner123',
        role: 'OWNER',
        email: 'owner@shop.com',
        name: 'Shop Owner',
        phone: '9999999999',
        status: 'ACTIVE',
      });
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('4. should authenticate WORKER with valid token', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'worker123',
        role: 'WORKER',
        email: 'worker@shop.com',
      });
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          name: 'Shop Worker',
          phone: '8888888888',
          role: 'WORKER',
          status: 'ACTIVE',
        }),
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-worker-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });
  });

  describe('5 & 6. RBAC Middleware Enforcement on User Management Endpoints', () => {
    it('5 & 11. should deny WORKER access to worker creation endpoint (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'worker123',
        role: 'WORKER',
      });

      const res = await request(app)
        .post('/api/v1/users/workers')
        .set('Authorization', 'Bearer worker-token')
        .send({
          email: 'newworker@shop.com',
          password: 'password123',
          name: 'New Worker',
          phone: '9876543210',
        });

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('6. should allow OWNER access to list workers', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner123',
        role: 'OWNER',
      });

      const res = await request(app)
        .get('/api/v1/users/workers')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workers).toBeDefined();
    });
  });

  describe('8 & 9. Validation & Worker Creation', () => {
    it('8. should return 400 VALIDATION_ERROR when invalid worker data is submitted', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner123',
        role: 'OWNER',
      });

      const res = await request(app)
        .post('/api/v1/users/workers')
        .set('Authorization', 'Bearer owner-token')
        .send({
          email: 'not-an-email',
          password: '123', // too short
          name: '',
          phone: '123',
        });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('9. should create worker and set custom claim WORKER server-side without trusting client role', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner123',
        role: 'OWNER',
      });
      mockCreateUser.mockResolvedValue({
        uid: 'generated-worker-uid',
      });

      const res = await request(app)
        .post('/api/v1/users/workers')
        .set('Authorization', 'Bearer owner-token')
        .send({
          email: 'worker.new@shop.com',
          password: 'securepassword123',
          name: 'New Worker',
          phone: '9876543210',
          role: 'ATTEMPT_OWNER_OVERRIDE', // client payload role must be ignored/validated by schema
          maxDiscountAmount: 100,
          maxDiscountPercent: 10,
        });

      expect(res.status).toBe(HTTP_STATUS.CREATED);
      expect(res.body.success).toBe(true);
      expect(mockSetCustomUserClaims).toHaveBeenCalledWith('generated-worker-uid', { role: 'WORKER' });
      expect(res.body.data.worker.role).toBe('WORKER');
      expect(res.body.data.worker.userId).toBe('generated-worker-uid');
    });
  });

  describe('10. Discount Limits & Disabling Workers', () => {
    it('10. should allow OWNER to configure worker discount limits', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner123',
        role: 'OWNER',
      });
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          name: 'Worker 1',
          phone: '9876543210',
          role: 'WORKER',
          status: 'ACTIVE',
          maxDiscountAmount: 50,
          maxDiscountPercent: 5,
        }),
      });

      const res = await request(app)
        .patch('/api/v1/users/workers/worker123/discount-limit')
        .set('Authorization', 'Bearer owner-token')
        .send({
          maxDiscountAmount: 200,
          maxDiscountPercent: 15,
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });

    it('should allow OWNER to disable a worker account', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner123',
        role: 'OWNER',
      });
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({
          name: 'Worker 1',
          phone: '9876543210',
          role: 'WORKER',
          status: 'INACTIVE',
        }),
      });

      const res = await request(app)
        .patch('/api/v1/users/workers/worker123/status')
        .set('Authorization', 'Bearer owner-token')
        .send({
          status: 'INACTIVE',
        });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(mockUpdateAuthUser).toHaveBeenCalledWith('worker123', { disabled: true });
    });
  });
});
