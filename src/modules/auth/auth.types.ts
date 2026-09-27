import { UserRole } from '../../shared/constants/roles';

export interface AuthenticatedUser {
  uid: string;
  role: UserRole;
  email?: string;
}

export interface SetCustomClaimDto {
  uid: string;
  role: UserRole;
}
