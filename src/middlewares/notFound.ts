import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { HTTP_STATUS } from '../shared/constants/httpStatus';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, HTTP_STATUS.NOT_FOUND, 'NOT_FOUND'));
};
