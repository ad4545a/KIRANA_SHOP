import { Router } from 'express';
import { returnController } from './return.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { processReturnSchema } from './return.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All return routes require authentication
router.use(authenticate);

// OWNER ONLY: Process a return (PRD §4 Permission Matrix — Process a return: OWNER only)
router.post(
  '/',
  authorize(ROLES.OWNER),
  validate({ body: processReturnSchema }),
  asyncHandler(returnController.processReturn)
);

router.get(
  '/',
  authorize(ROLES.OWNER),
  asyncHandler(returnController.listReturns)
);

router.get(
  '/:returnId',
  authorize(ROLES.OWNER),
  asyncHandler(returnController.getReturn)
);

export default router;
