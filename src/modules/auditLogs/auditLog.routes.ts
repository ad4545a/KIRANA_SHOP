import { Router } from 'express';
import { auditLogController } from './auditLog.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { validate } from '../../middlewares/validate';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { auditLogQuerySchema } from './auditLog.dto';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// All audit log routes require authentication
router.use(authenticate);

// OWNER ONLY: Retrieve audit log entries (PRD §4 & §15: GET /audit-logs or /api/v1/audit-logs)
router.get(
  '/',
  authorize(ROLES.OWNER),
  validate({ query: auditLogQuerySchema }),
  asyncHandler(auditLogController.listAuditLogs)
);

export default router;
