import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class TickTickService {
  private readonly logger = new Logger(TickTickService.name);

  constructor(private prisma: PrismaService) {}

  private get TICKTICK_CLIENT_ID() {
    return process.env.TICKTICK_CLIENT_ID!;
  }

  private get TICKTICK_CLIENT_SECRET() {
    return process.env.TICKTICK_CLIENT_SECRET!;
  }

  async getValidAccessToken(): Promise<string> {
    const auth = await this.prisma.tickTickAuth.findUnique({ where: { id: 'singleton' } });
    if (!auth) throw new Error('TickTick not connected');

    if (new Date() >= auth.expiresAt) {
      const encoded = Buffer.from(`${this.TICKTICK_CLIENT_ID}:${this.TICKTICK_CLIENT_SECRET}`).toString('base64');
      const res = await axios.post('https://ticktick.com/oauth/token', new URLSearchParams({
        client_id: this.TICKTICK_CLIENT_ID,
        client_secret: this.TICKTICK_CLIENT_SECRET,
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
      await this.prisma.tickTickAuth.update({
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

  // Calculate task points based on priority and tags
  private calculateTaskScore(task: { priority: string; tags: string }): number {
    let score = 0;
    const p = task.priority.toLowerCase();
    if (p === 'high') score += 50;
    else if (p === 'medium') score += 30;
    else if (p === 'low') score += 10;
    else score += 5;

    const tags = task.tags ? task.tags.toLowerCase().split(',').filter(Boolean) : [];
    if (tags.includes('health') || tags.includes('workout')) score += 20;
    if (tags.includes('learning')) score += 15;
    if (tags.includes('career')) score += 10;

    return score;
  }

  async sync(): Promise<{ synced: number; notesSkipped: number }> {
    this.logger.log('Starting sync...');
    const accessToken = await this.getValidAccessToken();
    const headers = { 'Authorization': `Bearer ${accessToken}` };
    
    // Step 1: List all named projects
    const projRes = await axios.get('https://api.ticktick.com/open/v1/project', { headers });
    const projects: any[] = projRes.data;

    const taskMap = new Map<string, any>();
    const addTasks = (source: string, tasks: any[]) => {
      let added = 0, updated = 0;
      for (const t of tasks) {
        const existing = taskMap.get(t.id);
        if (!existing) {
          taskMap.set(t.id, t); added++;
        } else if (t.status === 2 && existing.status !== 2) {
          taskMap.set(t.id, t); updated++;
        }
      }
      this.logger.log(`[TickTick Sync] ${source}: ${tasks.length} returned, ${added} new, ${updated} updated to completed`);
    };

    // Step 2: Per-project active tasks
    for (const project of projects) {
      try {
        const dataRes = await axios.get(`https://api.ticktick.com/open/v1/project/${project.id}/data`, { headers });
        addTasks(`Project "${project.name}"`, dataRes.data.tasks || []);
      } catch (e: any) {
        this.logger.warn(`Project "${project.name}" failed: ${e.response?.status} ${e.response?.data?.errorMessage || e.message}`);
      }
    }

    // Step 3: Inbox
    let inboxFetched = false;
    for (const inboxId of ['INBOX', 'inbox']) {
      try {
        const r = await axios.get(`https://api.ticktick.com/open/v1/project/${inboxId}/data`, { headers });
        const tasks: any[] = r.data.tasks || [];
        addTasks(`Inbox (id="${inboxId}")`, tasks);
        if (tasks.length > 0) { inboxFetched = true; break; }
      } catch (e: any) {}
    }

    // Step 4: Completed tasks
    try {
      const now = new Date();
      const from = new Date(now.getFullYear() - 2, 0, 1).toISOString();
      const to = new Date(now.getFullYear() + 1, 11, 31).toISOString();
      const r = await axios.post(
        'https://api.ticktick.com/open/v1/task/completed',
        { from, to, limit: 1000 },
        { headers }
      );
      const completedTasks: any[] = Array.isArray(r.data) ? r.data : (r.data?.tasks || []);
      addTasks('Completed tasks', completedTasks);
    } catch (e: any) {
      this.logger.warn(`Completed tasks fetch failed: ${e.response?.data || e.message}`);
    }

    const allTasks = [...taskMap.values()];
    const notes = allTasks.filter((t: any) => t.kind === 'NOTE');
    const tasksToSave = allTasks.filter((t: any) => t.kind !== 'NOTE');

    const priorityMap: Record<number, string> = { 0: 'None', 1: 'Low', 3: 'Medium', 5: 'High' };
    const parentMinMap = new Map<string, { minVersion: string, completedMin: boolean }>();
    
    for (const t of allTasks) {
      const items: any[] = t.items || [];
      const minItem = items.find((item: any) => /^min:\s*(.+)/i.test(item.title || ''));
      if (minItem) {
        const match = (minItem.title || '').match(/^min:\s*(.+)/i);
        if (match) {
          parentMinMap.set(t.id, {
            minVersion: match[1].trim(),
            completedMin: !!minItem.completedTime || minItem.status === 2,
          });
        }
      }
    }

    const recurringSeriesNames = new Set<string>(
      allTasks.filter((t: any) => !!t.repeatFlag).map((t: any) => (t.title || '').trim())
    );

    for (const t of tasksToSave) {
      const name = t.title || 'Untitled';
      const description = t.content || '';
      const priority = priorityMap[t.priority as number] || 'None';
      const tags = (t.tags || []).join(',');
      const completed = t.status === 2;
      const isRecurring = !!t.repeatFlag || recurringSeriesNames.has(name.trim());
      const repeatFlag = t.repeatFlag || '';
      const ticktickProjectId = t.projectId || '';
      const points = this.calculateTaskScore({ priority, tags } as any);

      const parentMinData = parentMinMap.get(t.id);
      const minVersion = parentMinData ? parentMinData.minVersion : '';
      const completedMin = parentMinData ? parentMinData.completedMin : false;

      const parseLocalDate = (dString?: string) => {
        if (!dString) return null;
        const d = new Date(dString);
        if (isNaN(d.getTime())) return dString.split('T')[0];
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      };

      const date = parseLocalDate(t.dueDate) ||
        parseLocalDate(t.startDate) ||
        parseLocalDate(t.completedTime) ||
        parseLocalDate(t.createdTime) ||
        new Date().toISOString().split('T')[0];

      await this.prisma.task.upsert({
        where: { id: t.id },
        update: { name, description, priority, tags, date, completed, points, isRecurring, repeatFlag, ticktickProjectId, minVersion, completedMin },
        create: { id: t.id, name, description, priority, tags, date, completed, points, isRecurring, repeatFlag, ticktickProjectId, notionUrl: null, minVersion, completedMin },
      });
    }

    // Step 6: Rebuild TaskSeries
    try {
      const allRecurring = await this.prisma.task.findMany({ where: { isRecurring: true } });
      const seriesMap = new Map<string, { name: string; dates: string[]; tags: Set<string>; count: number; }>();

      for (const task of allRecurring) {
        const nameLower = task.name.trim().toLowerCase();
        if (!seriesMap.has(nameLower)) {
          seriesMap.set(nameLower, { name: task.name.trim(), dates: [], tags: new Set(), count: 0 });
        }
        const s = seriesMap.get(nameLower)!;
        s.count++;
        if (task.date) s.dates.push(task.date);
        if (task.tags) task.tags.split(',').filter(Boolean).forEach(t => s.tags.add(t));
      }

      for (const [nameLower, s] of seriesMap.entries()) {
        s.dates.sort();
        await this.prisma.taskSeries.upsert({
          where: { nameLower },
          update: {
            name: s.name,
            tags: [...s.tags].join(','),
            firstSeen: s.dates[0] ?? '',
            lastSeen: s.dates[s.dates.length - 1] ?? '',
            taskCount: s.count,
          },
          create: {
            name: s.name,
            nameLower,
            tags: [...s.tags].join(','),
            firstSeen: s.dates[0] ?? '',
            lastSeen: s.dates[s.dates.length - 1] ?? '',
            taskCount: s.count,
          },
        });
      }
    } catch (seriesErr: any) {
      this.logger.warn('TaskSeries rebuild failed:', seriesErr.message);
    }

    this.logger.log(`Done. ${tasksToSave.length} tasks synced, ${notes.length} notes skipped.`);
    return { synced: tasksToSave.length, notesSkipped: notes.length };
  }
}
