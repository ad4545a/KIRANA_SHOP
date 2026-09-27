import { adminAuth, firestore } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { ROLES } from '../../shared/constants/roles';
import { UserProfile } from './user.types';
import { CreateWorkerDto, UpdateWorkerDiscountLimitDto, UpdateWorkerStatusDto } from './user.dto';

export class UserService {
  /**
   * Retrieves a user profile document from Firestore by UID.
   */
  public async getUserProfile(uid: string): Promise<UserProfile | null> {
    const docRef = firestore.collection(COLLECTIONS.USERS).doc(uid);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data();
    return {
      userId: docSnap.id,
      name: data?.name || '',
      phone: data?.phone || '',
      role: data?.role || ROLES.WORKER,
      status: data?.status || 'INACTIVE',
      maxDiscountAmount: data?.maxDiscountAmount,
      maxDiscountPercent: data?.maxDiscountPercent,
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt,
    };
  }

  /**
   * Creates a new worker account in Firebase Auth, sets Custom Claim `role: WORKER`,
   * and initializes the Firestore `users/{uid}` document.
   */
  public async createWorker(dto: CreateWorkerDto): Promise<UserProfile> {
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.name,
        phoneNumber: dto.phone.startsWith('+') ? dto.phone : undefined, // Firebase requires E.164 if passed
      });
    } catch (error: any) {
      if (error.code === 'auth/email-already-exists') {
        throw new AppError('Worker with this email already exists', HTTP_STATUS.CONFLICT, 'WORKER_ALREADY_EXISTS');
      }
      throw new AppError(error.message || 'Failed to create worker auth account', HTTP_STATUS.BAD_REQUEST, 'CREATE_USER_FAILED');
    }

    const uid = userRecord.uid;

    try {
      // 1. Set Custom Claim (Authority for RBAC)
      await adminAuth.setCustomUserClaims(uid, { role: ROLES.WORKER });

      // 2. Create Firestore User Profile Document
      const now = new Date().toISOString();
      const profileData: Omit<UserProfile, 'userId'> = {
        name: dto.name,
        phone: dto.phone,
        role: ROLES.WORKER,
        status: 'ACTIVE',
        maxDiscountAmount: dto.maxDiscountAmount ?? 0,
        maxDiscountPercent: dto.maxDiscountPercent ?? 0,
        createdAt: now,
        updatedAt: now,
      };

      await firestore.collection(COLLECTIONS.USERS).doc(uid).set(profileData);

      return {
        userId: uid,
        ...profileData,
      };
    } catch (error: any) {
      // Rollback Auth user if profile setup fails
      await adminAuth.deleteUser(uid).catch(() => {});
      throw new AppError('Failed to complete worker profile creation', HTTP_STATUS.INTERNAL_SERVER_ERROR, 'PROFILE_CREATION_FAILED');
    }
  }

  /**
   * Updates worker status (ACTIVE / INACTIVE) in Firestore and disables Auth user if INACTIVE.
   */
  public async updateWorkerStatus(targetUserId: string, dto: UpdateWorkerStatusDto): Promise<UserProfile> {
    const userRef = firestore.collection(COLLECTIONS.USERS).doc(targetUserId);
    const docSnap = await userRef.get();

    if (!docSnap.exists) {
      throw new AppError('Worker profile not found', HTTP_STATUS.NOT_FOUND, 'USER_NOT_FOUND');
    }

    const userData = docSnap.data();
    if (userData?.role === ROLES.OWNER) {
      throw new AppError('Cannot modify status of an OWNER account', HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
    }

    const isDisable = dto.status === 'INACTIVE';
    const now = new Date().toISOString();

    // 1. Update Firebase Auth account state
    try {
      await adminAuth.updateUser(targetUserId, {
        disabled: isDisable,
      });
    } catch (error: any) {
      throw new AppError('Failed to update Firebase Auth user state', HTTP_STATUS.INTERNAL_SERVER_ERROR, 'AUTH_UPDATE_FAILED');
    }

    // 2. Update Firestore profile
    await userRef.update({
      status: dto.status,
      updatedAt: now,
    });

    const updatedSnap = await userRef.get();
    const updatedData = updatedSnap.data()!;

    return {
      userId: targetUserId,
      name: updatedData.name,
      phone: updatedData.phone,
      role: updatedData.role,
      status: updatedData.status,
      maxDiscountAmount: updatedData.maxDiscountAmount,
      maxDiscountPercent: updatedData.maxDiscountPercent,
      createdAt: updatedData.createdAt,
      updatedAt: updatedData.updatedAt,
    };
  }

  /**
   * Configures worker discount limits (maxDiscountAmount, maxDiscountPercent).
   */
  public async updateWorkerDiscountLimit(targetUserId: string, dto: UpdateWorkerDiscountLimitDto): Promise<UserProfile> {
    const userRef = firestore.collection(COLLECTIONS.USERS).doc(targetUserId);
    const docSnap = await userRef.get();

    if (!docSnap.exists) {
      throw new AppError('Worker profile not found', HTTP_STATUS.NOT_FOUND, 'USER_NOT_FOUND');
    }

    const userData = docSnap.data();
    if (userData?.role === ROLES.OWNER) {
      throw new AppError('Cannot configure discount limits for an OWNER account', HTTP_STATUS.FORBIDDEN, 'FORBIDDEN');
    }

    const now = new Date().toISOString();
    await userRef.update({
      maxDiscountAmount: dto.maxDiscountAmount,
      maxDiscountPercent: dto.maxDiscountPercent,
      updatedAt: now,
    });

    const updatedSnap = await userRef.get();
    const updatedData = updatedSnap.data()!;

    return {
      userId: targetUserId,
      name: updatedData.name,
      phone: updatedData.phone,
      role: updatedData.role,
      status: updatedData.status,
      maxDiscountAmount: updatedData.maxDiscountAmount,
      maxDiscountPercent: updatedData.maxDiscountPercent,
      createdAt: updatedData.createdAt,
      updatedAt: updatedData.updatedAt,
    };
  }

  /**
   * Lists all worker profiles in the store.
   */
  public async listWorkers(): Promise<UserProfile[]> {
    const snapshot = await firestore
      .collection(COLLECTIONS.USERS)
      .where('role', '==', ROLES.WORKER)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        userId: doc.id,
        name: data.name || '',
        phone: data.phone || '',
        role: data.role || ROLES.WORKER,
        status: data.status || 'INACTIVE',
        maxDiscountAmount: data.maxDiscountAmount,
        maxDiscountPercent: data.maxDiscountPercent,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
  }
}

export const userService = new UserService();
