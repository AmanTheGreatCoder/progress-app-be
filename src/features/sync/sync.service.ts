import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../shared/config/db.js';
import { notion, DATABASE_ID } from '../../shared/config/notion.js';
import { getValidAccessToken } from '../ticktick/ticktick.service.js';
import { calculateTaskScore } from '../../shared/utils.js';

export async function runTickTickSync(): Promise<{ synced: number; notesSkipped: number }> {
  console.log('[TickTick Sync] Starting sync...');

  const accessToken = await getValidAccessToken();
  const headers = { 'Authorization': `Bearer ${accessToken}` };
  console.log('[TickTick Sync] Obtained valid access token');

  // ── Step 1: List all named projects ──────────────────────────────────────
  const projRes = await axios.get('https://api.ticktick.com/open/v1/project', { headers });
  const projects: any[] = projRes.data;
  console.log(`[TickTick Sync] Projects found: ${projects.map((p: any) => `"${p.name}" (${p.id})`).join(', ') || 'none'}`);

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

  // ── Step 3: Inbox ─────────────────────────────────────────────────────────
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
    console.warn('[TickTick Sync] Completed tasks fetch failed:', e.response?.data || e.message);
  }

  const allTasks = [...taskMap.values()];
  console.log(`[TickTick Sync] Total unique tasks to upsert: ${allTasks.length}`);

  const notes = allTasks.filter((t: any) => t.kind === 'NOTE');
  if (notes.length > 0) {
    console.log(`[TickTick Sync] Skipping ${notes.length} note(s): ${notes.map((t: any) => `"${t.title}"`).join(', ')}`);
  }

  // ── Step 5: Upsert ────────────────────────────────────────────────────────
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
        console.log(`[TickTick Sync] ✓ min: item found on "${t.title}" → completedMin=${!!minItem.completedTime || minItem.status === 2}`);
      }
    }
  }

  const tasksToSave = allTasks.filter((t: any) => t.kind !== 'NOTE');

  // ── Write debug log ───────────────────────────────────────────────────────
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(logsDir, `ticktick-sync-${timestamp}.log`);

    const bar = (label: string) => `\n${'═'.repeat(64)}\n  ${label}\n${'═'.repeat(64)}\n`;

    const lines: string[] = [
      `TickTick Sync Debug Log`,
      `Generated : ${new Date().toISOString()}`,
      `Total tasks (deduplicated) : ${allTasks.length}`,
      `Tasks to save (excl. notes): ${tasksToSave.length}`,
      `Notes skipped              : ${notes.length}`,

      bar(`PROJECTS (${projects.length} found)`),
      projects.map((p: any) => `  • "${p.name}"  id=${p.id}  closed=${p.closed}`).join('\n') || '  (none)',

      bar(`MIN: CHECKLIST ITEMS DETECTED (${parentMinMap.size} tasks have a min: item)`),
      parentMinMap.size === 0
        ? [
            '  ⚠️  ZERO tasks had a min: checklist item detected.',
            '  Scanned each task\'s items[] array for title starting with "min:" (case-insensitive).',
            '',
            '  Possible causes:',
            '    1. The checklist item title does not start exactly with "min:"',
            '    2. TickTick returned tasks with no items[] or empty items[]',
          ].join('\n')
        : [...parentMinMap.entries()]
            .map(([tid, v]) => `  taskId     : ${tid}\n  minVersion : "${v.minVersion}"\n  completedMin: ${v.completedMin}`)
            .join('\n\n'),

      bar(`ALL TASKS WITH items[] (checklist tasks)`),
      JSON.stringify(
        allTasks.filter((t: any) => (t.items || []).length > 0).map((t: any) => ({
          id: t.id, title: t.title, status: t.status,
          hasMinItem: (t.items || []).some((item: any) => /^min:\s*(.+)/i.test(item.title || '')),
          items: t.items,
        })),
        null, 2
      ) || '  (none)',

      bar(`NOTES SKIPPED (kind="NOTE") — ${notes.length} items`),
      notes.length === 0
        ? '  (none)'
        : JSON.stringify(notes.map((t: any) => ({ id: t.id, title: t.title, kind: t.kind })), null, 2),

      bar(`ALL COMPLETED TASKS (status === 2)  — ${allTasks.filter((t: any) => t.status === 2).length} tasks`),
      JSON.stringify(
        allTasks.filter((t: any) => t.status === 2).map((t: any) => ({
          id: t.id, title: t.title, status: t.status,
          parentId: t.parentId ?? null,
          projectId: t.projectId ?? null,
          tags: t.tags ?? [],
          completedTime: t.completedTime ?? null,
        })),
        null, 2
      ),

      bar(`ALL TASKS — FULL DUMP (${allTasks.length} tasks)`),
      JSON.stringify(allTasks, null, 2),
    ];

    fs.writeFileSync(logPath, lines.join('\n'), 'utf8');
    console.log(`[TickTick Sync] 📄 Debug log → ${logPath}`);
  } catch (logErr: any) {
    console.warn('[TickTick Sync] Log write failed:', logErr.message);
  }

  const recurringSeriesNames = new Set<string>(
    allTasks.filter((t: any) => !!t.repeatFlag).map((t: any) => (t.title || '').trim())
  );
  console.log(`[TickTick Sync] Recurring series: ${[...recurringSeriesNames].join(' | ') || 'none'}`);

  const parseLocalDate = (dString?: string) => {
    if (!dString) return null;
    const d = new Date(dString);
    if (isNaN(d.getTime())) return dString.split('T')[0];
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  };

  for (const t of tasksToSave) {
    const name = t.title || 'Untitled';
    const description = t.content || '';
    const priority = priorityMap[t.priority as number] || 'None';
    const tags = (t.tags || []).join(',');
    const completed = t.status === 2;
    const isRecurring = !!t.repeatFlag || recurringSeriesNames.has(name.trim());
    const repeatFlag = t.repeatFlag || '';
    const ticktickProjectId = t.projectId || '';
    const points = calculateTaskScore({ priority, tags } as any);

    const parentMinData = parentMinMap.get(t.id);
    const minVersion = parentMinData ? parentMinData.minVersion : '';
    const completedMin = parentMinData ? parentMinData.completedMin : false;

    const date =
      parseLocalDate(t.dueDate) ||
      parseLocalDate(t.startDate) ||
      parseLocalDate(t.completedTime) ||
      parseLocalDate(t.createdTime) ||
      new Date().toISOString().split('T')[0];

    await prisma.task.upsert({
      where: { id: t.id },
      update: { name, description, priority, tags, date, completed, points, isRecurring, repeatFlag, ticktickProjectId, minVersion, completedMin },
      create: { id: t.id, name, description, priority, tags, date, completed, points, isRecurring, repeatFlag, ticktickProjectId, notionUrl: null, minVersion, completedMin },
    });
  }

  // ── Step 6: Rebuild TaskSeries ────────────────────────────────────────────
  try {
    const allRecurring = await prisma.task.findMany({ where: { isRecurring: true } });

    const seriesMap = new Map<string, {
      name: string;
      dates: string[];
      tags: Set<string>;
      count: number;
    }>();

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
      await prisma.taskSeries.upsert({
        where: { nameLower },
        update: {
          name:      s.name,
          tags:      [...s.tags].join(','),
          firstSeen: s.dates[0]  ?? '',
          lastSeen:  s.dates[s.dates.length - 1] ?? '',
          taskCount: s.count,
        },
        create: {
          name:      s.name,
          nameLower,
          tags:      [...s.tags].join(','),
          firstSeen: s.dates[0]  ?? '',
          lastSeen:  s.dates[s.dates.length - 1] ?? '',
          taskCount: s.count,
        },
      });
    }
    console.log(`[TickTick Sync] 📚 TaskSeries rebuilt: ${seriesMap.size} series`);
  } catch (seriesErr: any) {
    console.warn('[TickTick Sync] TaskSeries rebuild failed:', seriesErr.message);
  }

  console.log(`[TickTick Sync] ✓ Done. ${tasksToSave.length} tasks synced, ${notes.length} notes skipped.`);
  return { synced: tasksToSave.length, notesSkipped: notes.length };
}

export async function runNotionSync(): Promise<{ synced: number }> {
  if (!DATABASE_ID) throw new Error('NOTION_DATABASE_ID is not configured');

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
    const points = calculateTaskScore({ priority, tags } as any);
    const notionUrl = page.url || null;

    await prisma.task.upsert({
      where: { id: page.id },
      update: { name, description, priority, tags, date, completed, points, notionUrl },
      create: { id: page.id, name, description, priority, tags, date, completed, points, notionUrl },
    });
  }

  return { synced: allPages.length };
}
