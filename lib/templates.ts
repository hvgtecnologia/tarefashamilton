import { supabase, isSupabaseConfigured, getCurrentUser } from './supabase';
import { Task } from '../types';
import { sortSteps, shiftDate } from './steps';

// Um modelo guarda as etapas com datas RELATIVAS ao início do projeto ("dia 0, dia 2, dia 3"), para
// montar o próximo projeto parecido informando só a data de começo.
export interface TemplateStep {
  title: string;
  description: string;
  // Dias depois do início. Ausente = etapa sem data.
  offsetDays?: number;
  time?: string;
  assignedTo?: string;
  // Posição (índice) da etapa de que esta depende
  dependsOn?: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  steps: TemplateStep[];
  createdAt: string;
}

export interface PlannedStep extends TemplateStep {
  index: number;
  scheduledDate?: string;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

// Transforma as etapas de um projeto em passos de modelo. A data mais antiga vira o dia 0.
export function buildTemplateSteps(steps: Task[]): TemplateStep[] {
  const ordered = sortSteps(steps);
  const dates = ordered.map(s => s.scheduledDate).filter(Boolean) as string[];
  const base = dates.length > 0 ? dates[0] : undefined; // já em ordem

  const indexById = new Map(ordered.map((s, i) => [s.id, i]));

  return ordered.map(s => {
    const step: TemplateStep = { title: s.title, description: s.description || '' };
    if (base && s.scheduledDate) step.offsetDays = daysBetween(base, s.scheduledDate);
    if (s.scheduledTime) step.time = s.scheduledTime;
    if (s.assignedTo) step.assignedTo = s.assignedTo;
    if (s.dependsOn && indexById.has(s.dependsOn)) step.dependsOn = indexById.get(s.dependsOn);
    return step;
  });
}

// Aplica a data de início. Etapa sem offset continua sem data.
export function planFromTemplate(steps: TemplateStep[], startDate: string): PlannedStep[] {
  return steps.map((s, index) => ({
    ...s,
    index,
    scheduledDate: s.offsetDays !== undefined && startDate ? shiftDate(startDate, s.offsetDays) : undefined,
  }));
}

// Ordem de criação em que cada etapa vem DEPOIS daquela de que depende (o banco precisa do id da
// anterior). Dependência que aponta para algo inexistente, para si mesma ou que forma um ciclo é
// descartada, para um modelo estragado não travar a criação do projeto.
export function creationOrder(steps: TemplateStep[]): { order: number[]; dependsOn: (number | undefined)[] } {
  const dependsOn = steps.map((s, i) =>
    s.dependsOn !== undefined && s.dependsOn !== i && s.dependsOn >= 0 && s.dependsOn < steps.length ? s.dependsOn : undefined,
  );

  // quebra ciclos: segue a cadeia de cada etapa; se voltar a si mesma, corta o último elo
  for (let i = 0; i < steps.length; i++) {
    const seen = new Set<number>([i]);
    let cur = dependsOn[i];
    while (cur !== undefined) {
      if (seen.has(cur)) { dependsOn[i] = undefined; break; }
      seen.add(cur);
      cur = dependsOn[cur];
    }
  }

  const order: number[] = [];
  const done = new Set<number>();
  const visit = (i: number) => {
    if (done.has(i)) return;
    const dep = dependsOn[i];
    if (dep !== undefined) visit(dep);
    done.add(i);
    order.push(i);
  };
  steps.forEach((_, i) => visit(i));
  return { order, dependsOn };
}

// O que veio do banco pode estar incompleto ou estragado: só devolve passos utilizáveis.
export function sanitizeSteps(raw: unknown): TemplateStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => s && typeof s.title === 'string' && s.title.trim())
    .map((s: any): TemplateStep => ({
      title: s.title.trim(),
      description: typeof s.description === 'string' ? s.description : '',
      offsetDays: Number.isFinite(s.offsetDays) ? Math.trunc(s.offsetDays) : undefined,
      time: typeof s.time === 'string' && s.time ? s.time : undefined,
      assignedTo: typeof s.assignedTo === 'string' && s.assignedTo ? s.assignedTo : undefined,
      dependsOn: Number.isInteger(s.dependsOn) ? s.dependsOn : undefined,
    }));
}

// ---------- Banco ----------

const mapTemplate = (row: any): ProjectTemplate => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  color: row.color || '#3b82f6',
  steps: sanitizeSteps(row.steps),
  createdAt: row.created_at,
});

