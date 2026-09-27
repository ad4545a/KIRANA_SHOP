import { Router } from 'express';
import { userController } from './user.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { createWorkerSchema, updateWorkerDiscountLimitSchema, updateWorkerStatusSchema } from './user.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All user management routes require authentication and OWNER role
router.use(authenticate, authorize(ROLES.OWNER));

router.post(
  '/workers',
  validate({ body: createWorkerSchema }),
  asyncHandler(userController.createWorker)
);

router.get(
  '/workers',
  asyncHandler(userController.listWorkers)
);

router.patch(
  '/workers/:userId/status',
  validate({ body: updateWorkerStatusSchema }),
  asyncHandler(userController.updateWorkerStatus)
);

router.patch(
  '/workers/:userId/discount-limit',
  validate({ body: updateWorkerDiscountLimitSchema }),
  asyncHandler(userController.updateWorkerDiscountLimit)
);

export default router;
