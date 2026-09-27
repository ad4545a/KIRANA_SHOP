import { Request, Response } from 'express';
import { notificationService } from './notification.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { NotificationQueryDto, UpdateNotificationStatusDto } from './notification.dto';

export class NotificationController {
  public async listNotifications(req: Request, res: Response): Promise<void> {
    const query: NotificationQueryDto = req.query as any;
    const notifications = await notificationService.listNotifications(query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { notifications },
    });
  }

  public async updateStatus(req: Request, res: Response): Promise<void> {
    const { notificationId } = req.params;
    const dto: UpdateNotificationStatusDto = req.body;
    const notification = await notificationService.markAsRead(notificationId as string, dto.isRead);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { notification },
    });
  }
}

export const notificationController = new NotificationController();
