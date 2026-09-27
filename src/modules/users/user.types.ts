import { UserRole } from '../../shared/constants/roles';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface UserProfile {
  userId: string;
  name: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  maxDiscountAmount?: number;
  maxDiscountPercent?: number;
  createdAt?: string;
  updatedAt?: string;
}
