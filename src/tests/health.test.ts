import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth } from '../config/firebase';

// Mock Firebase Admin Auth for unit tests
jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');
  return {
    ...originalModule,
    adminAuth: {
      verifyIdToken: jest.fn(),
    },
    firestore: {
      listCollections: jest.fn().mockResolvedValue([]),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false }),
        })),
      })),
    },
  };
});

describe('Health & Infrastructure Endpoints', () => {
  it('GET /health should return 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /ready should return 200 OK', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
  });

  it('GET /api/v1/health/health should return 200 OK', async () => {
    const res = await request(app).get('/api/v1/health/health');
    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
  });
});

describe('Authentication & RBAC Middleware Foundation', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/auth/me should return 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/auth/me should return 401 UNAUTHORIZED when Firebase ID token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/auth/me should return 200 OK when Firebase ID token is valid', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user123',
      role: 'OWNER',
      email: 'owner@shop.com',
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(HTTP_STATUS.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toEqual({
      uid: 'user123',
      role: 'OWNER',
      email: 'owner@shop.com',
    });
  });
});
