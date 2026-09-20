import React, { useMemo, useState } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, BarChart3, Calendar, FolderKanban, Activity, ArrowUpRight, Users } from 'lucide-react';
import { Task, Category, Project, TaskStatus } from '../types';
import { useTeam } from './TeamContext';
import { URGENCY_CONFIG, todayISO, isOverdue, formatPrettyDate, parseLocalDate, formatDate } from '../constants';
import TaskListModal from './TaskListModal';

type KpiFilter = 'pending' | 'overdue' | 'doing' | 'completed';

interface DashboardProps {
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  onOpenProject: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onCompleteTask: (id: string) => void;
  onChangeStatus: (id: string, status: TaskStatus) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ tasks, categories, projects, onOpenProject, onTaskClick, onCompleteTask, onChangeStatus }) => {
  const today = todayISO();
  const { members } = useTeam();
  const [activeFilter, setActiveFilter] = useState<KpiFilter | null>(null);

  const stats = useMemo(() => {
    const pending = tasks.filter(t => !t.isCompleted);
    const completed = tasks.filter(t => t.isCompleted);

    const overdue = pending.filter(t => isOverdue(t.dueDate || t.scheduledDate));

    // Próximos 7 dias
    const next7Days: { date: string, label: string, count: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      const count = pending.filter(t => (t.dueDate || t.scheduledDate) === dateStr).length;
      next7Days.push({
        date: dateStr,
        label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }),
        count
      });
    }

    // Tarefas concluídas nos últimos 7 dias
    const completedLast7Days: { date: string, label: string, count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatDate(d);
      const count = completed.filter(t => t.completedAt?.startsWith(dateStr)).length;
      completedLast7Days.push({
        date: dateStr,
        label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }),
        count
      });
    }

    // Por urgência (pendentes)
    const byUrgency = Object.keys(URGENCY_CONFIG).map(key => ({
      urgency: key,
      count: pending.filter(t => t.urgency === key).length,
    }));

    // Por status
    const byStatus = {
      backlog: pending.filter(t => t.status === 'backlog').length,
      todo: pending.filter(t => t.status === 'todo').length,
      doing: pending.filter(t => t.status === 'doing').length,
      blocked: pending.filter(t => t.status === 'blocked').length,
    };

    return {
      total: tasks.length,
      pending: pending.length,
      completed: completed.length,
      overdue: overdue.length,
      next7Days,
      completedLast7Days,
      byUrgency,
      byStatus,
      overdueTasks: overdue.slice(0, 5),
    };
  }, [tasks, today]);

  const maxNext = Math.max(...stats.next7Days.map(d => d.count), 1);
  const maxCompleted = Math.max(...stats.completedLast7Days.map(d => d.count), 1);

  // Stats por projeto
  const projectStats = useMemo(() => {
    return projects.map(p => {
      const pTasks = tasks.filter(t => t.projectId === p.id);
      const pPending = pTasks.filter(t => !t.isCompleted);
      const pCompleted = pTasks.filter(t => t.isCompleted);
      const pOverdue = pPending.filter(t => isOverdue(t.dueDate || t.scheduledDate));
      const total = pPending.length + pCompleted.length;
      const progress = total > 0 ? Math.round((pCompleted.length / total) * 100) : 0;
      return { ...p, pending: pPending.length, completed: pCompleted.length, overdue: pOverdue.length, progress, total };
    }).sort((a, b) => b.pending - a.pending);
  }, [tasks, projects]);

  // Carga por membro da equipe
  const teamStats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const mine = tasks.filter(t => !t.isCompleted && !t.assignedTo);
    const rows = members.map(m => {
      const open = tasks.filter(t => t.assignedTo === m.userId && !t.isCompleted);
      return {
        id: m.userId,
        name: m.name,
        open: open.length,
        overdue: open.filter(t => isOverdue(t.dueDate || t.scheduledDate)).length,
        doneWeek: tasks.filter(t => t.isCompleted && t.completedBy === m.userId && t.completedAt && new Date(t.completedAt).getTime() >= weekAgo).length,
      };
    }).sort((a, b) => b.open - a.open);
    return {
      rows,
      mine: mine.length,
      mineOverdue: mine.filter(t => isOverdue(t.dueDate || t.scheduledDate)).length,
      delegated: tasks.filter(t => !t.isCompleted && t.assignedTo).length,
    };
  }, [tasks, members]);

  // Stats por categoria
  const categoryStats = useMemo(() => {
    return categories.map(c => {
      const cTasks = tasks.filter(t => t.category === c.id && !t.projectId);
      const cPending = cTasks.filter(t => !t.isCompleted);
      return { ...c, pending: cPending.length, total: cTasks.length };
    }).filter(c => c.total > 0)
      .sort((a, b) => b.pending - a.pending);
  }, [tasks, categories]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Painel Geral</h1>
          <p className="text-sm text-slate-500 mt-1">Visão consolidada de todos os seus negócios</p>
        </div>
        <BarChart3 className="w-8 h-8 text-blue-600" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Tarefas Pendentes"
          value={stats.pending}
          icon={<Activity className="w-5 h-5" />}
          color="blue"
          onClick={() => setActiveFilter('pending')}
        />
        <KpiCard
          label="Atrasadas"
          value={stats.overdue}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="rose"
          urgent={stats.overdue > 0}
          onClick={() => setActiveFilter('overdue')}
        />
        <KpiCard
          label="Em Andamento"
          value={stats.byStatus.doing}
          icon={<TrendingUp className="w-5 h-5" />}
          color="amber"
          onClick={() => setActiveFilter('doing')}
        />
        <KpiCard
          label="Concluídas (total)"
          value={stats.completed}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="emerald"
          onClick={() => setActiveFilter('completed')}
        />
      </div>

      {/* Equipe */}
      {members.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-600" />
              <h3 className="font-bold text-slate-800">Carga da equipe</h3>
            </div>
            <span className="text-xs text-slate-400">
              {teamStats.delegated} delegada{teamStats.delegated === 1 ? '' : 's'} · {teamStats.mine} com você
            </span>
          </div>
          <div className="space-y-2">
            {[{ id: 'me', name: 'Eu (sem delegar)', open: teamStats.mine, overdue: teamStats.mineOverdue, doneWeek: -1 }, ...teamStats.rows].map(row => {
              const max = Math.max(teamStats.mine, ...teamStats.rows.map(r => r.open), 1);
              return (
                <div key={row.id} className="flex items-center gap-3">
                  <span className={`text-xs w-28 truncate ${row.id === 'me' ? 'text-slate-400 italic' : 'text-slate-600 font-medium'}`}>
                    {row.name}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden flex">
                    {row.overdue > 0 && (
                      <div
                        className="h-full bg-rose-500 flex items-center justify-center"
                        style={{ width: `${(row.overdue / max) * 100}%` }}
                        title={`${row.overdue} atrasada(s)`}
                      >
                        <span className="text-[10px] font-bold text-white px-1">{row.overdue}</span>
                      </div>
                    )}
                    <div
                      className={`h-full flex items-center justify-end pr-2 ${row.id === 'me' ? 'bg-slate-400' : 'bg-gradient-to-r from-violet-400 to-violet-600'}`}
                      style={{ width: `${((row.open - row.overdue) / max) * 100}%` }}
                    >
                      {row.open - row.overdue > 0 && <span className="text-[10px] font-bold text-white">{row.open - row.overdue}</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold w-24 text-right">
                    {row.doneWeek >= 0 ? `${row.doneWeek} concl. 7d` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos 7 dias */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold text-slate-800">Carga dos Próximos 7 dias</h3>
          </div>
          <div className="space-y-2">
            {stats.next7Days.map(d => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20 capitalize">{d.label}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all flex items-center justify-end pr-2"
                    style={{ width: `${(d.count / maxNext) * 100}%` }}
                  >
                    {d.count > 0 && <span className="text-xs font-bold text-white">{d.count}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Concluídas - últimos 7 dias */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-800">Produtividade - Últimos 7 dias</h3>
          </div>
          <div className="flex items-end gap-2 h-32 mb-2">
            {stats.completedLast7Days.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs font-bold text-slate-600">{d.count > 0 ? d.count : ''}</div>
                <div
                  className="w-full bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-t transition-all"
                  style={{ height: `${Math.max((d.count / maxCompleted) * 100, 4)}%` }}
                />
                <div className="text-[10px] text-slate-500 capitalize">{d.label.split(' ')[0]}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-2">
            Total concluído: <strong>{stats.completedLast7Days.reduce((s, d) => s + d.count, 0)}</strong>
          </p>
        </div>

        {/* Projetos */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <FolderKanban className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-slate-800">Seus Projetos / Negócios</h3>
          </div>

          {projectStats.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-6">
              Nenhum projeto criado ainda. Crie projetos para acompanhar negócios separadamente.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projectStats.map(p => (
                <button
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="group p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/30 transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.progress}%`, backgroundColor: p.color }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <div className="flex gap-3 text-slate-500">
                      <span>{p.pending} pendentes</span>
                      <span>{p.completed} concluídas</span>
                    </div>
                    {p.overdue > 0 && (
                      <span className="text-rose-600 font-bold">{p.overdue} atrasada{p.overdue > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Por urgência */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Por Prioridade</h3>
          <div className="space-y-3">
            {stats.byUrgency.map(u => {
              const cfg = URGENCY_CONFIG[u.urgency as keyof typeof URGENCY_CONFIG];
              const max = Math.max(...stats.byUrgency.map(b => b.count), 1);
              return (
                <div key={u.urgency} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${cfg.color}`} />
                  <span className="text-sm font-medium text-slate-700 w-20">{cfg.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-full ${cfg.color}`} style={{ width: `${(u.count / max) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-8 text-right">{u.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Atrasadas em destaque */}
        <div className="bg-gradient-to-br from-rose-50 to-orange-50 rounded-2xl border border-rose-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <h3 className="font-bold text-rose-900">Atenção: Atrasadas</h3>
          </div>
          {stats.overdueTasks.length === 0 ? (
            <p className="text-sm text-emerald-700 font-medium">🎉 Nenhuma tarefa atrasada!</p>
          ) : (
            <div className="space-y-2">
              {stats.overdueTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => onTaskClick(t)}
                  className="w-full text-left bg-white rounded-lg p-3 border border-rose-100 hover:border-rose-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800 truncate">{t.title}</span>
                    <span className="text-xs font-bold text-rose-600 ml-2 flex-shrink-0">
                      {formatPrettyDate(t.dueDate || t.scheduledDate)}
                    </span>
                  </div>
                </button>
              ))}
              {stats.overdue > 5 && (
                <p className="text-xs text-rose-700 font-bold mt-2 text-center">
                  +{stats.overdue - 5} outras atrasadas
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Categorias secundárias */}
      {categoryStats.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Categorias (Tarefas avulsas)</h3>
          <div className="flex flex-wrap gap-2">
            {categoryStats.map(c => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                style={{ backgroundColor: `${c.color}15`, borderColor: `${c.color}30` }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span className="text-sm font-medium text-slate-700">{c.name}</span>
                <span className="text-xs font-bold text-slate-500">{c.pending}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de filtro KPI */}
      {activeFilter && (() => {
        const filterConfigs: Record<KpiFilter, { title: string; subtitle: string; color: string; tasks: Task[] }> = {
          pending: {
            title: 'Todas as Tarefas Pendentes',
            subtitle: `${stats.pending} pendente${stats.pending !== 1 ? 's' : ''} no momento`,
            color: '#3b82f6',
            tasks: tasks.filter(t => !t.isCompleted).sort((a, b) => {
              const aOver = isOverdue(a.dueDate || a.scheduledDate);
              const bOver = isOverdue(b.dueDate || b.scheduledDate);
              if (aOver !== bOver) return aOver ? -1 : 1;
              return (a.dueDate || a.scheduledDate || '9999') > (b.dueDate || b.scheduledDate || '9999') ? 1 : -1;
            }),
          },
          overdue: {
            title: 'Tarefas Atrasadas',
            subtitle: `${stats.overdue} precisam de ação imediata`,
            color: '#f43f5e',
            tasks: tasks.filter(t => !t.isCompleted && isOverdue(t.dueDate || t.scheduledDate))
              .sort((a, b) => (a.dueDate || a.scheduledDate || '').localeCompare(b.dueDate || b.scheduledDate || '')),
          },
          doing: {
            title: 'Tarefas Em Andamento',
            subtitle: `${stats.byStatus.doing} sendo trabalhada${stats.byStatus.doing !== 1 ? 's' : ''}`,
            color: '#f59e0b',
            tasks: tasks.filter(t => !t.isCompleted && t.status === 'doing'),
          },
          completed: {
            title: 'Tarefas Concluídas',
            subtitle: `${stats.completed} no histórico (últimos 30 dias)`,
            color: '#10b981',
            tasks: tasks.filter(t => t.isCompleted)
              .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')),
          },
        };
        const cfg = filterConfigs[activeFilter];
        return (
          <TaskListModal
            title={cfg.title}
            subtitle={cfg.subtitle}
            accentColor={cfg.color}
            tasks={cfg.tasks}
            categories={categories}
            projects={projects}
            groupByProject={activeFilter === 'pending' || activeFilter === 'overdue'}
            onClose={() => setActiveFilter(null)}
            onTaskClick={(task) => { onTaskClick(task); setActiveFilter(null); }}
            onCompleteTask={onCompleteTask}
            onChangeStatus={onChangeStatus}
          />
        );
      })()}
    </div>
  );
};

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'rose' | 'emerald' | 'amber';
  urgent?: boolean;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon, color, urgent, onClick }) => {
  const colorMap = {
    blue: 'from-blue-500 to-indigo-600',
    rose: 'from-rose-500 to-red-600',
    emerald: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
  };

  const clickable = !!onClick;

  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className={`bg-gradient-to-br ${colorMap[color]} rounded-2xl p-4 md:p-5 text-white shadow-sm text-left w-full ${
        urgent ? 'animate-pulse-slow' : ''
      } ${clickable ? 'hover:shadow-lg hover:scale-[1.02] cursor-pointer transition-all' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/80">{label}</span>
        <span className="opacity-80">{icon}</span>
      </div>
      <div className="text-3xl md:text-4xl font-bold">{value}</div>
      {clickable && value > 0 && (
        <div className="mt-1 text-[10px] text-white/60 font-medium">Clique para ver →</div>
      )}
    </button>
  );
};

export default Dashboard;
