import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';
import { PrismaClient } from '@prisma/client';
import { aggregateDailyScores, calculateStreak, calculateTagBreakdown, computeGoalProgress, calculateTaskScore } from './utils';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Prisma 7 with pg adapter
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

app.use(cors());
app.use(express.json());

// ─── GET /api/dashboard ───────────────────────────────────────────────────────
app.get('/api/dashboard', async (req, res) => {
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
    const maxDayScore = Math.max(...sortedDays.map(([, s]) => s), 1);
    
    res.json({
      dailyScores,
      currentScore,
      streak,
      tagBreakdown,
      viewDone,
      totalView,
      completionPct,
      highDone,
      sortedDays,
      maxDayScore
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics ───────────────────────────────────────────────────────
app.get('/api/analytics', async (_req, res) => {
  try {
    const tasks = await prisma.task.findMany({ where: { completed: true } });
    const completedTaskIds = new Set(tasks.map(t => t.id));

    const goals = await prisma.goal.findMany({ include: { logs: true } });
    const goalStats = goals.map(g => {
      const stats = computeGoalProgress(g, completedTaskIds, tasks);
      return { ...g, ...stats, linkedTaskIds: g.linkedTaskIds ? g.linkedTaskIds.split(',').filter(Boolean) : [], linkedTaskNames: g.linkedTaskNames ? g.linkedTaskNames.split(',').filter(Boolean) : [] };
    });
    
    const avgCompletion = goalStats.length > 0
      ? Math.round(goalStats.reduce((acc, g) => acc + g.pct, 0) / goalStats.length)
      : 0;
      
    res.json({ goalStats, avgCompletion });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GOAL APIs ────────────────────────────────────────────────────────────────
app.get('/api/goals', async (_req, res) => {
  try {
    const goals = await prisma.goal.findMany({ include: { logs: true }, orderBy: { createdAt: 'desc' } });
    const tasks = await prisma.task.findMany({ where: { completed: true } });
    const completedTaskIds = new Set(tasks.map(t => t.id));

    const mapped = goals.map(g => {
      const stats = computeGoalProgress(g, completedTaskIds, tasks);
      return { ...g, ...stats, linkedTaskIds: g.linkedTaskIds ? g.linkedTaskIds.split(',').filter(Boolean) : [], linkedTaskNames: g.linkedTaskNames ? g.linkedTaskNames.split(',').filter(Boolean) : [] };
    });
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    const { title, startDate, deadline, category, targetFrequency, targetCount, priority, linkedTaskIds, linkedTaskNames } = req.body;
    const goal = await prisma.goal.create({
      data: {
        title, startDate, deadline, category,
        targetFrequency: targetFrequency ?? 1,
        targetCount: targetCount ?? 0,
        priority,
        linkedTaskIds: linkedTaskIds?.join(',') || '',
        linkedTaskNames: linkedTaskNames?.join(',') || '',
        createdAt: new Date().toISOString().split('T')[0]
      },
      include: { logs: true }
    });
    res.json({ ...goal, linkedTaskIds: goal.linkedTaskIds ? goal.linkedTaskIds.split(',').filter(Boolean) : [], linkedTaskNames: goal.linkedTaskNames ? goal.linkedTaskNames.split(',').filter(Boolean) : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/goals/:id', async (req, res) => {
  try {
    const { linkedTaskIds, linkedTaskNames, targetCount, ...rest } = req.body;
    const data: any = { ...rest };
    if (linkedTaskIds !== undefined) data.linkedTaskIds = linkedTaskIds.join(',');
    if (linkedTaskNames !== undefined) data.linkedTaskNames = linkedTaskNames.join(',');
    if (targetCount !== undefined) data.targetCount = targetCount;

    const goal = await prisma.goal.update({ where: { id: req.params.id }, data, include: { logs: true } });
    res.json({ ...goal, linkedTaskIds: goal.linkedTaskIds ? goal.linkedTaskIds.split(',').filter(Boolean) : [], linkedTaskNames: goal.linkedTaskNames ? goal.linkedTaskNames.split(',').filter(Boolean) : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/goals/:id', async (req, res) => {
  try {
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals/:id/log', async (req, res) => {
  try {
    const { effortMinutes, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const existing = await prisma.goalLog.findFirst({
      where: { goalId: req.params.id, date: today }
    });
    if (existing) {
      return res.json({ success: false, message: 'Already logged today' });
    }

    await prisma.goalLog.create({
      data: {
        goalId: req.params.id,
        date: today,
        effortMinutes: effortMinutes ?? 0,
        notes: notes ?? ''
      }
    });

    const goal = await prisma.goal.findUnique({ where: { id: req.params.id }, include: { logs: true } });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json({ ...goal, linkedTaskIds: goal.linkedTaskIds ? goal.linkedTaskIds.split(',').filter(Boolean) : [], linkedTaskNames: goal.linkedTaskNames ? goal.linkedTaskNames.split(',').filter(Boolean) : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tasks — serve from local DB ─────────────────────────────────────
app.get('/api/tasks', async (_req, res) => {
  try {
    const tasks = await prisma.task.findMany({ orderBy: { date: 'desc' } });
    // Parse tags back to array for the frontend
    const mapped = tasks.map(t => ({ ...t, tags: t.tags ? t.tags.split(',').filter(Boolean) : [], description: t.description || '' }));
    res.json(mapped);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync — fetch all from Notion, upsert into DB ──────────────────
app.post('/api/sync', async (_req, res) => {
  if (!DATABASE_ID) {
    return res.status(500).json({ error: 'NOTION_DATABASE_ID is not configured' });
  }
  try {
    let allPages: any[] = [];
    let cursor: string | undefined = undefined;

    do {
      const response: any = await notion.databases.query({
        database_id: DATABASE_ID,
        sorts: [{ property: 'Date', direction: 'descending' }],
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      allPages = allPages.concat(response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    for (const page of allPages) {
      const p = page.properties;
      const name = p['Task Name']?.title[0]?.plain_text || 'Untitled';
      const priority = p['Priority Level']?.select?.name || 'None';
      const tagsArr: string[] = p['Tag']?.multi_select?.map((s: any) => s.name) || [];
      const tags = tagsArr.join(',');
      const date = p['Date']?.date?.start?.split('T')[0] || new Date().toISOString().split('T')[0];
      const completed = p['Done']?.checkbox === true;
      // Description: try common Notion property names for description/notes
      const description =
        p['Description']?.rich_text?.map((r: any) => r.plain_text).join('') ||
        p['Notes']?.rich_text?.map((r: any) => r.plain_text).join('') ||
        p['Note']?.rich_text?.map((r: any) => r.plain_text).join('') ||
        '';
      const tempTask = { priority, tags } as any;
      const points = calculateTaskScore(tempTask);
      const notionUrl = page.url || null;

      await prisma.task.upsert({
        where: { id: page.id },
        update: { name, description, priority, tags, date, completed, points, notionUrl },
        create: { id: page.id, name, description, priority, tags, date, completed, points, notionUrl },
      });
    }

    res.json({ synced: allPages.length });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/tasks/:id — toggle completion ─────────────────────────────────
app.patch('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  try {
    const task = await prisma.task.update({ where: { id }, data: { completed } });
    res.json({ ...task, tags: task.tags ? task.tags.split(',').filter(Boolean) : [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
