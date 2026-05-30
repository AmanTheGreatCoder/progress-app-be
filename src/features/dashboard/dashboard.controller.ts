import { Controller, Get, Query, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: Request, @Query('date') date?: string) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.dashboardService.getDashboard(userId, date);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('analytics')
  async getAnalytics(@Req() req: Request) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.dashboardService.getAnalytics(userId);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
