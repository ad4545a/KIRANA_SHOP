import { Router } from 'express';
import { paymentController } from './payment.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { createPaymentSchema } from './payment.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All payment routes require authentication
router.use(authenticate);

// Both OWNER and WORKER can record, view, and list payments (PRD §4 Permission Matrix)
router.post(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  validate({ body: createPaymentSchema }),
  asyncHandler(paymentController.createPayment)
);

router.get(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  asyncHandler(paymentController.listPayments)
);

router.get(
  '/:paymentId',
  authorize(ROLES.OWNER, ROLES.WORKER),
  asyncHandler(paymentController.getPayment)
);

export default router;
