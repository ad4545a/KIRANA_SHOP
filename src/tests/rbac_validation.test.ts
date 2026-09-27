import request from 'supertest';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { errorHandler } from '../middlewares/errorHandler';
import { requestIdMiddleware } from '../middlewares/requestId';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');
  return {
    ...originalModule,
    adminAuth: {
      verifyIdToken: jest.fn(),
    },
  };
});

describe('RBAC & Validation Middleware Unit Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  const testApp = express();
  testApp.use(express.json());
  testApp.use(requestIdMiddleware);

  const sampleSchema = {
    body: z.object({
      name: z.string().min(1, 'Name is required'),
      amount: z.number().positive('Amount must be positive'),
    }),
    query: z.object({
      page: z.string().optional(),
    }),
  };

  // Test routes
  testApp.post(
    '/test-validation',
    validate(sampleSchema),
    (_req: Request, res: Response) => {
      res.status(HTTP_STATUS.OK).json({ success: true });
    }
  );

  testApp.get(
    '/owner-only',
    authenticate,
    authorize('OWNER'),
    (_req: Request, res: Response) => {
      res.status(HTTP_STATUS.OK).json({ success: true, message: 'Welcome Owner' });
    }
  );

  testApp.get(
    '/owner-or-worker',
    authenticate,
    authorize('OWNER', 'WORKER'),
    (_req: Request, res: Response) => {
      res.status(HTTP_STATUS.OK).json({ success: true, message: 'Welcome User' });
    }
  );

  testApp.use(errorHandler);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validation Middleware', () => {
    it('should pass validation when body is valid', async () => {
      const res = await request(testApp)
        .post('/test-validation')
        .send({ name: 'Rice', amount: 100 });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });

    it('should fail validation (400) with details when body is invalid', async () => {
      const res = await request(testApp)
        .post('/test-validation')
        .send({ name: '', amount: -5 });

      expect(res.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toHaveLength(2);
    });
  });

  describe('RBAC Middleware', () => {
    it('should allow access to /owner-only for user with OWNER role', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'owner1',
        role: 'OWNER',
      });

      const res = await request(testApp)
        .get('/owner-only')
        .set('Authorization', 'Bearer valid-owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });

    it('should deny access (403 FORBIDDEN) to /owner-only for user with WORKER role', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'worker1',
        role: 'WORKER',
      });

      const res = await request(testApp)
        .get('/owner-only')
        .set('Authorization', 'Bearer valid-worker-token');

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow access to /owner-or-worker for WORKER role', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'worker1',
        role: 'WORKER',
      });

      const res = await request(testApp)
        .get('/owner-or-worker')
        .set('Authorization', 'Bearer valid-worker-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
    });

    it('should reject (403 FORBIDDEN) when user claim has no role', async () => {
      mockVerifyIdToken.mockResolvedValue({
        uid: 'noroleuser',
        // no role
      });

      const res = await request(testApp)
        .get('/owner-or-worker')
        .set('Authorization', 'Bearer valid-norole-token');

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
