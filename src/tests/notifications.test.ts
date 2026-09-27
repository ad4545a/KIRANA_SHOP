import request from 'supertest';
import app from '../app';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { adminAuth, adminMessaging } from '../config/firebase';
import { notificationService } from '../modules/notifications/notification.service';

const mockNotifications: Record<string, any> = {};

jest.mock('../config/firebase', () => {
  const originalModule = jest.requireActual('../config/firebase');

  const mockDoc = (collName: string, docId?: string) => {
    const actualId = docId || `notif_${Math.random().toString(36).substring(2, 9)}`;
    return {
      id: actualId,
      get: jest.fn().mockImplementation(async () => {
        const data = collName === 'notifications' ? mockNotifications[actualId] : null;
        return {
          exists: !!data,
          id: actualId,
          data: () => data,
        };
      }),
      set: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'notifications') mockNotifications[actualId] = data;
      }),
      update: jest.fn().mockImplementation(async (data: any) => {
        if (collName === 'notifications' && mockNotifications[actualId]) {
          mockNotifications[actualId] = { ...mockNotifications[actualId], ...data };
        }
      }),
    };
  };

  return {
    ...originalModule,
    adminAuth: {
      verifyIdToken: jest.fn(),
    },
    adminMessaging: {
      send: jest.fn(),
    },
    firestore: {
      collection: jest.fn((collName: string) => {
        return {
          doc: jest.fn((id?: string) => {
            return mockDoc(collName, id);
          }),
          where: jest.fn((field: string, op: string, val: any) => {
            return {
              get: jest.fn().mockImplementation(async () => {
                let matching = Object.keys(mockNotifications);
                if (op === '==' || op === 'in') {
                  const matchVals = Array.isArray(val) ? val : [val];
                  matching = matching.filter((k) => matchVals.includes(mockNotifications[k][field]));
                }
                const docs = matching.map((k) => ({
                  id: k,
                  data: () => mockNotifications[k],
                  ref: mockDoc('notifications', k),
                }));
                return { docs, empty: docs.length === 0 };
              }),
            };
          }),
          orderBy: jest.fn(() => ({
            get: jest.fn().mockImplementation(async () => {
              const docs = Object.keys(mockNotifications).map((k) => ({
                id: k,
                data: () => mockNotifications[k],
              }));
              return { docs, empty: docs.length === 0 };
            }),
          })),
        };
      }),
    },
  };
});

describe('Phase 11 — Owner Notifications & Notification Retry System Integration Tests', () => {
  const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock;
  const mockSendFCM = adminMessaging.send as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(mockNotifications)) delete mockNotifications[k];
  });

  describe('Security & Authorization (RBAC)', () => {
    it('1. should reject unauthenticated notification list requests (401)', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(HTTP_STATUS.UNAUTHORIZED);
    });

    it('2. should reject WORKER role from reading notifications (403 FORBIDDEN)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'w1', role: 'WORKER' });

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', 'Bearer worker-token');

      expect(res.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3. should allow OWNER role to list notifications (200 OK)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', 'Bearer owner-token');

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toBeDefined();
    });
  });

  describe('Notification Creation & Order (PRD §7 step 6)', () => {
    it('4. should create doc first with PENDING status, attempt FCM push, and update to SENT on success', async () => {
      mockSendFCM.mockResolvedValue('msg-id-123');

      const notif = await notificationService.createAndSendNotification({
        type: 'NEW_BILL',
        title: 'New Sale: Bill #101',
        message: 'New bill #101 created for ₹500',
        referenceId: 'b101',
        channel: 'PUSH',
        deviceToken: 'owner-fcm-token',
      });

      expect(notif.deliveryStatus).toBe('SENT');
      expect(mockSendFCM).toHaveBeenCalledWith({
        token: 'owner-fcm-token',
        notification: {
          title: 'New Sale: Bill #101',
          body: 'New bill #101 created for ₹500',
        },
        data: {
          type: 'NEW_BILL',
          referenceId: 'b101',
        },
      });

      expect(mockNotifications[notif.notificationId].deliveryStatus).toBe('SENT');
    });

    it('5. should set status to FAILED when FCM push fails, leaving doc persisted for cron retry', async () => {
      mockSendFCM.mockRejectedValue(new Error('Messaging service unavailable'));

      const notif = await notificationService.createAndSendNotification({
        type: 'PAYMENT_RECEIVED',
        title: 'Payment Received: ₹1000',
        message: 'Payment received via UPI',
        referenceId: 'p101',
        channel: 'PUSH',
        deviceToken: 'invalid-token',
      });

      expect(notif.deliveryStatus).toBe('FAILED');
      expect(mockNotifications[notif.notificationId]).toBeDefined();
      expect(mockNotifications[notif.notificationId].deliveryStatus).toBe('FAILED');
    });
  });

  describe('Notification Management & Status Update', () => {
    it('6. should allow OWNER to mark notification as read (PATCH /api/v1/notifications/:id)', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'o1', role: 'OWNER' });

      mockNotifications['n1'] = {
        type: 'NEW_BILL',
        title: 'Bill #102',
        message: 'New bill created',
        referenceId: 'b102',
        channel: 'PUSH',
        deliveryStatus: 'SENT',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      const res = await request(app)
        .patch('/api/v1/notifications/n1')
        .set('Authorization', 'Bearer owner-token')
        .send({ isRead: true });

      expect(res.status).toBe(HTTP_STATUS.OK);
      expect(res.body.data.notification.isRead).toBe(true);
      expect(mockNotifications['n1'].isRead).toBe(true);
    });
  });

  describe('Notification Retry Sweep Cron (PRD §14)', () => {
    it('7. should pick up FAILED notifications created within 24h and retry FCM delivery', async () => {
      const now = new Date().toISOString();
      mockNotifications['n_failed'] = {
        type: 'NEW_BILL',
        title: 'Failed Notification',
        message: 'Retry test message',
        referenceId: 'b999',
        channel: 'PUSH',
        deliveryStatus: 'FAILED',
        isRead: false,
        createdAt: now,
      };

      mockSendFCM.mockResolvedValue('msg-id-retry-ok');

      const result = await notificationService.retryFailedNotifications('owner-token-valid');

      expect(result.retriedCount).toBe(1);
      expect(result.succeededCount).toBe(1);
      expect(mockNotifications['n_failed'].deliveryStatus).toBe('SENT');
      expect(mockNotifications['n_failed'].lastRetryAt).toBeDefined();
    });
  });
});
