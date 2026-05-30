import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseLinkedNames, computeGoalProgress } from '../../shared/utils';

export const GOAL_INCLUDE = {
  logs: true,
  linkedSeries: { include: { series: true } },
} as const;

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(private prisma: PrismaService) {}

  async fetchCompletedTasks() {
    return this.prisma.task.findMany({
      where: { OR: [{ completed: true }, { completedMin: true }] },
    });
  }

  serializeGoal(g: any, stats: { done: number; total: number; pct: number }) {
    return {
      ...g,
      ...stats,
      linkedTaskIds: g.linkedTaskIds ? g.linkedTaskIds.split(',').filter(Boolean) : [],
      linkedTaskNames: g.linkedTaskNames ? g.linkedTaskNames.split(',').filter(Boolean) : [],
      linkedRecurringNames: parseLinkedNames(g.linkedRecurringNames),
      linkedSeriesIds: (g.linkedSeries || []).map((gs: any) => gs.seriesId),
      linkedSeries: (g.linkedSeries || []).map((gs: any) => ({
        id: gs.seriesId,
        name: gs.series.name,
        tags: gs.series.tags ? gs.series.tags.split(',').filter(Boolean) : [],
        firstSeen: gs.series.firstSeen,
        lastSeen: gs.series.lastSeen,
        taskCount: gs.series.taskCount,
      })),
    };
  }

  async getAllGoals() {
    const goals = await this.prisma.goal.findMany({ include: GOAL_INCLUDE, orderBy: { createdAt: 'desc' } });
    const tasks = await this.fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map((t: any) => t.id));

    return goals.map(g => {
      const stats = computeGoalProgress(g, completedTaskIds, tasks);
      return this.serializeGoal(g, stats);
    });
  }

  async createGoal(data: any) {
    const {
      title, startDate, deadline, category,
      targetFrequency, targetCount, priority,
      linkedTaskIds, linkedTaskNames, linkedRecurringNames,
      linkedSeriesIds,
    } = data;

    const goal = await this.prisma.goal.create({
      data: {
        title, startDate, deadline, category,
        targetFrequency: targetFrequency ?? 1,
        targetCount: targetCount ?? 0,
        priority,
        linkedTaskIds: linkedTaskIds?.join(',') || '',
        linkedTaskNames: linkedTaskNames?.join(',') || '',
        linkedRecurringNames: JSON.stringify(linkedRecurringNames || []),
        createdAt: new Date().toISOString().split('T')[0],
        ...(linkedSeriesIds?.length > 0 ? {
          linkedSeries: { create: linkedSeriesIds.map((seriesId: string) => ({ seriesId })) },
        } : {}),
      },
      include: GOAL_INCLUDE,
    });
    return this.serializeGoal(goal, { done: 0, total: 1, pct: 0 });
  }

  async updateGoal(id: string, updates: any) {
    const { linkedTaskIds, linkedTaskNames, linkedRecurringNames, linkedSeriesIds, targetCount, ...rest } = updates;
    const data: any = { ...rest };
    if (linkedTaskIds !== undefined) data.linkedTaskIds = linkedTaskIds.join(',');
    if (linkedTaskNames !== undefined) data.linkedTaskNames = linkedTaskNames.join(',');
    if (linkedRecurringNames !== undefined) data.linkedRecurringNames = JSON.stringify(linkedRecurringNames);
    if (targetCount !== undefined) data.targetCount = targetCount;

    if (linkedSeriesIds !== undefined) {
      await this.prisma.goalSeries.deleteMany({ where: { goalId: id } });
      if (linkedSeriesIds.length > 0) {
        await this.prisma.goalSeries.createMany({
          data: linkedSeriesIds.map((seriesId: string) => ({ goalId: id, seriesId })),
          skipDuplicates: true,
        });
      }
    }

    const goal = await this.prisma.goal.update({ where: { id }, data, include: GOAL_INCLUDE });
    const tasks = await this.fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map((t: any) => t.id));
    const stats = computeGoalProgress(goal, completedTaskIds, tasks);

    return this.serializeGoal(goal, stats);
  }

  async deleteGoal(id: string) {
    await this.prisma.goal.delete({ where: { id } });
    return { success: true };
  }

  async logProgress(id: string, effortMinutes: number, notes: string) {
    const today = new Date().toISOString().split('T')[0];

    const existing = await this.prisma.goalLog.findFirst({ where: { goalId: id, date: today } });
    if (existing) return { success: false, message: 'Already logged today' };

    await this.prisma.goalLog.create({
      data: { goalId: id, date: today, effortMinutes: effortMinutes ?? 0, notes: notes ?? '' }
    });

    const goal = await this.prisma.goal.findUnique({ where: { id }, include: GOAL_INCLUDE });
    if (!goal) throw new Error('Goal not found');

    const tasks = await this.fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map((t: any) => t.id));
    const stats = computeGoalProgress(goal, completedTaskIds, tasks);
    return this.serializeGoal(goal, stats);
  }
}
