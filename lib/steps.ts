import { Task } from '../types';
import { formatDate } from '../constants';

// Etapas de um projeto são tarefas comuns com projectId. Por isso aparecem sozinhas na semana, no
// calendário e na agenda de quem for o responsável, sem nada para sincronizar.

// Ordem do cronograma: por data e horário; etapa sem data vai para o fim, na ordem manual.
export function sortSteps<T extends Pick<Task, 'scheduledDate' | 'scheduledTime' | 'position'>>(steps: T[]): T[] {
  return [...steps].sort((a, b) => {
    if (a.scheduledDate && b.scheduledDate) {
      return (
        a.scheduledDate.localeCompare(b.scheduledDate) ||
        // dentro do mesmo dia, com horário antes de sem horário
        (a.scheduledTime && b.scheduledTime ? a.scheduledTime.localeCompare(b.scheduledTime) : a.scheduledTime ? -1 : b.scheduledTime ? 1 : 0) ||
        a.position - b.position
      );
    }
    if (a.scheduledDate) return -1;
    if (b.scheduledDate) return 1;
    return a.position - b.position;
  });
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// Etapa escorregou? Empurra ela e todas as seguintes (na ordem do cronograma) pelo mesmo número de
// dias. Só mexe em quem tem data, e só em quem ainda não foi concluída: o que já foi feito é
// história e não se reescreve.
export function shiftFollowing(
  steps: Task[],
  fromId: string,
  days: number,
): { id: string; scheduledDate: string }[] {
  const ordered = sortSteps(steps);
  const start = ordered.findIndex(s => s.id === fromId);
  if (start === -1) return [];
  return ordered
    .slice(start)
    .filter(s => s.scheduledDate && !s.isCompleted)
    .map(s => ({ id: s.id, scheduledDate: shiftDate(s.scheduledDate as string, days) }));
}
