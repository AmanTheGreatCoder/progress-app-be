import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('api')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('dashboard')
  async getDashboard(@Query('date') date?: string) {
    try {
      return await this.dashboardService.getDashboard(date);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('analytics')
  async getAnalytics() {
    try {
      return await this.dashboardService.getAnalytics();
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
