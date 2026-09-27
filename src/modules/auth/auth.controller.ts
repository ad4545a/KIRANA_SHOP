import { Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { userService } from '../users/user.service';

export class AuthController {
  public async getProfile(req: Request, res: Response): Promise<void> {
    const uid = req.user!.uid;
    const profile = await userService.getUserProfile(uid);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        user: {
          uid: req.user!.uid,
          role: req.user!.role,
          email: req.user!.email,
          ...(profile ? {
            name: profile.name,
            phone: profile.phone,
            status: profile.status,
            maxDiscountAmount: profile.maxDiscountAmount,
            maxDiscountPercent: profile.maxDiscountPercent,
          } : {}),
        },
      },
    });
  }
}

export const authController = new AuthController();
