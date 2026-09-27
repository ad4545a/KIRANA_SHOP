import { firestore, adminMessaging } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { logger } from '../../config/logger';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { NotificationRecord } from './notification.types';
import { NotificationQueryDto } from './notification.dto';

export class NotificationService {
  /**
   * Creates notification document first (PRD §7 step 6a), then attempts FCM push (step 6b), and updates status (step 6c).
   * Safe fire-and-forget logic so messaging failures never throw errors to business operations.
   */
  public async createAndSendNotification(params: {
    type: string;
    title: string;
    message: string;
    referenceId: string;
    channel?: 'PUSH' | 'WHATSAPP';
    deviceToken?: string;
  }): Promise<NotificationRecord> {
    const now = new Date().toISOString();
    const docRef = firestore.collection(COLLECTIONS.NOTIFICATIONS).doc();
    const notificationId = docRef.id;

    const notificationData: Omit<NotificationRecord, 'notificationId'> = {
      type: params.type,
      title: params.title,
      message: params.message,
      referenceId: params.referenceId,
      channel: params.channel || 'PUSH',
      deliveryStatus: 'PENDING',
      isRead: false,
      createdAt: now,
      lastRetryAt: null,
    };

    // Step 6a: Create notifications/{id} doc FIRST with PENDING status
    await docRef.set(notificationData);

    // Step 6b & 6c: Fetch recipient device token (Owner) if not explicitly provided
    let recipientToken = params.deviceToken;
    if (!recipientToken) {
      try {
        const ownerSnap = await firestore
          .collection(COLLECTIONS.USERS)
          .where('role', '==', 'OWNER')
          .limit(1)
          .get();
        if (!ownerSnap.empty) {
          recipientToken = ownerSnap.docs[0].data().fcmToken;
        }
      } catch (e) {
        // Non-blocking token lookup fallback
      }
    }

    // Step 6b & 6c: Attempt FCM Push
    let deliveryStatus: 'PENDING' | 'SENT' | 'FAILED' = 'PENDING';
    if (adminMessaging && recipientToken) {
      try {
        await adminMessaging.send({
          token: recipientToken,
          notification: {
            title: params.title,
            body: params.message,
          },
          data: {
            type: params.type,
            referenceId: params.referenceId,
          },
        });
        deliveryStatus = 'SENT';
      } catch (err) {
        logger.warn({ err, notificationId }, 'FCM push delivery failed, marking as FAILED for cron retry');
        deliveryStatus = 'FAILED';
      }
    } else {
      // If no FCM token provided or messaging uninitialized (e.g. test env), mark as FAILED for retry sweep
      deliveryStatus = 'FAILED';
    }

    await docRef.update({
      deliveryStatus,
      updatedAt: now,
    });

    return {
      notificationId,
      ...notificationData,
      deliveryStatus,
    };
  }

  /**
   * List notifications for owner (PRD §4 & §14).
   */
  public async listNotifications(query: NotificationQueryDto): Promise<NotificationRecord[]> {
    let collectionRef: FirebaseFirestore.Query = firestore.collection(COLLECTIONS.NOTIFICATIONS);

    if (query.isRead !== undefined) {
      const readBool = query.isRead === 'true';
      collectionRef = collectionRef.where('isRead', '==', readBool);
    }

    const snapshot = await collectionRef.orderBy('createdAt', 'desc').get();
    let notifications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        notificationId: doc.id,
        type: data.type,
        title: data.title,
        message: data.message,
        referenceId: data.referenceId,
        channel: data.channel,
        deliveryStatus: data.deliveryStatus,
        isRead: data.isRead,
        createdAt: data.createdAt,
        lastRetryAt: data.lastRetryAt,
      } as NotificationRecord;
    });

    if (query.limit && !isNaN(Number(query.limit))) {
      notifications = notifications.slice(0, Number(query.limit));
    }

    return notifications;
  }

  /**
   * Mark notification as read (PRD §14).
   */
  public async markAsRead(notificationId: string, isRead: boolean): Promise<NotificationRecord> {
    const docRef = firestore.collection(COLLECTIONS.NOTIFICATIONS).doc(notificationId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError('Notification not found', HTTP_STATUS.NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
    }

    const now = new Date().toISOString();
    await docRef.update({
      isRead,
      updatedAt: now,
    });

    const updatedSnap = await docRef.get();
    const data = updatedSnap.data()!;
    return {
      notificationId: docRef.id,
      type: data.type,
      title: data.title,
      message: data.message,
      referenceId: data.referenceId,
      channel: data.channel,
      deliveryStatus: data.deliveryStatus,
      isRead: data.isRead,
      createdAt: data.createdAt,
      lastRetryAt: data.lastRetryAt,
    };
  }

  /**
   * Retry sweep job for PENDING/FAILED notifications created in last 24h (PRD §14).
   */
  public async retryFailedNotifications(deviceToken?: string): Promise<{ retriedCount: number; succeededCount: number }> {
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const snapshot = await firestore
      .collection(COLLECTIONS.NOTIFICATIONS)
      .where('deliveryStatus', 'in', ['PENDING', 'FAILED'])
      .get();

    const eligibleDocs = snapshot.docs.filter((doc) => (doc.data().createdAt || '') > cutoff24h);

    let retriedCount = 0;
    let succeededCount = 0;

    for (const doc of eligibleDocs) {
      retriedCount++;
      const data = doc.data();

      let deliveryStatus: 'SENT' | 'FAILED' = 'FAILED';
      if (adminMessaging && deviceToken) {
        try {
          await adminMessaging.send({
            token: deviceToken,
            notification: {
              title: data.title,
              body: data.message,
            },
            data: {
              type: data.type,
              referenceId: data.referenceId,
            },
          });
          deliveryStatus = 'SENT';
          succeededCount++;
        } catch (err) {
          deliveryStatus = 'FAILED';
        }
      }

      await doc.ref.update({
        deliveryStatus,
        lastRetryAt: nowIso,
      });
    }

    return { retriedCount, succeededCount };
  }
}

export const notificationService = new NotificationService();
