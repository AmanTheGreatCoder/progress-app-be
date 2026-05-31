import { Controller, Get, Patch, Delete, Query, Param, Body, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { TasksService } from './tasks.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  async getTasks(
    @Req() req: Request,
    @Query('date') date?: string,
    @Query('name') name?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    try {
      const userId = (req as any).userId as string;
      return await this.tasksService.getTasks(userId, date, name, from, to);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('series')
  async getSeries(@Req() req: Request) {
    try {
      const userId = (req as any).userId as string;
      return await this.tasksService.getSeries(userId);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('bulk')
  async getBulkTasks(@Req() req: Request, @Query('ids') ids: string) {
    try {
      const userId = (req as any).userId as string;
      const idArray = ids ? ids.split(',').filter(Boolean) : [];
      return await this.tasksService.getTasksByIds(userId, idArray);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id')
  async updateTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('completed') completed: boolean,
  ) {
    try {
      const userId = (req as any).userId as string;
      return await this.tasksService.updateTask(userId, id, completed);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  async deleteTask(@Req() req: Request, @Param('id') id: string) {
    try {
      const userId = (req as any).userId as string;
      return await this.tasksService.deleteTask(userId, id);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
