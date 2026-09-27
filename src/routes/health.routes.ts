import { Router, Request, Response } from 'express';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { firestore } from '../config/firebase';
import { logger } from '../config/logger';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Kirana Store POS API Backend is Live',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

router.head('/', (_req: Request, res: Response): void => {
  res.status(HTTP_STATUS.OK).end();
});

router.get('/health', (_req: Request, res: Response): void => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check initialization of dependencies (Firebase/Firestore)
    if (firestore && typeof firestore.listCollections === 'function') {
      await firestore.listCollections();
    }
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Readiness check failed');
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Dependencies not initialized or database unreachable',
      },
    });
  }
});

export default router;
