import { Router } from 'express';
import { purchaseController } from './purchase.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { createPurchaseSchema } from './purchase.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All purchase endpoints require authentication and OWNER role per PRD §15
router.use(authenticate, authorize(ROLES.OWNER));

router.post(
  '/',
  validate({ body: createPurchaseSchema }),
  asyncHandler(purchaseController.createPurchase)
);

router.get(
  '/',
  asyncHandler(purchaseController.listPurchases)
);

router.get(
  '/:purchaseId',
  asyncHandler(purchaseController.getPurchase)
);

router.get(
  '/products/:productId/ledger',
  asyncHandler(purchaseController.getStockLedger)
);

export default router;
