import { Request, Response } from 'express';
import { customerService } from './customer.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreateCustomerDto, CustomerQueryDto, UpdateCustomerDto, UpdateCustomerStatusDto } from './customer.dto';

export class CustomerController {
  public async createCustomer(req: Request, res: Response): Promise<void> {
    const dto: CreateCustomerDto = req.body;
    const customer = await customerService.createCustomer(dto);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { customer },
    });
  }

  public async getCustomer(req: Request, res: Response): Promise<void> {
    const { customerId } = req.params;
    const customer = await customerService.getCustomerById(customerId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { customer },
    });
  }

  public async listCustomers(req: Request, res: Response): Promise<void> {
    const query: CustomerQueryDto = req.query as any;
    const customers = await customerService.listCustomers(query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { customers },
    });
  }

  public async updateCustomer(req: Request, res: Response): Promise<void> {
    const { customerId } = req.params;
    const dto: UpdateCustomerDto = req.body;
    const customer = await customerService.updateCustomer(customerId as string, dto);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { customer },
    });
  }

  public async updateCustomerStatus(req: Request, res: Response): Promise<void> {
    const { customerId } = req.params;
    const dto: UpdateCustomerStatusDto = req.body;
    const customer = await customerService.updateCustomerStatus(customerId as string, dto);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { customer },
    });
  }

  public async postAdjustment(req: Request, res: Response): Promise<void> {
    const actorId = req.user!.uid;
    const actorRole = req.user!.role;
    const dto = req.body;
    const result = await customerService.postAdjustment(dto, actorId, actorRole);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  }

  public async getCustomerLedger(req: Request, res: Response): Promise<void> {
    const { customerId } = req.params;
    const ledger = await customerService.getCustomerLedger(customerId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { ledger },
    });
  }
}

export const customerController = new CustomerController();
