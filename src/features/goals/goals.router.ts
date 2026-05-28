import { Router } from 'express';
import { prisma } from '../../shared/config/db.js';
import { handleError } from '../../shared/middleware/errorHandler.js';
import { GOAL_INCLUDE, fetchCompletedTasks, serializeGoal } from './goals.service.js';
import { computeGoalProgress } from '../../shared/utils.js';

const router = Router();

router.get('/api/goals', async (_req, res) => {
  try {
    const goals = await prisma.goal.findMany({ include: GOAL_INCLUDE, orderBy: { createdAt: 'desc' } });
    const tasks = await fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map(t => t.id));

    const mapped = goals.map(g => {
      const stats = computeGoalProgress(g, completedTaskIds, tasks);
      return serializeGoal(g, stats);
    });
    res.json(mapped);
  } catch (err: any) { handleError(res, err); }
});

router.post('/api/goals', async (req, res) => {
  try {
    const {
      title, startDate, deadline, category,
      targetFrequency, targetCount, priority,
      linkedTaskIds, linkedTaskNames, linkedRecurringNames,
      linkedSeriesIds,
    } = req.body;

    const goal = await prisma.goal.create({
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
    res.json(serializeGoal(goal, { done: 0, total: 1, pct: 0 }));
  } catch (err: any) { handleError(res, err); }
});

router.patch('/api/goals/:id', async (req, res) => {
  try {
    const { linkedTaskIds, linkedTaskNames, linkedRecurringNames, linkedSeriesIds, targetCount, ...rest } = req.body;
    const data: any = { ...rest };
    if (linkedTaskIds !== undefined) data.linkedTaskIds = linkedTaskIds.join(',');
    if (linkedTaskNames !== undefined) data.linkedTaskNames = linkedTaskNames.join(',');
    if (linkedRecurringNames !== undefined) data.linkedRecurringNames = JSON.stringify(linkedRecurringNames);
    if (targetCount !== undefined) data.targetCount = targetCount;

    if (linkedSeriesIds !== undefined) {
      await prisma.goalSeries.deleteMany({ where: { goalId: req.params.id } });
      if (linkedSeriesIds.length > 0) {
        await prisma.goalSeries.createMany({
          data: linkedSeriesIds.map((seriesId: string) => ({ goalId: req.params.id, seriesId })),
          skipDuplicates: true,
        });
      }
    }

    const goal = await prisma.goal.update({ where: { id: req.params.id }, data, include: GOAL_INCLUDE });

    const tasks = await fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map(t => t.id));
    const stats = computeGoalProgress(goal, completedTaskIds, tasks);

    res.json(serializeGoal(goal, stats));
  } catch (err: any) { handleError(res, err); }
});

router.delete('/api/goals/:id', async (req, res) => {
  try {
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) { handleError(res, err); }
});

router.post('/api/goals/:id/log', async (req, res) => {
  try {
    const { effortMinutes, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const existing = await prisma.goalLog.findFirst({ where: { goalId: req.params.id, date: today } });
    if (existing) return res.json({ success: false, message: 'Already logged today' });

    await prisma.goalLog.create({
      data: { goalId: req.params.id, date: today, effortMinutes: effortMinutes ?? 0, notes: notes ?? '' }
    });

    const goal = await prisma.goal.findUnique({ where: { id: req.params.id }, include: GOAL_INCLUDE });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const tasks = await fetchCompletedTasks();
    const completedTaskIds = new Set(tasks.map(t => t.id));
    const stats = computeGoalProgress(goal, completedTaskIds, tasks);
    res.json(serializeGoal(goal, stats));
  } catch (err: any) { handleError(res, err); }
});

export default router;
