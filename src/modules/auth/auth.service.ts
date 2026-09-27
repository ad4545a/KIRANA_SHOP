import { adminAuth } from '../../config/firebase';
import { UserRole } from '../../shared/constants/roles';

export class AuthService {
  /**
   * Sets custom claims for a user (Authority for RBAC).
   */
  public async setCustomRoleClaim(uid: string, role: UserRole): Promise<void> {
    await adminAuth.setCustomUserClaims(uid, { role });
  }
}

export const authService = new AuthService();
