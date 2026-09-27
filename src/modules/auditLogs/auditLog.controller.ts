import { Request, Response } from 'express';
import { auditLogService } from './auditLog.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { AuditLogQueryDto } from './auditLog.dto';

export class AuditLogController {
  public async listAuditLogs(req: Request, res: Response): Promise<void> {
    const query: AuditLogQueryDto = req.query as any;
    const logs = await auditLogService.listAuditLogs(query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { auditLogs: logs },
    });
  }
}

export const auditLogController = new AuditLogController();
