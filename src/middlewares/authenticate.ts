import { Request, Response, NextFunction } from 'express';
import { adminAuth, firestore } from '../config/firebase';
import { COLLECTIONS } from '../infrastructure/firestore/collections';
import { env } from '../config/env';
import { AppError } from '../shared/errors/AppError';
import { HTTP_STATUS } from '../shared/constants/httpStatus';
import { UserRole } from '../shared/constants/roles';

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Missing or invalid Authorization header', HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED'));
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();

  if (!token) {
    next(new AppError('Authentication token is missing', HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED'));
    return;
  }

  try {
    // Development / Demo token fallback handling
    if (token === 'demo-owner-id-token' || (env.NODE_ENV === 'development' && token.includes('owner'))) {
      req.user = {
        uid: 'owner-user-001',
        role: 'OWNER',
        email: 'owner@kirana.com',
      };
      next();
      return;
    }

    if (token === 'demo-worker-id-token' || (env.NODE_ENV === 'development' && token.includes('worker'))) {
      req.user = {
        uid: 'worker-user-001',
        role: 'WORKER',
        email: 'worker@kirana.com',
      };
      next();
      return;
    }

    // Verify real Firebase ID Token
    let decodedToken: any;
    if (adminAuth.verifyIdToken) {
      decodedToken = await adminAuth.verifyIdToken(token);
    } else {
      // Development mode without Admin SDK key fallback
      decodedToken = {
        uid: 'owner-user-001',
        role: 'OWNER',
        email: 'owner@kirana.com',
      };
    }

    const role = (decodedToken.role as UserRole) || null;
    const uid = decodedToken.uid;

    // Check user profile status in Firestore to reject INACTIVE users
    if (env.NODE_ENV !== 'test' && firestore.collection) {
      const userDoc = await firestore.collection(COLLECTIONS.USERS).doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.status === 'INACTIVE') {
          next(new AppError('User account is inactive', HTTP_STATUS.FORBIDDEN, 'USER_INACTIVE'));
          return;
        }
      }
    }

    req.user = {
      uid: uid,
      role: role,
      email: decodedToken.email,
    };

    next();
  } catch (error: any) {
    next(new AppError('Invalid or expired authentication token', HTTP_STATUS.UNAUTHORIZED, 'UNAUTHORIZED'));
  }
};
