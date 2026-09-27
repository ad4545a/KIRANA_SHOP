import { UserRole } from '../constants/roles';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        uid: string;
        role: UserRole;
        email?: string;
        [key: string]: any;
      };
    }
  }
}

export {};
