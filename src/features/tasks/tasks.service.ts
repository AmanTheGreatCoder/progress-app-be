import { prisma } from '../../shared/config/db.js';

export async function getTasksByFilter(where: any) {
  return prisma.task.findMany({ where, orderBy: { date: 'asc' } });
}

export async function getTaskSeries() {
  return prisma.taskSeries.findMany({ orderBy: { name: 'asc' } });
}

export async function updateTaskCompletion(id: string, completed: boolean) {
  return prisma.task.update({ where: { id }, data: { completed } });
}

export async function deleteTask(id: string) {
  return prisma.task.delete({ where: { id } });
}
