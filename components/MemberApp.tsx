import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, RefreshCw, CheckCircle2, AlertTriangle, ClipboardList, PartyPopper, KeyRound, CalendarDays, Columns, RotateCcw } from 'lucide-react';
import { Task, Category, Project, TaskStatus } from '../types';
import { getTasks, getCategories, getProjects, updateTask } from '../lib/storage';
import { signOut } from '../lib/supabase';
import { todayISO, sortTasksByTime, formatPrettyDate, getStartOfWeek } from '../constants';
import TaskCard from './TaskCard';
import MemberTaskModal from './MemberTaskModal';
import ChangePasswordModal from './ChangePasswordModal';
import MemberWeekView from './MemberWeekView';
import { CalendarView } from './CalendarView';

interface MemberAppProps {
  memberName: string;
  onLogout: () => void;
}

type Tab = 'week' | 'calendar' | 'open' | 'done';

const TAB_KEY = 'planner-member-tab';
const TABS: Tab[] = ['week', 'calendar', 'open', 'done'];

// Lembra a última visão escolhida neste aparelho (semana por padrão: é como o membro se programa)
const loadTab = (): Tab => {
  try {
    const saved = localStorage.getItem(TAB_KEY) as Tab | null;
    return saved && TABS.includes(saved) ? saved : 'week';
  } catch {
    return 'week';
  }
};

const taskDay = (t: Task) => t.scheduledDate || t.dueDate;

