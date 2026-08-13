
import { Urgency, DayOfWeek, Category, TaskStatus, NativeTaskStatus, Recurrence } from './types';

export const URGENCY_CONFIG = {
  [Urgency.CRITICAL]: { label: 'Crítica', color: 'bg-red-500', text: 'text-red-700', border: 'border-red-500', bg: 'bg-red-50' },
  [Urgency.HIGH]: { label: 'Alta', color: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-500', bg: 'bg-orange-50' },
  [Urgency.MEDIUM]: { label: 'Média', color: 'bg-yellow-400', text: 'text-yellow-700', border: 'border-yellow-400', bg: 'bg-yellow-50' },
  [Urgency.LOW]: { label: 'Baixa', color: 'bg-green-500', text: 'text-green-700', border: 'border-green-500', bg: 'bg-green-50' },
};

export interface StatusConfig {
  label: string;
  color: string;
  bg: string;
  text: string;
  border: string;
  description: string;
  isNative?: boolean;
}

export const STATUS_CONFIG: Record<NativeTaskStatus, StatusConfig> = {
  backlog: {
    label: 'Backlog',
    color: 'bg-slate-400',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    description: 'Ideias e tarefas que ainda não entraram na fila imediata. Use para registrar tudo que veio à mente, sem comprometer com prazo.',
    isNative: true,
  },
  todo: {
    label: 'A Fazer',
    color: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-300',
    description: 'Pronta para começar, mas ainda não iniciada. Está na fila e tem o que precisa para ser executada.',
    isNative: true,
  },
  doing: {
    label: 'Em Andamento',
    color: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    description: 'Você está executando ativamente. Idealmente poucas tarefas aqui ao mesmo tempo (foco!).',
    isNative: true,
  },
  blocked: {
    label: 'Bloqueada',
    color: 'bg-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-300',
    description: 'Travada esperando algo ou alguém externo (cliente, fornecedor, aprovação). Anote nas notas quem precisa ser cobrado.',
    isNative: true,
  },
  done: {
    label: 'Concluída',
    color: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    description: 'Finalizada. Vai para o histórico e é mantida por 30 dias.',
    isNative: true,
  },
};

export const NATIVE_STATUS_ORDER: NativeTaskStatus[] = ['backlog', 'todo', 'doing', 'blocked', 'done'];
export const STATUS_ORDER: NativeTaskStatus[] = NATIVE_STATUS_ORDER;

export function isNativeStatus(s: string | undefined): s is NativeTaskStatus {
  return s === 'backlog' || s === 'todo' || s === 'doing' || s === 'blocked' || s === 'done';
}

export function getStatusConfig(s: TaskStatus | undefined, customStatuses: CustomStatus[]): StatusConfig & { customColor?: string } {
  if (!s || isNativeStatus(s)) {
    return STATUS_CONFIG[(s || 'todo') as NativeTaskStatus];
  }
  const custom = customStatuses.find(c => c.id === s);
  if (!custom) return STATUS_CONFIG.todo;
  return {
    label: custom.label,
    color: '',
    bg: '',
    text: '',
    border: '',
    description: custom.description || 'Status personalizado.',
    isNative: false,
    customColor: custom.color,
  };
}

export interface CustomStatus {
  id: string;
  label: string;
  color: string;
  description?: string;
  order: number;
}

export const CUSTOM_STATUSES_KEY = 'planner-hamilton-custom-statuses';

export function loadCustomStatuses(): CustomStatus[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STATUSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomStatuses(list: CustomStatus[]) {
  localStorage.setItem(CUSTOM_STATUSES_KEY, JSON.stringify(list));
}

export function buildAllStatuses(custom: CustomStatus[]): { id: string; cfg: StatusConfig; isNative: boolean }[] {
  const native = NATIVE_STATUS_ORDER.map(s => ({ id: s, cfg: STATUS_CONFIG[s], isNative: true }));
  // Inserir customizados antes de "done" para manter "concluída" sempre por último
  const beforeDone = native.slice(0, -1);
  const done = native[native.length - 1];

  const customCfgs = [...custom]
    .sort((a, b) => a.order - b.order)
    .map(c => ({
      id: c.id,
      cfg: {
        label: c.label,
        color: '',
        bg: '',
        text: '',
        border: '',
        description: c.description || 'Status personalizado.',
        isNative: false,
        // dinâmico via inline style nos componentes
        customColor: c.color,
      } as StatusConfig & { customColor?: string },
      isNative: false,
    }));

  return [...beforeDone, ...customCfgs, done];
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Sem repetição',
  daily: 'Todos os dias',
  weekdays: 'Dias úteis (Seg-Sex)',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

export const DAYS_ORDER: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DAY_LABELS: Record<string, string> = {
  inbox: 'Caixa de Entrada',
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: 'Pessoal', color: '#3b82f6' },
  { id: '2', name: 'Áurea', color: '#8b5cf6' },
  { id: '3', name: 'Tráfego Pago', color: '#10b981' },
  { id: '4', name: 'Consultoria IA', color: '#f59e0b' },
];

export const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
};

export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const todayISO = (): string => formatDate(new Date());

export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const formatPrettyDate = (dateStr?: string): string => {
  if (!dateStr) return 'Sem data';
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export const isOverdue = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  return dateStr < todayISO();
};

export const isToday = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  return dateStr === todayISO();
};

// Ordena tarefas de um mesmo dia por horário (HH:MM asc); sem horário ficam no topo, ordenadas por position.
export const sortTasksByTime = <T extends { scheduledTime?: string; position: number }>(list: T[]): T[] => {
  const withoutTime = list.filter(t => !t.scheduledTime).sort((a, b) => a.position - b.position);
  const withTime = list.filter(t => t.scheduledTime).sort((a, b) => (a.scheduledTime as string).localeCompare(b.scheduledTime as string));
  return [...withoutTime, ...withTime];
};

export const getWeekDates = (startOfWeek: Date): { date: string, label: string, dayKey: DayOfWeek }[] => {
  const days: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.map((day, index) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + index);
    return {
      date: formatDate(d),
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }),
      dayKey: day
    };
  });
};
