import { Router } from 'express';
import { customerController } from '../customers/customer.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { manualAdjustmentSchema } from '../customers/customer.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All ledger routes require authentication
router.use(authenticate);

// OWNER ONLY: Post a manual ledger adjustment (PRD §4 & §15: POST /ledger/adjustment or /api/v1/ledger/adjustment)
router.post(
  '/adjustment',
  authorize(ROLES.OWNER),
  validate({ body: manualAdjustmentSchema }),
  asyncHandler(customerController.postAdjustment)
);

export default router;
