import { Controller, Get, Post, Patch, Delete, Body, Param, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { GoalsService } from './goals.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/goals')
@UseGuards(AuthGuard)
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Get()
  async getGoals(@Req() req: Request) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.goalsService.getAllGoals(userId);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  async createGoal(@Req() req: Request, @Body() body: any) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.goalsService.createGoal(userId, body);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id')
  async updateGoal(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.goalsService.updateGoal(userId, id, body);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  async deleteGoal(@Req() req: Request, @Param('id') id: string) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.goalsService.deleteGoal(userId, id);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':id/log')
  async logProgress(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { effortMinutes: number; notes: string },
  ) {
    try {
      const userId = (req.session as any).userId as string;
      return await this.goalsService.logProgress(userId, id, body.effortMinutes, body.notes);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
