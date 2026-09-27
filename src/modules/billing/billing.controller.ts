import { Request, Response } from 'express';
import { billingService } from './billing.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreateBillDto } from './billing.dto';

export class BillingController {
  public async createBill(req: Request, res: Response): Promise<void> {
    const dto: CreateBillDto = req.body;
    const actorId = req.user!.uid;
    const actorRole = req.user!.role;

    const result = await billingService.createBill(dto, actorId, actorRole);

    if (result.idempotentReplay) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        idempotentReplay: true,
        data: { bill: result.bill },
      });
      return;
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { bill: result.bill },
    });
  }

  public async getBill(req: Request, res: Response): Promise<void> {
    const { billId } = req.params;
    const bill = await billingService.getBillById(billId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { bill },
    });
  }

  public async listBills(_req: Request, res: Response): Promise<void> {
    const bills = await billingService.listBills();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { bills },
    });
  }
}

export const billingController = new BillingController();
