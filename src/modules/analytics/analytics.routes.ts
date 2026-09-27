import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { ROLES } from '../../shared/constants/roles';

const router = Router();

// GET /api/v1/analytics/dashboard — Owner-only access (PRD §4 & §13)
router.get(
  '/dashboard',
  authenticate,
  authorize(ROLES.OWNER),
  analyticsController.getDashboard.bind(analyticsController)
);

export default router;
