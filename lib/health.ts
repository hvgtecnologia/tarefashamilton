import { Task } from '../types';
import { isTaskOverdue } from '../constants';

export type BeltLevel = 'none' | 'ok' | 'warn' | 'bad';

export interface OverdueShare {
  open: number;     // tarefas abertas que cobram (backlog fica de fora)
  overdue: number;  // dessas, quantas estão atrasadas
  pct: number;      // 0-100, arredondado
  level: BeltLevel;
}

// Faixas da cor: até 10% atrasadas está saudável; até 25% pede atenção; acima disso está pesado.
export const BELT_OK_MAX = 10;
export const BELT_WARN_MAX = 25;

// Que parte das tarefas abertas está atrasada. É o termômetro de produtividade da faixa no topo.
// Backlog não entra (é informação do projeto, não cobrança) e concluída nem conta como aberta.
export function overdueShare(tasks: Task[]): OverdueShare {
  const open = tasks.filter(t => !t.isCompleted && !t.deletedAt && t.status !== 'backlog');
  const overdue = open.filter(isTaskOverdue).length;
  if (open.length === 0) return { open: 0, overdue: 0, pct: 0, level: 'none' };
  const pct = Math.round((overdue / open.length) * 100);
  return { open: open.length, overdue, pct, level: pct <= BELT_OK_MAX ? 'ok' : pct <= BELT_WARN_MAX ? 'warn' : 'bad' };
}
