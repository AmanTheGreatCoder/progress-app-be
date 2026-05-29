import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoalsModule } from '../goals/goals.module';

@Module({
  imports: [PrismaModule, GoalsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
