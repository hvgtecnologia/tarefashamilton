import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Inbox, CheckCircle2 } from 'lucide-react';
import { Task, Category, Project, TaskStatus } from '../types';
import { todayISO, getWeekDates, getStartOfWeek, sortTasksByTime } from '../constants';
import TaskCard from './TaskCard';

interface MemberWeekViewProps {
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  onTaskClick: (task: Task) => void;
  onComplete: (task: Task) => void;
  onChangeStatus: (task: Task, status: TaskStatus) => void;
}

const taskDay = (t: Task) => t.scheduledDate || t.dueDate;

// Semana do membro: mesma ideia do quadro do gestor (uma coluna por dia + atrasadas/sem data),
// só para ler e planejar. Mudar data/horário de uma tarefa continua sendo do gestor.
const MemberWeekView: React.FC<MemberWeekViewProps> = ({
  tasks, categories, projects, weekStart, onWeekChange, onTaskClick, onComplete, onChangeStatus,
}) => {
  const today = todayISO();
  const weekColumns = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const columns = useMemo(() => {
    const open = tasks.filter(t => !t.isCompleted);
    const byDayTime = (a: Task, b: Task) =>
      (taskDay(a) || '').localeCompare(taskDay(b) || '') || (a.scheduledTime || '').localeCompare(b.scheduledTime || '');

    const backlog = [
      ...open.filter(t => taskDay(t) && taskDay(t)! < today).sort(byDayTime),
      ...open.filter(t => !taskDay(t)).sort((a, b) => a.position - b.position),
    ];

    const days = weekColumns.map(col => ({
      key: col.date,
      label: col.label,
      isToday: col.date === today,
      // Dia que já passou: o que ficou aberto está em "Atrasadas" (não repete o mesmo cartão duas vezes)
      open: col.date >= today ? sortTasksByTime(open.filter(t => taskDay(t) === col.date)) : [],
      done: tasks.filter(t => t.isCompleted && taskDay(t) === col.date).length,
    }));

    return { backlog, days };
  }, [tasks, weekColumns, today]);

  const changeWeek = (direction: number) => {
    const next = new Date(weekStart);
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + direction * 7);
    onWeekChange(getStartOfWeek(next));
  };

  const renderCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      category={categories.find(c => c.id === task.category)}
      project={task.projectId ? projects.find(p => p.id === task.projectId) : undefined}
      onClick={() => onTaskClick(task)}
      onComplete={() => onComplete(task)}
      onChangeStatus={(s) => onChangeStatus(task, s)}
      compact
    />
  );

  const isCurrentWeek = getStartOfWeek(new Date()).getTime() === weekStart.getTime();

  return (
    <div className="space-y-4">
      {/* Navegação da semana */}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
          <button onClick={() => changeWeek(-1)} className="p-1.5 hover:bg-slate-100 rounded" title="Semana anterior">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div className="px-3 flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <CalendarIcon className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">
              {weekColumns[0] && new Date(weekColumns[0].date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
              {' – '}
              {weekColumns[6] && new Date(weekColumns[6].date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          <button onClick={() => changeWeek(1)} className="p-1.5 hover:bg-slate-100 rounded" title="Próxima semana">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        {!isCurrentWeek && (
          <button
            onClick={() => onWeekChange(getStartOfWeek(new Date()))}
            className="px-3 py-1.5 text-xs font-bold bg-white text-blue-600 rounded-lg border shadow-sm hover:bg-blue-50"
          >
            Voltar para esta semana
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Atrasadas + sem data */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex flex-col">
              <h3 className="font-bold text-xs tracking-wide uppercase text-rose-600 flex items-center gap-1">
                <Inbox className="w-3.5 h-3.5" /> Atrasadas / sem data
              </h3>
              <span className="text-[9px] text-slate-400 font-medium">Precisam de atenção</span>
            </div>
            <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{columns.backlog.length}</span>
          </div>
          <div className="min-h-[120px] rounded-xl p-1.5 bg-rose-50/40 space-y-2">
            {columns.backlog.length === 0
              ? <p className="text-[11px] text-slate-400 italic text-center py-6">Nada atrasado 🎉</p>
              : columns.backlog.map(renderCard)}
          </div>
        </div>

        {/* Um dia por coluna */}
        {columns.days.map(day => (
          <div key={day.key} className="flex flex-col">
            <div className={`flex items-center justify-between mb-3 px-2 ${day.isToday ? 'bg-blue-100 rounded-lg py-1.5' : ''}`}>
              <div className="flex flex-col">
                <h3 className={`font-bold text-xs tracking-wide uppercase ${day.isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                  {day.label}{day.isToday ? ' · HOJE' : ''}
                </h3>
                {day.done > 0 && (
                  <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" /> {day.done} concluída{day.done > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{day.open.length}</span>
            </div>
            <div className={`min-h-[120px] rounded-xl p-1.5 space-y-2 ${day.isToday ? 'bg-blue-50/40' : 'bg-slate-100/40'}`}>
              {day.open.length === 0
                ? <p className="text-[11px] text-slate-300 text-center py-6">—</p>
                : day.open.map(renderCard)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MemberWeekView;
