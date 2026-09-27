import { z } from 'zod';

export const notificationQuerySchema = z.object({
  isRead: z.string().optional(),
  limit: z.string().optional(),
});

export const updateNotificationStatusSchema = z.object({
  isRead: z.boolean({ required_error: 'isRead is required' }),
});

export type NotificationQueryDto = z.infer<typeof notificationQuerySchema>;
export type UpdateNotificationStatusDto = z.infer<typeof updateNotificationStatusSchema>;
