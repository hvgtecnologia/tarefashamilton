import { Task } from '../types';

// Tarefas concluídas ficam no histórico por este tempo; depois são apagadas automaticamente.
export const COMPLETED_RETENTION_DAYS = 60;

export const ATTACHMENTS_BUCKET = 'attachments';

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_PREFIX = `/storage/v1/object/public/${ATTACHMENTS_BUCKET}/`;

// Dias que faltam para a tarefa concluída ser apagada (null se não há data de conclusão)
export function daysUntilPurge(completedAt?: string, now = Date.now()): number | null {
  if (!completedAt) return null;
  const done = new Date(completedAt).getTime();
  if (Number.isNaN(done)) return null;
  const remainingMs = COMPLETED_RETENTION_DAYS * DAY_MS - (now - done);
  return Math.max(0, Math.ceil(remainingMs / DAY_MS));
}

// Só entra na limpeza o que é claramente antigo E o gestor já viu:
// - sem data de conclusão: nunca apaga (não dá para saber a idade)
// - conclusão da equipe ainda não vista: fica, para você não perder o aviso
export function isExpiredCompleted(task: Task, now = Date.now()): boolean {
  if (!task.isCompleted || !task.completedAt || task.deletedAt) return false;
  if (task.completionSeen === false) return false;
  const done = new Date(task.completedAt).getTime();
  return !Number.isNaN(done) && now - done > COMPLETED_RETENTION_DAYS * DAY_MS;
}

// "https://.../storage/v1/object/public/attachments/<uid>/<arquivo>" -> "<uid>/<arquivo>"
export function storagePathFromUrl(url: string): string | null {
  const i = url.indexOf(PUBLIC_PREFIX);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + PUBLIC_PREFIX.length).split('?')[0]);
  } catch {
    return null;
  }
}

// Arquivos das tarefas apagadas que NENHUMA tarefa restante usa. Tarefas recorrentes copiam os
// mesmos anexos para a próxima ocorrência, então apagar o arquivo do "molde" quebraria a tarefa viva.
export function unreferencedFilePaths(deleted: Task[], remaining: Task[]): string[] {
  const stillUsed = new Set<string>();
  for (const t of remaining) for (const a of t.attachments || []) stillUsed.add(a.url);

  const paths = new Set<string>();
  for (const t of deleted) {
    for (const a of t.attachments || []) {
      if (stillUsed.has(a.url)) continue;
      const path = storagePathFromUrl(a.url);
      if (path) paths.add(path);
    }
  }
  return [...paths];
}
