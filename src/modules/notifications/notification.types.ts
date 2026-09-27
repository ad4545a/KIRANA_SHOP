export type NotificationChannel = 'PUSH' | 'WHATSAPP';
export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface NotificationRecord {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  referenceId: string;
  channel: NotificationChannel;
  deliveryStatus: NotificationDeliveryStatus;
  isRead: boolean;
  createdAt: string;
  lastRetryAt?: string | null;
}
