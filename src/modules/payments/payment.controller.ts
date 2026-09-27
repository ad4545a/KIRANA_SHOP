import { Request, Response } from 'express';
import { paymentService } from './payment.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreatePaymentDto } from './payment.dto';

export class PaymentController {
  public async createPayment(req: Request, res: Response): Promise<void> {
    const dto: CreatePaymentDto = req.body;
    const actorId = req.user!.uid;

    const result = await paymentService.createPayment(dto, actorId);

    if (result.idempotentReplay) {
      res.status(HTTP_STATUS.OK).json({
        success: true,
        idempotentReplay: true,
        data: { payment: result.payment },
      });
      return;
    }

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { payment: result.payment },
    });
  }

  public async getPayment(req: Request, res: Response): Promise<void> {
    const { paymentId } = req.params;
    const payment = await paymentService.getPaymentById(paymentId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { payment },
    });
  }

  public async listPayments(req: Request, res: Response): Promise<void> {
    const { customerId } = req.query;
    const payments = await paymentService.listPayments(customerId as string | undefined);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { payments },
    });
  }
}

export const paymentController = new PaymentController();