const MemberApp: React.FC<MemberAppProps> = ({ memberName, onLogout }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTabState] = useState<Tab>(loadTab);
  const [weekStart, setWeekStart] = useState<Date>(() => getStartOfWeek(new Date()));
  const [selected, setSelected] = useState<Task | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const lastFetch = useRef(0);
  const today = todayISO();

  const setTab = (next: Tab) => {
    setTabState(next);
    try { localStorage.setItem(TAB_KEY, next); } catch { /* sem armazenamento: só não lembra */ }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const [t, c, p] = await Promise.all([getTasks(), getCategories(), getProjects()]);
      setTasks(t.filter(task => !task.deletedAt));
      setCategories(c);
      setProjects(p);
      setError('');
      lastFetch.current = Date.now();
    } catch (e) {
      console.error('Erro ao carregar tarefas do membro:', e);
      setError('Não foi possível carregar suas tarefas. Verifique a conexão.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Ao voltar para a aba (no máximo 1x por minuto) busca novas tarefas delegadas
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > 60_000) load(true);
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const groups = useMemo(() => {
    const open = tasks.filter(t => !t.isCompleted);
    const byDayTime = (a: Task, b: Task) =>
      (taskDay(a) || '').localeCompare(taskDay(b) || '') || (a.scheduledTime || '').localeCompare(b.scheduledTime || '');
    return {
      total: open.length,
      overdue: open.filter(t => taskDay(t) && taskDay(t)! < today).sort(byDayTime),
      today: sortTasksByTime(open.filter(t => taskDay(t) === today)),
      upcoming: open.filter(t => taskDay(t) && taskDay(t)! > today).sort(byDayTime),
      noDate: open.filter(t => !taskDay(t)).sort((a, b) => a.position - b.position),
    };
  }, [tasks, today]);

  const completed = useMemo(
    () => tasks
      .filter(t => t.isCompleted)
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()),
    [tasks]
  );

  // Membro só envia o que a regra do banco permite: andamento, subtarefas, retorno, anexos e conclusão
  const applyUpdate = async (id: string, updates: Partial<Task>): Promise<boolean> => {
    const updated = await updateTask(id, updates);
    if (!updated) return false;
    setTasks(prev => prev.map(t => (t.id === id ? updated : t)));
    return true;
  };

  const quickStatus = async (task: Task, status: TaskStatus) => {
    const ok = await applyUpdate(task.id, { status });
    if (!ok) setError('Não foi possível atualizar a tarefa. Tente novamente.');
  };

  const quickComplete = async (task: Task) => {
    if (!confirm(`Concluir "${task.title}"?\n\nSe precisar, você pode reabrir depois em "Concluídas".`)) return;
    const ok = await applyUpdate(task.id, { status: 'done', isCompleted: true, completedAt: new Date().toISOString() });
    if (!ok) setError('Não foi possível concluir a tarefa. Tente novamente.');
  };

  const reopenTask = async (task: Task): Promise<boolean> => {
    const ok = await applyUpdate(task.id, { status: 'todo', isCompleted: false });
    if (!ok) setError('Não foi possível reabrir a tarefa. Tente novamente.');
    return ok;
  };

  // Calendário do mês: tarefa só com prazo (sem data de execução) também aparece no dia do prazo
  const calendarTasks = useMemo(
    () => tasks.map(t => (t.scheduledDate || !t.dueDate ? t : { ...t, scheduledDate: t.dueDate })),
    [tasks]
  );

  const openDay = (date: Date) => {
    setWeekStart(getStartOfWeek(date));
    setTab('week');
  };

  const handleLogout = async () => {
    try { await signOut(); } catch { /* segue para a tela de login mesmo assim */ }
    onLogout();
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = memberName.trim().split(/\s+/)[0] || memberName;

  const renderCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      category={categories.find(c => c.id === task.category)}
      project={task.projectId ? projects.find(p => p.id === task.projectId) : undefined}
      onClick={() => setSelected(task)}
      onComplete={() => quickComplete(task)}
      onChangeStatus={(s) => quickStatus(task, s)}
    />
  );

  const section = (title: string, list: Task[], tone: 'rose' | 'blue' | 'slate') => {
    if (list.length === 0) return null;
    const toneClasses = {
      rose: 'border-rose-400 bg-rose-500',
      blue: 'border-blue-400 bg-blue-500',
      slate: 'border-slate-300 bg-slate-400',
    }[tone];
    return (
      <section key={title}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <span className={`${toneClasses.split(' ')[1]} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>{list.length}</span>
        </div>
        <div className={`space-y-3 ${tone === 'rose' ? 'border-l-4 border-rose-400 pl-3' : ''}`}>{list.map(renderCard)}</div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className={`${tab === 'week' || tab === 'calendar' ? 'max-w-6xl' : 'max-w-3xl'} mx-auto px-4 py-6 pb-16 space-y-6`}>
        {/* Topo */}
        <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-violet-100 text-sm font-medium">{greeting}, {firstName}</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-0.5">Minhas tarefas</h1>
              <p className="text-violet-100 text-sm mt-1">Equipe do Hamilton</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => load(true)}
                disabled={refreshing}
                className="p-2.5 bg-white/15 hover:bg-white/25 rounded-xl"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="px-3 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl flex items-center gap-1.5 text-xs font-bold"
                title="Alterar minha senha"
              >
                <KeyRound className="w-4 h-4" />
                Senha
              </button>
              <button onClick={handleLogout} className="p-2.5 bg-white/15 hover:bg-white/25 rounded-xl" title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/10 rounded-xl p-3 border border-white/20">
              <div className="text-violet-100 text-[11px] font-medium">Abertas</div>
              <div className="text-2xl font-bold">{groups.total}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 border border-white/20">
              <div className="text-violet-100 text-[11px] font-medium">Atrasadas</div>
              <div className="text-2xl font-bold">{groups.overdue.length}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 border border-white/20">
              <div className="text-violet-100 text-[11px] font-medium">Concluídas</div>
              <div className="text-2xl font-bold">{completed.length}</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="text-xs font-bold hover:underline">Fechar</button>
          </div>
        )}

        {/* Abas */}
        <div className="flex flex-wrap bg-slate-200/70 p-1 rounded-xl w-fit gap-0.5">
          {([
            { id: 'week', label: 'Semana', icon: <Columns className="w-4 h-4" /> },
            { id: 'calendar', label: 'Calendário', icon: <CalendarDays className="w-4 h-4" /> },
            { id: 'open', label: `Lista (${groups.total})`, icon: <ClipboardList className="w-4 h-4" /> },
            { id: 'done', label: `Concluídas (${completed.length})`, icon: <CheckCircle2 className="w-4 h-4" /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'week' ? (
          <MemberWeekView
            tasks={tasks}
            categories={categories}
            projects={projects}
            weekStart={weekStart}
            onWeekChange={setWeekStart}
            onTaskClick={setSelected}
            onComplete={quickComplete}
            onChangeStatus={quickStatus}
          />
        ) : tab === 'calendar' ? (
          <CalendarView
            tasks={calendarTasks}
            projects={projects}
            onDayClick={openDay}
            onTaskClick={setSelected}
            embedded
          />
        ) : tab === 'open' ? (
          groups.total === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
              <PartyPopper className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold text-slate-600">Nada pendente por aqui!</p>
              <p className="text-sm text-slate-400 mt-1">Quando o Hamilton delegar uma tarefa, ela aparece nesta tela.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {section('Atrasadas', groups.overdue, 'rose')}
              {section('Hoje', groups.today, 'blue')}
              {section('Próximas', groups.upcoming, 'slate')}
              {section('Sem data', groups.noDate, 'slate')}
            </div>
          )
        ) : completed.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">Você ainda não concluiu tarefas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completed.map(task => (
              <button
                key={task.id}
                onClick={() => setSelected(task)}
                className="w-full text-left bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-500 line-through truncate">{task.title}</p>
                  <p className="text-xs text-slate-400">
                    {task.completedAt ? `Concluída em ${formatPrettyDate(task.completedAt.slice(0, 10))}` : 'Concluída'}
                  </p>
                </div>
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Reabrir "${task.title}"?`)) reopenTask(task);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reabrir
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      {selected && (
        <MemberTaskModal
          task={selected}
          category={categories.find(c => c.id === selected.category)}
          project={selected.projectId ? projects.find(p => p.id === selected.projectId) : undefined}
          onClose={() => setSelected(null)}
          onSave={(updates) => applyUpdate(selected.id, updates)}
          onReopen={() => reopenTask(selected)}
        />
      )}
    </div>
  );
};

export default MemberApp;
