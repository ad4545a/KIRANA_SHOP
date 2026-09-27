import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors/AppError';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { UserRole } from '../shared/constants/roles';

export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('User context missing', HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED'));
      return;
    }

    const { role } = req.user;

    if (!role || !allowedRoles.includes(role)) {
      next(
        new AppError(
          'Access forbidden: insufficient permissions',
          HTTP_STATUS.FORBIDDEN,
          'FORBIDDEN'
        )
      );
      return;
    }

    next();
  };
};
