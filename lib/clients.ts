import { Task } from '../types';

export interface ClientSummary {
  name: string;
  open: number;
  overdue: number;
  done: number;
  tasks: Task[];
}

// "Empresa X", "empresa x " e "Empresa X" são o mesmo cliente.
export const clientKey = (name: string) =>
  name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const dayOf = (t: Task) => t.scheduledDate || t.dueDate;

export function summarizeClients(tasks: Task[], today: string): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const t of tasks) {
    if (t.deletedAt || !t.client || !t.client.trim()) continue;
    const key = clientKey(t.client);
    if (!key) continue;
    let c = map.get(key);
    if (!c) { c = { name: t.client.trim().replace(/\s+/g, ' '), open: 0, overdue: 0, done: 0, tasks: [] }; map.set(key, c); }
    c.tasks.push(t);
    if (t.isCompleted) c.done++;
    else {
      c.open++;
      const day = dayOf(t);
      if (day && day < today) c.overdue++;
    }
  }
  return [...map.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));
}

// Nomes já usados, para sugerir ao digitar (evita "Empresa X" e "Empresa  X" virarem dois).
export function clientNames(tasks: Task[]): string[] {
  const seen = new Map<string, string>();
  for (const t of tasks) {
    if (t.deletedAt || !t.client || !t.client.trim()) continue;
    const key = clientKey(t.client);
    if (key && !seen.has(key)) seen.set(key, t.client.trim().replace(/\s+/g, ' '));
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
