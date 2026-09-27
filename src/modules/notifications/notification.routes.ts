import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { notificationQuerySchema, updateNotificationStatusSchema } from './notification.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// OWNER ONLY: Read & manage notifications (PRD §4 & §14: Mobile app read-only listener & owner push notifications)
router.get(
  '/',
  authorize(ROLES.OWNER),
  validate({ query: notificationQuerySchema }),
  asyncHandler(notificationController.listNotifications)
);

router.patch(
  '/:notificationId',
  authorize(ROLES.OWNER),
  validate({ body: updateNotificationStatusSchema }),
  asyncHandler(notificationController.updateStatus)
);

export default router;
