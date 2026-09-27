import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { logger } from '../config/logger';
import { env } from '../config/env';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const requestId = req.id || 'unknown';

  const isAppError =
    err instanceof AppError ||
    (err && typeof (err as any).statusCode === 'number' && typeof (err as any).code === 'string');

  if (isAppError) {
    const appErr = err as AppError;
    logger.warn(
      {
        requestId,
        statusCode: appErr.statusCode,
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
      `Operational Error: ${appErr.message}`
    );

    res.status(appErr.statusCode).json({
      success: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        ...(appErr.details ? { details: appErr.details } : {}),
      },
      requestId,
    });
    return;
  }

  // Handle unexpected non-operational errors
  logger.error(
    {
      requestId,
      error: {
        message: err.message,
        stack: env.NODE_ENV === 'development' ? err.stack : undefined,
      },
    },
    `Unexpected Error: ${err.message}`
  );

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred.',
    },
    requestId,
  });
};
