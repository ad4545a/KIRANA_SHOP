import { Router } from 'express';
import { customerController } from './customer.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema, updateCustomerStatusSchema } from './customer.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// OWNER + WORKER: Create, List, Retrieve, and Update customer details (PRD §4: Add customer ✅ OWNER ✅ WORKER)
router.post(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  validate({ body: createCustomerSchema }),
  asyncHandler(customerController.createCustomer)
);

router.get(
  '/',
  authorize(ROLES.OWNER, ROLES.WORKER),
  validate({ query: customerQuerySchema }),
  asyncHandler(customerController.listCustomers)
);

router.get(
  '/:customerId',
  authorize(ROLES.OWNER, ROLES.WORKER),
  asyncHandler(customerController.getCustomer)
);

router.patch(
  '/:customerId',
  authorize(ROLES.OWNER, ROLES.WORKER),
  validate({ body: updateCustomerSchema }),
  asyncHandler(customerController.updateCustomer)
);

// OWNER ONLY: Deactivate / Soft-delete customer
router.patch(
  '/:customerId/status',
  authorize(ROLES.OWNER),
  validate({ body: updateCustomerStatusSchema }),
  asyncHandler(customerController.updateCustomerStatus)
);

// OWNER ONLY: View a customer's full ledger/history (PRD §4 Permission Matrix)
router.get(
  '/:customerId/ledger',
  authorize(ROLES.OWNER),
  asyncHandler(customerController.getCustomerLedger)
);

export default router;
