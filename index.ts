import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import https from 'https';
import { Client } from '@notionhq/client';
import { PrismaClient } from '@prisma/client';
import { aggregateDailyScores, calculateStreak, calculateTagBreakdown, computeGoalProgress, calculateTaskScore } from './utils';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

dotenv.config();

// Fix for Node 18+ IPv6 AggregateError
axios.defaults.httpsAgent = new https.Agent({ family: 4 });

const app = express();
const port = process.env.PORT || 3001;

// Prisma 7 with pg adapter
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

const TICKTICK_CLIENT_ID = process.env.TICKTICK_CLIENT_ID!;
const TICKTICK_CLIENT_SECRET = process.env.TICKTICK_CLIENT_SECRET!;
const TICKTICK_REDIRECT_URI = 'http://localhost:3001/api/ticktick/callback';

async function getValidAccessToken(): Promise<string> {
  const auth = await prisma.tickTickAuth.findUnique({ where: { id: 'singleton' } });
  if (!auth) throw new Error('TickTick not connected');

  if (new Date() >= auth.expiresAt) {
    const encoded = Buffer.from(`${TICKTICK_CLIENT_ID}:${TICKTICK_CLIENT_SECRET}`).toString('base64');
    const res = await axios.post('https://ticktick.com/oauth/token', new URLSearchParams({
      client_id: TICKTICK_CLIENT_ID,
      client_secret: TICKTICK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      scope: 'tasks:write tasks:read',
      refresh_token: auth.refreshToken
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encoded}`
      }
    });

    const data = res.data;
    const newExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    await prisma.tickTickAuth.update({
      where: { id: 'singleton' },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || auth.refreshToken,
        expiresAt: newExpiresAt
      }
    });
    return data.access_token;
  }
  return auth.accessToken;
}

app.use(cors({
  origin: [
    'http://localhost:5173',
  ],
  credentials: true
}));
app.use(express.json());

// ─── TICKTICK OAUTH ──────────────────────────────────────────────────────────
app.get('/api/ticktick/status', async (_req, res) => {
  try {
    const auth = await prisma.tickTickAuth.findUnique({ where: { id: 'singleton' } });
    if (!auth) return res.json({ connected: false });
    res.json({ connected: true, expiresAt: auth.expiresAt });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ticktick/auth', (req, res) => {
  const url = `https://ticktick.com/oauth/authorize?client_id=${TICKTICK_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(TICKTICK_REDIRECT_URI)}&scope=tasks:read`;
  res.json({ url });
});

app.get('/api/ticktick/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send('No code provided');

  try {
    const encoded = Buffer.from(`${TICKTICK_CLIENT_ID}:${TICKTICK_CLIENT_SECRET}`).toString('base64');
    const response = await axios.post('https://ticktick.com/oauth/token', new URLSearchParams({
      client_id: TICKTICK_CLIENT_ID,
      client_secret: TICKTICK_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      scope: 'tasks:write tasks:read',
      redirect_uri: TICKTICK_REDIRECT_URI
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${encoded}`
      }
    });

    const data = response.data;
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await prisma.tickTickAuth.upsert({
      where: { id: 'singleton' },
      update: { 
        accessToken: data.access_token, 
        refreshToken: data.refresh_token || '', 
        expiresAt 
      },
      create: { 
        id: 'singleton', 
        accessToken: data.access_token, 
        refreshToken: data.refresh_token || '', 
        expiresAt 
      }
    });

    res.redirect('http://localhost:5173');
  } catch (err: any) {
    let errDetails = 'Unknown Error';
    if (err.response) {
      errDetails = `Status ${err.response.status} - Data: ${typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : err.response.data}`;
    } else {
      errDetails = err.message || String(err);
    }
    console.error('TickTick OAuth Error Details:', errDetails);
    res.status(500).send(`
      <h2>Error exchanging token</h2>
      <pre style="background:#f4f4f4;padding:10px;border-radius:5px;white-space:pre-wrap;">${errDetails}</pre>
    `);
  }
});

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

// ─── POST /api/sync — fetch directly from TickTick ───────────────────────────
app.post('/api/sync', async (_req, res) => {
  console.log('[TickTick Sync] Starting sync...');
  try {
    const accessToken = await getValidAccessToken();
    const headers = { 'Authorization': `Bearer ${accessToken}` };
    console.log('[TickTick Sync] Obtained valid access token');

    // ── Step 1: List all named projects ──────────────────────────────────────
    const projRes = await axios.get('https://api.ticktick.com/open/v1/project', { headers });
    const projects: any[] = projRes.data;
    console.log(`[TickTick Sync] Projects found: ${projects.map((p: any) => `"${p.name}" (${p.id})`).join(', ') || 'none'}`);

    // Deduplicated task map — if the same ID appears in both inbox (active) and
    // completed endpoint (done), prefer the completed version so we never mark
    // a task as unchecked when it's already done in TickTick.
    const taskMap = new Map<string, any>();
    const addTasks = (source: string, tasks: any[]) => {
      let added = 0, updated = 0;
      for (const t of tasks) {
        const existing = taskMap.get(t.id);
        if (!existing) {
          taskMap.set(t.id, t); added++;
        } else if (t.status === 2 && existing.status !== 2) {
          // Completed version beats active version
          taskMap.set(t.id, t); updated++;
        }
      }
      console.log(`[TickTick Sync] ${source}: ${tasks.length} returned, ${added} new, ${updated} updated to completed`);
    };

    // ── Step 2: Per-project active tasks ─────────────────────────────────────
    for (const project of projects) {
      try {
        const dataRes = await axios.get(`https://api.ticktick.com/open/v1/project/${project.id}/data`, { headers });
        addTasks(`Project "${project.name}"`, dataRes.data.tasks || []);
      } catch (e: any) {
        console.warn(`[TickTick Sync] Project "${project.name}" failed:`, e.response?.status, e.response?.data?.errorMessage || e.message);
      }
    }

    // ── Step 3: Inbox (not in project list — try well-known special IDs) ─────
    // TickTick's Open API does not expose the Inbox as a regular project.
    // Try common aliases; whichever returns tasks wins.
    let inboxFetched = false;
    for (const inboxId of ['INBOX', 'inbox']) {
      try {
        const r = await axios.get(`https://api.ticktick.com/open/v1/project/${inboxId}/data`, { headers });
        const tasks: any[] = r.data.tasks || [];
        addTasks(`Inbox (id="${inboxId}")`, tasks);
        if (tasks.length > 0) { inboxFetched = true; break; }
      } catch (e: any) {
        console.log(`[TickTick Sync] Inbox "${inboxId}": ${e.response?.status ?? e.message}`);
      }
    }
    if (!inboxFetched) {
      console.warn('[TickTick Sync] ⚠️  Inbox not accessible via Open API — tasks in TickTick Inbox will not sync. Move them to a named List to include them.');
    }

    // ── Step 4: Completed tasks ───────────────────────────────────────────────
    // TickTick's Open API ignores offset and always returns the same set,
    // so we just do a single fetch — no pagination loop needed.
    try {
      const now = new Date();
      const from = new Date(now.getFullYear() - 2, 0, 1).toISOString();
      const to   = new Date(now.getFullYear() + 1, 11, 31).toISOString();
      const r = await axios.post(
        'https://api.ticktick.com/open/v1/task/completed',
        { from, to, limit: 1000 },
        { headers }
      );
      const completedTasks: any[] = Array.isArray(r.data) ? r.data : (r.data?.tasks || []);
      addTasks('Completed tasks', completedTasks);
    } catch (e: any) {
      console.warn('[TickTick Sync] Completed tasks fetch failed:', e.response?.data || e.message);
    }

    const allTasks = [...taskMap.values()];
    console.log(`[TickTick Sync] Total unique tasks to upsert: ${allTasks.length}`);

    // ── Step 5: Upsert everything ─────────────────────────────────────────────
    const priorityMap: Record<number, string> = { 0: 'None', 1: 'Low', 3: 'Medium', 5: 'High' };

    for (const t of allTasks) {
      const name        = t.title || 'Untitled';
      const description = t.content || '';
      const priority    = priorityMap[t.priority as number] || 'None';
      const tags        = (t.tags || []).join(',');
      const completed   = t.status === 2;
      const isRecurring = !!t.repeatFlag;
      const repeatFlag  = t.repeatFlag || '';
      const ticktickProjectId = t.projectId || '';
      const points      = calculateTaskScore({ priority, tags } as any);

      // Priority: dueDate → startDate → completedTime → createdTime
      const date =
        (t.dueDate       && t.dueDate.split('T')[0])       ||
        (t.startDate     && t.startDate.split('T')[0])     ||
        (t.completedTime && t.completedTime.split('T')[0]) ||
        (t.createdTime   && t.createdTime.split('T')[0])   ||
        new Date().toISOString().split('T')[0]; // should never reach here

      await prisma.task.upsert({
        where:  { id: t.id },
        update: { name, description, priority, tags, date, completed, points, isRecurring, repeatFlag, ticktickProjectId },
        create: { id: t.id, name, description, priority, tags, date, completed, points, isRecurring, repeatFlag, ticktickProjectId, notionUrl: null },
      });
    }

    console.log(`[TickTick Sync] ✓ Done. ${allTasks.length} tasks synced.`);
    res.json({ synced: allTasks.length });
  } catch (err: any) {
    console.error('[TickTick Sync] Error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ─── POST /api/sync/notion — Fallback Notion Sync ────────────────────────────
app.post('/api/sync/notion', async (_req, res) => {
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
