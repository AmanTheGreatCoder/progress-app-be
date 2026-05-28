import { Router } from 'express';
import { handleError } from '../../shared/middleware/errorHandler.js';
import { getTasksByFilter, getTaskSeries, updateTaskCompletion, deleteTask } from './tasks.service.js';

const router = Router();

router.get('/api/tasks/series', async (_req, res) => {
  try {
    const rows = await getTaskSeries();
    const series = rows.map(s => ({
      id:        s.id,
      name:      s.name,
      tags:      s.tags ? s.tags.split(',').filter(Boolean) : [],
      firstSeen: s.firstSeen,
      lastSeen:  s.lastSeen,
      taskCount: s.taskCount,
    }));
    res.json(series);
  } catch (err: any) { handleError(res, err); }
});

router.get('/api/tasks', async (req, res) => {
  try {
    const { date, name, from, to } = req.query;
    const where: any = {};

    if (name) where.name = name as string;

    if (from && to) {
      where.date = { gte: from as string, lte: to as string };
    } else {
      where.date = (date as string) || new Date().toISOString().split('T')[0];
    }

    const tasks = await getTasksByFilter(where);
    const mapped = tasks.map(t => ({
      ...t,
      tags: t.tags ? t.tags.split(',').filter(Boolean) : [],
      description: t.description || ''
    }));
    res.json(mapped);
  } catch (err: any) {
    console.error(err);
    handleError(res, err);
  }
});

router.patch('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  try {
    const task = await updateTaskCompletion(id, completed);
    res.json({ ...task, tags: task.tags ? task.tags.split(',').filter(Boolean) : [] });
  } catch (err: any) { handleError(res, err); }
});

router.delete('/api/tasks/:id', async (req, res) => {
  try {
    await deleteTask(req.params.id);
    res.json({ success: true });
  } catch (err: any) { handleError(res, err); }
});

export default router;
