import { prisma } from '../../shared/config/db.js';
import { parseLinkedNames } from '../../shared/utils.js';

export const GOAL_INCLUDE = {
  logs: true,
  linkedSeries: { include: { series: true } },
} as const;

export async function fetchCompletedTasks() {
  return prisma.task.findMany({
    where: { OR: [{ completed: true }, { completedMin: true }] },
  });
}

export function serializeGoal(g: any, stats: { done: number; total: number; pct: number }) {
  return {
    ...g,
    ...stats,
    linkedTaskIds: g.linkedTaskIds ? g.linkedTaskIds.split(',').filter(Boolean) : [],
    linkedTaskNames: g.linkedTaskNames ? g.linkedTaskNames.split(',').filter(Boolean) : [],
    linkedRecurringNames: parseLinkedNames(g.linkedRecurringNames),
    linkedSeriesIds: (g.linkedSeries || []).map((gs: any) => gs.seriesId),
    linkedSeries: (g.linkedSeries || []).map((gs: any) => ({
      id:        gs.seriesId,
      name:      gs.series.name,
      tags:      gs.series.tags ? gs.series.tags.split(',').filter(Boolean) : [],
      firstSeen: gs.series.firstSeen,
      lastSeen:  gs.series.lastSeen,
      taskCount: gs.series.taskCount,
    })),
  };
}
