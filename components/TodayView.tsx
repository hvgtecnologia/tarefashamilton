import React, { useMemo } from 'react';
import { AlertCircle, Calendar, Inbox, CheckCircle2, Target, TrendingUp, Flame, Clock } from 'lucide-react';
import { Task, Category, Project, TaskStatus } from '../types';
import { URGENCY_CONFIG, todayISO, isOverdue, parseLocalDate, formatPrettyDate, sortTasksByTime } from '../constants';
import TaskCard from './TaskCard';

interface TodayViewProps {
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  onTaskClick: (task: Task) => void;
  onCompleteTask: (id: string) => void;
  onChangeStatus: (id: string, status: TaskStatus) => void;
  onOpenProject: (id: string) => void;
  onQuickAdd: () => void;
}

const TodayView: React.FC<TodayViewProps> = ({
  tasks,
  categories,
  projects,
  onTaskClick,
  onCompleteTask,
  onChangeStatus,
  onOpenProject,
  onQuickAdd,
}) => {
  const today = todayISO();

  const groups = useMemo(() => {
    const pending = tasks.filter(t => !t.isCompleted);

    const overdueList = pending.filter(t => {
      const due = t.dueDate || t.scheduledDate;
      return due && due < today;
    });

    const todayList = sortTasksByTime(pending.filter(t => {
      const due = t.dueDate || t.scheduledDate;
      return due === today;
    }));

    const inProgressList = pending.filter(t => t.status === 'doing' && !todayList.includes(t) && !overdueList.includes(t));
    const blockedList = pending.filter(t => t.status === 'blocked');

    const completedToday = tasks.filter(t => {
      if (!t.isCompleted || !t.completedAt) return false;
      return t.completedAt.startsWith(today);
    });

    return { overdueList, todayList, inProgressList, blockedList, completedToday };
  }, [tasks, today]);

  // Stats por categoria/projeto
  const businessStats = useMemo(() => {
    const items = [...projects.map(p => ({ id: p.id, name: p.name, color: p.color, kind: 'project' as const })),
                   ...categories.map(c => ({ id: c.id, name: c.name, color: c.color, kind: 'category' as const }))];

    return items.map(item => {
      const taskList = tasks.filter(t => {
        if (item.kind === 'project') return t.projectId === item.id;
        return t.category === item.id && !t.projectId;
      });
      const pending = taskList.filter(t => !t.isCompleted);
      const overdue = pending.filter(t => isOverdue(t.dueDate || t.scheduledDate));
      const done = taskList.filter(t => t.isCompleted);
      const total = pending.length + done.length;
      const progress = total > 0 ? Math.round((done.length / total) * 100) : 0;
      return { ...item, pending: pending.length, overdue: overdue.length, done: done.length, progress };
    }).filter(s => s.pending + s.done > 0)
      .sort((a, b) => b.pending - a.pending);
  }, [tasks, projects, categories]);

  const todayDate = new Date();
  const greeting = todayDate.getHours() < 12 ? 'Bom dia' : todayDate.getHours() < 18 ? 'Boa tarde' : 'Boa noite';

  const renderTask = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      category={categories.find(c => c.id === task.category)}
      project={task.projectId ? projects.find(p => p.id === task.projectId) : undefined}
      onClick={() => onTaskClick(task)}
      onComplete={() => onCompleteTask(task.id)}
      onChangeStatus={(s) => onChangeStatus(task.id, s)}
    />
  );

  const todayTasksCount = groups.todayList.length + groups.overdueList.length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero / Greeting */}
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 md:p-8 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-blue-100 text-sm font-medium mb-1">{greeting}, Hamilton</p>
            <h1 className="text-3xl md:text-4xl font-bold">
              {todayDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h1>
            <p className="text-blue-100 mt-2">
              {todayTasksCount === 0
                ? '🎉 Nada urgente para hoje. Tempo de planejar a próxima jogada.'
                : `${todayTasksCount} tarefa${todayTasksCount > 1 ? 's' : ''} ${groups.overdueList.length > 0 ? `(${groups.overdueList.length} atrasada${groups.overdueList.length > 1 ? 's' : ''})` : 'no radar'} hoje.`
              }
            </p>
          </div>
          <button
            onClick={onQuickAdd}
            className="bg-white text-blue-700 font-bold px-5 py-3 rounded-xl shadow hover:bg-blue-50 transition-all whitespace-nowrap flex items-center gap-2"
          >
            <Target className="w-4 h-4" />
            Adicionar tarefa rápida
          </button>
        </div>

        {/* Mini-KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="flex items-center gap-2 text-blue-100 text-xs font-medium">
              <Flame className="w-3 h-3" />
              Atrasadas
            </div>
            <div className="text-2xl font-bold mt-1">{groups.overdueList.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="flex items-center gap-2 text-blue-100 text-xs font-medium">
              <Calendar className="w-3 h-3" />
              Hoje
            </div>
            <div className="text-2xl font-bold mt-1">{groups.todayList.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="flex items-center gap-2 text-blue-100 text-xs font-medium">
              <Clock className="w-3 h-3" />
              Em andamento
            </div>
            <div className="text-2xl font-bold mt-1">{groups.inProgressList.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/20">
            <div className="flex items-center gap-2 text-blue-100 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Concluídas hoje
            </div>
            <div className="text-2xl font-bold mt-1">{groups.completedToday.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Atrasadas */}
          {groups.overdueList.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-rose-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                </div>
                <h2 className="font-bold text-slate-800">Atrasadas</h2>
                <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {groups.overdueList.length}
                </span>
              </div>
              <div className="space-y-3 border-l-4 border-rose-400 pl-3">
                {groups.overdueList.map(renderTask)}
              </div>
            </section>
          )}

          {/* Hoje */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-100 rounded-lg">
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="font-bold text-slate-800">Foco de hoje</h2>
              <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {groups.todayList.length}
              </span>
            </div>
            {groups.todayList.length === 0 ? (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 font-medium">Nenhuma tarefa agendada para hoje</p>
                <button
                  onClick={onQuickAdd}
                  className="mt-3 text-sm text-blue-600 hover:underline font-semibold"
                >
                  + Adicionar agora
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.todayList.map(renderTask)}
              </div>
            )}
          </section>

          {/* Em andamento (não-hoje) */}
          {groups.inProgressList.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="font-bold text-slate-800">Em andamento</h2>
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {groups.inProgressList.length}
                </span>
              </div>
              <div className="space-y-3">
                {groups.inProgressList.map(renderTask)}
              </div>
            </section>
          )}

          {/* Bloqueadas */}
          {groups.blockedList.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-rose-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                </div>
                <h2 className="font-bold text-slate-800">Bloqueadas</h2>
                <span className="bg-rose-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {groups.blockedList.length}
                </span>
              </div>
              <div className="space-y-3">
                {groups.blockedList.map(renderTask)}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar de Negócios */}
        <aside className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-slate-800">Seus negócios</h3>
            </div>
            {businessStats.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Crie projetos ou categorias para acompanhar seus negócios.</p>
            ) : (
              <div className="space-y-3">
                {businessStats.map(b => (
                  <button
                    key={`${b.kind}-${b.id}`}
                    onClick={() => b.kind === 'project' && onOpenProject(b.id)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: b.color }}
                        />
                        <span className="text-sm font-semibold text-slate-700 truncate group-hover:text-blue-600">
                          {b.name}
                        </span>
                        {b.kind === 'project' && (
                          <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">proj</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                        {b.overdue > 0 && (
                          <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            {b.overdue}!
                          </span>
                        )}
                        <span className="text-slate-500 font-medium">{b.pending}</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${b.progress}%`, backgroundColor: b.color }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                      <span>{b.progress}% concluído</span>
                      <span>{b.done}/{b.done + b.pending}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conquistas do dia */}
          {groups.completedToday.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-emerald-800">Vitórias de hoje</h3>
              </div>
              <div className="space-y-2">
                {groups.completedToday.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-start gap-2 text-sm">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    <span className="text-emerald-900 line-through opacity-70">{t.title}</span>
                  </div>
                ))}
                {groups.completedToday.length > 5 && (
                  <p className="text-xs text-emerald-700 font-bold mt-2">
                    +{groups.completedToday.length - 5} mais!
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default TodayView;
