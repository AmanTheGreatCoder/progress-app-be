import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async getTasks(userId: string, date?: string, name?: string, from?: string, to?: string) {
    const where: any = { userId };

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
      description: t.description || '',
    }));
  }

  async getSeries(userId: string) {
    // Return series derived from the user's own recurring tasks
    const userTasks = await this.prisma.task.findMany({
      where: { userId, isRecurring: true },
      select: { id: true },
    });
    const userTaskIds = userTasks.map(t => t.id);

    // Fall back to all series if no user-scoped tasks yet
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

  async updateTask(userId: string, id: string, completed: boolean) {
    const task = await this.prisma.task.update({
      where: { id, userId },
      data: { completed },
    });
    return { ...task, tags: task.tags ? task.tags.split(',').filter(Boolean) : [] };
  }

  async deleteTask(userId: string, id: string) {
    await this.prisma.task.delete({ where: { id, userId } });
    return { success: true };
  }

  async getTasksByIds(userId: string, ids: string[]) {
    if (!ids || ids.length === 0) return [];
    const tasks = await this.prisma.task.findMany({
      where: { userId, id: { in: ids } },
      orderBy: { date: 'asc' },
    });
    return tasks.map(t => ({
      ...t,
      tags: t.tags ? t.tags.split(',').filter(Boolean) : [],
      description: t.description || '',
    }));
  }
}
