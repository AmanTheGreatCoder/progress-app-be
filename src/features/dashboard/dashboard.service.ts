import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoalsService } from '../goals/goals.service';
import { aggregateDailyScores, calculateStreak, calculateTagBreakdown } from '../../shared/utils';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private goalsService: GoalsService
  ) {}

  async getDashboard(dateQuery?: string) {
    const viewDate = dateQuery || new Date().toISOString().split('T')[0];

    const tasks = await this.prisma.task.findMany();
    const dailyScores = aggregateDailyScores(tasks);
    const currentScore = dailyScores[viewDate] || 0;
    const streak = calculateStreak(dailyScores, 20);
    const tagBreakdown = calculateTagBreakdown(tasks, viewDate);

    const viewTasks = tasks.filter(t => t.date === viewDate);
    const completedTasks = viewTasks.filter(t => t.completed);
    const incompleteTasks = viewTasks.filter(t => !t.completed);
    
    const viewDone = completedTasks.length;
    const totalView = viewTasks.length;
    const completionPct = totalView > 0 ? Math.round((viewDone / totalView) * 100) : 0;
    const highDone = completedTasks.filter(t => t.priority === 'High').length;

    const sortedDays = Object.entries(dailyScores)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7);
    const maxDayScore = Math.max(...sortedDays.map(([, s]) => Number(s)), 1);

    return {
      dailyScores,
      currentScore,
      streak,
      tagBreakdown,
      viewDone,
      totalView,
      completionPct,
      highDone,
      sortedDays,
      maxDayScore,
      targetPoints: 120,
      completedTasks,
      incompleteTasks
    };
  }

  async getAnalytics() {
    const goalsStats = await this.goalsService.getAllGoals();
    
    const avgCompletion = goalsStats.length > 0
      ? Math.round(goalsStats.reduce((acc: number, g: any) => acc + g.pct, 0) / goalsStats.length)
      : 0;

    return { goalStats: goalsStats, avgCompletion };
  }
}
