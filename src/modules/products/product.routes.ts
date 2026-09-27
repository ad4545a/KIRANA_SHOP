import { Router } from 'express';
import { productController } from './product.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { createProductSchema, productQuerySchema, updateProductSchema, updateProductStatusSchema } from './product.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// OWNER + WORKER: List and Retrieve Products
router.get(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  validate({ query: productQuerySchema }),
  asyncHandler(productController.listProducts)
);

router.get(
  '/:productId',
  authorize(ROLES.OWNER, ROLES.WORKER),
  asyncHandler(productController.getProduct)
);

// OWNER ONLY: Create, Update, Deactivate Products
router.post(
  '/',
  authorize(ROLES.OWNER),
  validate({ body: createProductSchema }),
  asyncHandler(productController.createProduct)
);

router.patch(
  '/:productId',
  authorize(ROLES.OWNER),
  validate({ body: updateProductSchema }),
  asyncHandler(productController.updateProduct)
);

router.patch(
  '/:productId/status',
  authorize(ROLES.OWNER),
  validate({ body: updateProductStatusSchema }),
  asyncHandler(productController.updateProductStatus)
);

router.delete(
  '/:productId',
  authorize(ROLES.OWNER),
  asyncHandler(productController.deleteProduct)
);

export default router;
