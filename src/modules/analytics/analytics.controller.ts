import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';

export class AnalyticsController {
  public async getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dashboardData = await analyticsService.getDashboardData();
      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: dashboardData,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
