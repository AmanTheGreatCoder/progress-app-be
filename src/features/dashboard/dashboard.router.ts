import { Router } from 'express';
import { prisma } from '../../shared/config/db.js';
import { handleError } from '../../shared/middleware/errorHandler.js';
import { GOAL_INCLUDE, fetchCompletedTasks, serializeGoal } from '../goals/goals.service.js';
import { aggregateDailyScores, calculateStreak, calculateTagBreakdown, computeGoalProgress } from '../../shared/utils.js';

const router = Router();

router.get('/api/dashboard', async (req, res) => {
  try {
    const dateQuery = req.query.date as string;
    const viewDate = dateQuery || new Date().toISOString().split('T')[0];

    const tasks = await prisma.task.findMany();
    const dailyScores = aggregateDailyScores(tasks);
    const currentScore = dailyScores[viewDate] || 0;
    const streak = calculateStreak(dailyScores, 20);
    const tagBreakdown = calculateTagBreakdown(tasks, viewDate);

    const viewTasks = tasks.filter(t => t.date === viewDate);
    const viewDone = viewTasks.filter(t => t.completed).length;
    const totalView = viewTasks.length;
    const completionPct = totalView > 0 ? Math.round((viewDone / totalView) * 100) : 0;
    const highDone = viewTasks.filter(t => t.completed && t.priority === 'High').length;

    const sortedDays = Object.entries(dailyScores)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7);
    const maxDayScore = Math.max(...sortedDays.map(([, s]) => Number(s)), 1);

    res.json({ dailyScores, currentScore, streak, tagBreakdown, viewDone, totalView, completionPct, highDone, sortedDays, maxDayScore });
  } catch (err: any) { handleError(res, err); }
});

router.get('/api/analytics', async (_req, res) => {
  try {
    const tasks = await fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map(t => t.id));

    const goals = await prisma.goal.findMany({ include: GOAL_INCLUDE });
    const goalStats = goals.map(g => {
      const stats = computeGoalProgress(g, completedTaskIds, tasks);
      return serializeGoal(g, stats);
    });

    const avgCompletion = goalStats.length > 0
      ? Math.round(goalStats.reduce((acc, g) => acc + g.pct, 0) / goalStats.length)
      : 0;

    res.json({ goalStats, avgCompletion });
  } catch (err: any) { handleError(res, err); }
});

export default router;
