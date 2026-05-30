import { Controller, Get, Patch, Delete, Query, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('api/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  async getTasks(
    @Query('date') date?: string,
    @Query('name') name?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    try {
      return await this.tasksService.getTasks(date, name, from, to);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('series')
  async getSeries() {
    try {
      return await this.tasksService.getSeries();
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':id')
  async updateTask(@Param('id') id: string, @Body('completed') completed: boolean) {
    try {
      return await this.tasksService.updateTask(id, completed);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  async deleteTask(@Param('id') id: string) {
    try {
      return await this.tasksService.deleteTask(id);
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
