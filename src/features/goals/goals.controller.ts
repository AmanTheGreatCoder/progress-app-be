import { Controller, Get, Post, Patch, Delete, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { GoalsService } from './goals.service';

@Controller('api/goals')
export class GoalsController {
  constructor(private goalsService: GoalsService) {}

  @Get()
  async getGoals() {
    try {
      return await this.goalsService.getAllGoals();
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post()
  async createGoal(@Body() body: any) {
    try {
      return await this.goalsService.createGoal(body);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id')
  async updateGoal(@Param('id') id: string, @Body() body: any) {
    try {
      return await this.goalsService.updateGoal(id, body);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  async deleteGoal(@Param('id') id: string) {
    try {
      return await this.goalsService.deleteGoal(id);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':id/log')
  async logProgress(@Param('id') id: string, @Body() body: { effortMinutes: number; notes: string }) {
    try {
      return await this.goalsService.logProgress(id, body.effortMinutes, body.notes);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
