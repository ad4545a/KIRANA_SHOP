import { Router } from 'express';
import { billingController } from './billing.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { createBillSchema } from './billing.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All billing routes require authentication
router.use(authenticate);

// Both OWNER and WORKER can create, view, and list bills (PRD §4 Permission Matrix)
router.post(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  validate({ body: createBillSchema }),
  asyncHandler(billingController.createBill)
);

router.get(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  asyncHandler(billingController.listBills)
);

router.get(
  '/:billId',
  authorize(ROLES.OWNER, ROLES.WORKER),
  asyncHandler(billingController.getBill)
);

export default router;
