import { Request, Response } from 'express';
import { userService } from './user.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreateWorkerDto, UpdateWorkerDiscountLimitDto, UpdateWorkerStatusDto } from './user.dto';

export class UserController {
  public async createWorker(req: Request, res: Response): Promise<void> {
    const dto: CreateWorkerDto = req.body;
    const worker = await userService.createWorker(dto);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { worker },
    });
  }

  public async updateWorkerStatus(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;
    const dto: UpdateWorkerStatusDto = req.body;
    const worker = await userService.updateWorkerStatus(userId as string, dto);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { worker },
    });
  }

  public async updateWorkerDiscountLimit(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;
    const dto: UpdateWorkerDiscountLimitDto = req.body;
    const worker = await userService.updateWorkerDiscountLimit(userId as string, dto);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { worker },
    });
  }

  public async listWorkers(_req: Request, res: Response): Promise<void> {
    const workers = await userService.listWorkers();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { workers },
    });
  }
}

export const userController = new UserController();