// Só é chamado quando a pessoa abre a lista de modelos, nunca no carregamento da tela: o app já
// custou cota de tráfego por buscar dados a cada foco de aba.
export async function listTemplates(): Promise<ProjectTemplate[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('project_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    if (/project_templates|relation|does not exist/i.test(error.message)) {
      throw new Error('Os modelos ainda não estão ativos: rode o migration-v10-projetos.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return (data || []).map(mapTemplate);
}

export async function createTemplate(input: { name: string; description: string; color: string; steps: TemplateStep[] }): Promise<ProjectTemplate> {
  const userId = (await getCurrentUser())?.id;
  if (!userId) throw new Error('Sessão expirada. Entre novamente.');
  const { data, error } = await supabase
    .from('project_templates')
    .insert({ user_id: userId, name: input.name, description: input.description, color: input.color, steps: input.steps })
    .select('*')
    .single();
  if (error) {
    if (/project_templates|relation|does not exist/i.test(error.message)) {
      throw new Error('Os modelos ainda não estão ativos: rode o migration-v10-projetos.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return mapTemplate(data);
}

export async function updateTemplate(id: string, input: { name: string; description: string; color: string; steps: TemplateStep[] }): Promise<ProjectTemplate> {
  const { data, error } = await supabase
    .from('project_templates')
    .update({ name: input.name, description: input.description, color: input.color, steps: input.steps })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapTemplate(data);
}

// ---------- Editor: linhas da tela <-> etapas do modelo ----------
// Uma linha do editor. "key" identifica a etapa mesmo quando a ordem muda, para a dependência não
// apontar para a etapa errada depois de subir/descer ou apagar.
export interface EditorRow {
  key: string;
  title: string;
  description: string;
  offset: string; // texto do campo "D+"; vazio = sem data
  time: string;
  assignedTo: string;
  dependsOnKey: string;
}

let keySeq = 0;
export const newRowKey = () => `r${Date.now().toString(36)}${(keySeq++).toString(36)}`;
export const blankRow = (): EditorRow => ({ key: newRowKey(), title: '', description: '', offset: '0', time: '', assignedTo: '', dependsOnKey: '' });

export function stepsToRows(steps: TemplateStep[]): EditorRow[] {
  const rows: EditorRow[] = steps.map(s => ({
    key: newRowKey(), title: s.title, description: s.description || '',
    offset: s.offsetDays === undefined ? '' : String(s.offsetDays),
    time: s.time || '', assignedTo: s.assignedTo || '', dependsOnKey: '',
  }));
  steps.forEach((s, i) => { if (s.dependsOn !== undefined && rows[s.dependsOn]) rows[i].dependsOnKey = rows[s.dependsOn].key; });
  return rows;
}

// Valida e converte. Linha sem título é ignorada (a pessoa só clicou em "adicionar etapa" a mais).
// Dependência só vale para etapa que vem ANTES, o que impede ciclo; se a anterior foi apagada ou
// passou para depois, a dependência cai em vez de apontar para a etapa errada.
export function rowsToSteps(rows: EditorRow[]): { steps: TemplateStep[]; error?: undefined } | { steps?: undefined; error: string } {
  const filled = rows.filter(r => r.title.trim());
  if (filled.length === 0) return { error: 'Adicione pelo menos uma etapa com título.' };

  for (const r of filled) {
    const off = r.offset.trim();
    if (off !== '' && !/^\d{1,3}$/.test(off)) {
      return { error: `"${r.title.trim()}": os dias depois do início precisam ser um número (0, 1, 2…).` };
    }
  }

  const indexByKey = new Map<string, number>(filled.map((r, i) => [r.key, i] as [string, number]));
  const steps = filled.map((r, i): TemplateStep => {
    const step: TemplateStep = { title: r.title.trim(), description: r.description.trim() };
    if (r.offset.trim() !== '') step.offsetDays = parseInt(r.offset.trim(), 10);
    if (r.time) step.time = r.time;
    if (r.assignedTo) step.assignedTo = r.assignedTo;
    const dep = r.dependsOnKey ? indexByKey.get(r.dependsOnKey) : undefined;
    if (dep !== undefined && dep < i) step.dependsOn = dep;
    return step;
  });
  return { steps };
}

// "D+0", "D+2": como a automação é escrita e lida
export const offsetLabel = (days?: number) => (days === undefined ? 'sem data' : `D+${days}`);

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('project_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
