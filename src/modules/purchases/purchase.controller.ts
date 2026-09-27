import { Request, Response } from 'express';
import { purchaseService } from './purchase.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreatePurchaseDto } from './purchase.dto';

export class PurchaseController {
  public async createPurchase(req: Request, res: Response): Promise<void> {
    const dto: CreatePurchaseDto = req.body;
    const actorId = req.user!.uid;

    const result = await purchaseService.createPurchase(dto, actorId);

    if (result.idempotentReplay) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        idempotentReplay: true,
        data: { purchase: result.purchase },
      });
      return;
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { purchase: result.purchase },
    });
  }

  public async getPurchase(req: Request, res: Response): Promise<void> {
    const { purchaseId } = req.params;
    const purchase = await purchaseService.getPurchaseById(purchaseId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { purchase },
    });
  }

  public async listPurchases(_req: Request, res: Response): Promise<void> {
    const purchases = await purchaseService.listPurchases();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { purchases },
    });
  }

  public async getStockLedger(req: Request, res: Response): Promise<void> {
    const { productId } = req.params;
    const ledger = await purchaseService.getStockLedger(productId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { ledger },
    });
  }
}

export const purchaseController = new PurchaseController();
