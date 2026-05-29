import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async getTasks(date?: string, name?: string, from?: string, to?: string) {
    const where: any = {};

    if (name) where.name = name;

    if (from && to) {
      where.date = { gte: from, lte: to };
    } else {
      where.date = date || new Date().toISOString().split('T')[0];
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return tasks.map(t => ({
      ...t,
      tags: t.tags ? t.tags.split(',').filter(Boolean) : [],
      description: t.description || ''
    }));
  }

  async getSeries() {
    const rows = await this.prisma.taskSeries.findMany({ orderBy: { name: 'asc' } });
    return rows.map(s => ({
      id: s.id,
      name: s.name,
      tags: s.tags ? s.tags.split(',').filter(Boolean) : [],
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      taskCount: s.taskCount,
    }));
  }

  async updateTask(id: string, completed: boolean) {
    const task = await this.prisma.task.update({ where: { id }, data: { completed } });
    return { ...task, tags: task.tags ? task.tags.split(',').filter(Boolean) : [] };
  }

  async deleteTask(id: string) {
    await this.prisma.task.delete({ where: { id } });
    return { success: true };
  }
}
