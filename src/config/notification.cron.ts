import cron, { ScheduledTask } from 'node-cron';
import { notificationService } from '../modules/notifications/notification.service';
import { logger } from './logger';
import { env } from './env';

let notificationCronTask: ScheduledTask | null = null;

export function initNotificationCron(ownerDeviceToken?: string): void {
  // node-cron, every few minutes (e.g. '*/5 * * * *') per PRD §14
  if (env.NODE_ENV === 'test') {
    return; // Don't start background timers in unit test mode
  }

  notificationCronTask = cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('Running background cron: notification retry sweep...');
      const result = await notificationService.retryFailedNotifications(ownerDeviceToken);
      logger.info(result, 'Notification retry sweep completed');
    } catch (error) {
      logger.error({ error }, 'Error in notification retry sweep cron job');
    }
  });

  logger.info('Notification retry cron job scheduled (every 5 minutes)');
}

export function stopNotificationCron(): void {
  if (notificationCronTask) {
    notificationCronTask.stop();
    logger.info('Notification retry cron job stopped');
  }
}
