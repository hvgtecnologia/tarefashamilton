import { Task, Recurrence } from '../types';
import { formatDate } from '../constants';

// Calcula a próxima data agendada baseada na recorrência
export function getNextRecurrenceDate(baseDate: string | undefined, recurrence: Recurrence): string | undefined {
  if (recurrence === 'none' || !recurrence) return undefined;

  const base = baseDate ? new Date(baseDate + 'T12:00:00') : new Date();
  base.setHours(12, 0, 0, 0);

  switch (recurrence) {
    case 'daily':
      base.setDate(base.getDate() + 1);
      break;
    case 'weekdays': {
      base.setDate(base.getDate() + 1);
      const day = base.getDay();
      if (day === 6) base.setDate(base.getDate() + 2); // sábado -> segunda
      else if (day === 0) base.setDate(base.getDate() + 1); // domingo -> segunda
      break;
    }
    case 'weekly':
      base.setDate(base.getDate() + 7);
      break;
    case 'monthly':
      base.setMonth(base.getMonth() + 1);
      break;
    default:
      return undefined;
  }

  return formatDate(base);
}

// Cria um clone "renovado" da tarefa para a próxima ocorrência
export function buildRecurringClone(task: Task): Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  const nextScheduled = getNextRecurrenceDate(task.scheduledDate, task.recurrence);
  const nextDue = task.dueDate ? getNextRecurrenceDate(task.dueDate, task.recurrence) : undefined;

  return {
    title: task.title,
    description: task.description,
    urgency: task.urgency,
    status: 'todo',
    category: task.category,
    projectId: task.projectId,
    dayOfWeek: nextScheduled ? 'monday' : 'inbox',
    scheduledDate: nextScheduled,
    scheduledTime: task.scheduledTime,
    dueDate: nextDue,
    position: task.position,
    notes: task.notes,
    checklist: (task.checklist || []).map(c => ({ ...c, done: false })),
    recurrence: task.recurrence,
    isCompleted: false,
    completedAt: undefined,
    deletedAt: undefined,
    attachments: task.attachments || [],
  };
}
