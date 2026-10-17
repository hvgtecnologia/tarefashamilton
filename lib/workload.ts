import { Task } from '../types';
import { shiftDate } from './steps';

export interface WorkloadRow {
  key: string; // userId do membro, ou 'me' para o gestor
  name: string;
  isMe: boolean;
  open: number;
  overdue: number;
  today: number;
  next7: number; // de amanhã até daqui a 7 dias
  undated: number;
}

const dayOf = (t: Task) => t.scheduledDate || t.dueDate;

// Quanto cada pessoa tem de trabalho aberto, para o gestor distribuir melhor.
export function computeWorkload(
  tasks: Task[],
  members: { userId: string; name: string }[],
  today: string,
  ownerLabel = 'Você',
): WorkloadRow[] {
  const limit = shiftDate(today, 7);
  const open = tasks.filter(t => !t.isCompleted && !t.deletedAt);

  const rowFor = (key: string, name: string, isMe: boolean, list: Task[]): WorkloadRow => {
    const row: WorkloadRow = { key, name, isMe, open: list.length, overdue: 0, today: 0, next7: 0, undated: 0 };
    for (const t of list) {
      const day = dayOf(t);
      if (!day) row.undated++;
      else if (day < today) row.overdue++;
      else if (day === today) row.today++;
      else if (day <= limit) row.next7++;
    }
    return row;
  };

  const rows = members.map(m => rowFor(m.userId, m.name, false, open.filter(t => t.assignedTo === m.userId)));
  rows.push(rowFor('me', ownerLabel, true, open.filter(t => !t.assignedTo)));

  // mais carregado primeiro; empate: atrasadas, depois nome
  return rows.sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name));
}
