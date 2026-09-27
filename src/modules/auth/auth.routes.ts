import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';
import { asyncHandler } from '../../shared/utils/asyncHandler';

const router = Router();

router.get('/me', authenticate, asyncHandler(authController.getProfile));

export default router;
