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

// Para quem cada tarefa trabalha: o cliente escrito nela, ou, se não tiver, o negócio/projeto dela.
// No uso real cada projeto É um cliente (Campezza, Cia da Maleta...), então sem esta regra a tela
// ficava vazia até alguém preencher o campo em cada tarefa. O campo continua valendo para quando um
// projeto reúne mais de um cliente ("Áurea e Singular") ou um cliente atravessa vários projetos.
export function clientOf(task: Task, projects: { id: string; name: string }[] = []): string {
  const explicit = task.client?.trim();
  if (explicit) return explicit;
  return projects.find(p => p.id === task.projectId)?.name.trim() || '';
}

export function summarizeClients(tasks: Task[], today: string, projects: { id: string; name: string }[] = []): ClientSummary[] {
  const map = new Map<string, ClientSummary>();
  for (const t of tasks) {
    const name = clientOf(t, projects);
    if (t.deletedAt || !name) continue;
    const key = clientKey(name);
    if (!key) continue;
    let c = map.get(key);
    if (!c) { c = { name: name.replace(/\s+/g, ' '), open: 0, overdue: 0, done: 0, tasks: [] }; map.set(key, c); }
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
export function clientNames(tasks: Task[], projects: { id: string; name: string }[] = []): string[] {
  const seen = new Map<string, string>();
  const add = (raw?: string) => {
    const name = raw?.trim();
    const key = name ? clientKey(name) : '';
    if (name && key && !seen.has(key)) seen.set(key, name.replace(/\s+/g, ' '));
  };
  for (const t of tasks) if (!t.deletedAt) add(t.client);
  // os nomes dos projetos também servem de sugestão: escolher "Campezza" junta com o projeto dele
  for (const p of projects) add(p.name);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
