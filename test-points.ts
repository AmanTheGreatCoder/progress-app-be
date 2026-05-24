import { calculateTaskScore } from './utils';
import type { Task } from '@prisma/client';

const runTest = (name: string, task: Partial<Task>, expected: number) => {
  const score = calculateTaskScore(task as Task);
  console.log(`${name}: ${score === expected ? '✅ PASS' : '❌ FAIL'} (Got ${score}, Expected ${expected})`);
};

runTest('Run 5k (Health, e5, fitness, High)', { priority: 'High', tags: 'Health,e5,fitness' }, 45);
runTest('Read emails (Routine, None)', { priority: 'None', tags: 'Routine' }, 1);
runTest('Ship new feature (Work, e10, challenge, Medium)', { priority: 'Medium', tags: 'Work,e10,challenge' }, 80);
runTest('No tags (Low)', { priority: 'Low', tags: '' }, 2); // 1 (Base) * 1.5 (Low) * 1.0 (Category) * 1.0 (Special) = 1.5 => round => 2
runTest('Manual points override', { priority: 'High', tags: '', points: 100 }, 100);

console.log('Tests finished.');
