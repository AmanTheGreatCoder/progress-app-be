import type { Task } from '@prisma/client';

export const calculateTaskScore = (task: Task): number => {
  if (task.points > 0) return task.points;

  const priorityWeight = { High: 3, Medium: 2, Low: 1, None: 0 }[task.priority] ?? 0;
  
  const tags = task.tags ? task.tags.split(',').filter(Boolean) : [];
  const tagWeights = { Work: 2.0, Health: 2.0, Personal: 1.0 };
  const tagWeight = Math.max(...tags.map(tag => (tagWeights as any)[tag] ?? 1.0), 1.0);

  const effortTag = tags.find(tag => /^e\d+$/.test(tag));
  let effortValue = 1;

  if (effortTag) {
    effortValue = parseInt(effortTag.substring(1));
  } else {
    const defaultEfforts: any = { Routine: 1, Health: 2, Personal: 2, 'Mental Health': 3, Work: 3 };
    const efforts = tags.map(tag => defaultEfforts[tag]).filter(Boolean);
    if (efforts.length > 0) effortValue = Math.max(...efforts);
  }

  return priorityWeight * tagWeight * effortValue;
};

export const aggregateDailyScores = (tasks: Task[]) => {
  const scoresByDate: Record<string, number> = {};
  tasks.forEach(task => {
    if (task.completed) {
      const date = task.date;
      const score = calculateTaskScore(task);
      scoresByDate[date] = (scoresByDate[date] || 0) + score;
    }
  });
  return scoresByDate;
};

export const calculateStreak = (dailyScores: Record<string, number>, targetScore: number = 20) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const score = dailyScores[dateStr] || 0;
    if (score >= targetScore) {
      streak++;
    } else {
      if (i === 0) continue; 
      break;
    }
  }
  return streak;
};

export const calculateTagBreakdown = (tasks: Task[], date: string) => {
  const breakdown: Record<string, number> = { Work: 0, Health: 0, Personal: 0 };
  tasks.filter(t => t.date === date && t.completed).forEach(t => {
    const score = calculateTaskScore(t);
    const tags = t.tags ? t.tags.split(',').filter(Boolean) : [];
    tags.forEach(tag => {
      if (['Work', 'Health', 'Personal'].includes(tag)) {
        breakdown[tag] = (breakdown[tag] || 0) + score;
      }
    });
  });
  return breakdown;
};

export const computeGoalProgress = (goal: any, completedTaskIds: Set<string>, allTasks?: any[]) => {
  const linkedNames = goal.linkedTaskNames ? goal.linkedTaskNames.split(',').filter(Boolean) : [];
  const linkedIds = goal.linkedTaskIds ? goal.linkedTaskIds.split(',').filter(Boolean) : [];

  let done: number;
  if (linkedNames.length > 0 && allTasks) {
    // Name-based: count completed tasks matching any linked name within goal period
    done = allTasks.filter(t =>
      t.completed &&
      linkedNames.includes(t.name) &&
      t.date >= goal.startDate &&
      t.date <= goal.deadline
    ).length;
  } else if (linkedIds.length > 0) {
    done = linkedIds.filter((id: string) => completedTaskIds.has(id)).length;
  } else {
    done = goal.logs ? goal.logs.length : 0;
  }

  const hasLinkedTasks = linkedNames.length > 0 || linkedIds.length > 0;
  let total = 1;
  if (goal.startDate && goal.deadline) {
    const start = new Date(goal.startDate + 'T00:00:00').getTime();
    const end = new Date(goal.deadline + 'T00:00:00').getTime();
    const days = Math.ceil((end - start) / 86400000) + 1;
    if (hasLinkedTasks) {
      total = Math.max(days, 1);
    } else {
      const totalWeeks = days > 0 ? days / 7 : 0;
      total = Math.max(Math.ceil(totalWeeks * (goal.targetFrequency || 7)), 1);
    }
  } else if (linkedIds.length > 0) {
    total = Math.max(linkedIds.length, 1);
  }

  return { done, total, pct: Math.min(done / total * 100, 100) };
};
