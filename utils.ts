import type { Task } from '@prisma/client';

export const calculateTaskScore = (task: Task): number => {
  if (task.points > 0) return task.points;

  const tags = task.tags ? task.tags.split(',').filter(Boolean).map(t => t.toLowerCase()) : [];

  // 1. Priority Multiplier
  const priorityWeight = { 'High': 3.0, 'Medium': 2.0, 'Low': 1.5, 'None': 1.0 }[task.priority] ?? 1.0;
  
  // 2. Base Effort
  let baseEffort = 1;
  if (tags.includes('hard')) baseEffort = 5;
  else if (tags.includes('medium')) baseEffort = 3;
  else if (tags.includes('easy')) baseEffort = 1;

  // 3. Category Multiplier
  const catWeights: Record<string, number> = { 'work': 2.0, 'health': 2.0, 'personal': 1.5, 'routine': 1.0 };
  const categoryWeight = Math.max(...tags.map(tag => catWeights[tag] ?? 1.0), 1.0);

  // 4. Special Tags Multiplier
  let specialMultiplier = 1.0;
  if (tags.includes('challenge')) specialMultiplier *= 2.0;
  if (tags.includes('fitness')) specialMultiplier *= 1.5;

  return Math.round(baseEffort * priorityWeight * categoryWeight * specialMultiplier);
};

export const aggregateDailyScores = (tasks: Task[]) => {
  const scoresByDate: Record<string, number> = {};
  tasks.forEach(task => {
    if (task.completed || task.completedMin) {
      const date = task.date;
      const fullScore = calculateTaskScore(task);
      const score = task.completedMin ? Math.round(fullScore / 2) : task.completed ? fullScore : 0;
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
  tasks.filter(t => t.date === date && (t.completed || t.completedMin)).forEach(t => {
    const fullScore = calculateTaskScore(t);
    const score = t.completedMin ? Math.round(fullScore / 2) : fullScore;
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
  const linkedRecurring = goal.linkedRecurringNames ? goal.linkedRecurringNames.split(',').filter(Boolean) : [];

  let done: number;
  if (linkedRecurring.length > 0 && allTasks) {
    // Recurring-series links (authoritative if isRecurring is true)
    done = allTasks.filter(t =>
      (t.completed || t.completedMin) &&
      t.isRecurring &&
      linkedRecurring.includes(t.name) &&
      t.date >= goal.startDate &&
      t.date <= goal.deadline
    ).length;
  } else if (linkedNames.length > 0 && allTasks) {
    // Name-based fallback
    done = allTasks.filter(t =>
      (t.completed || t.completedMin) &&
      linkedNames.includes(t.name) &&
      t.date >= goal.startDate &&
      t.date <= goal.deadline
    ).length;
  } else if (linkedIds.length > 0) {
    done = linkedIds.filter((id: string) => completedTaskIds.has(id)).length;
  } else {
    done = goal.logs ? goal.logs.length : 0;
  }

  const hasLinkedTasks = linkedRecurring.length > 0 || linkedNames.length > 0 || linkedIds.length > 0;
  let total = 1;
  if (goal.targetCount && goal.targetCount > 0) {
    total = goal.targetCount;
  } else if (goal.startDate && goal.deadline) {
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
