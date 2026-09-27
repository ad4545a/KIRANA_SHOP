import { Request, Response } from 'express';
import { returnService } from './return.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { ProcessReturnDto } from './return.dto';

export class ReturnController {
  public async processReturn(req: Request, res: Response): Promise<void> {
    const actorId = req.user!.uid;
    const actorRole = req.user!.role;
    const dto: ProcessReturnDto = req.body;
    const result = await returnService.processReturn(dto, actorId, actorRole);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  }

  public async getReturn(req: Request, res: Response): Promise<void> {
    const { returnId } = req.params;
    const returnRecord = await returnService.getReturnById(returnId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { returnRecord },
    });
  }

  public async listReturns(_req: Request, res: Response): Promise<void> {
    const returns = await returnService.listReturns();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { returns },
    });
  }
}

export const returnController = new ReturnController();
