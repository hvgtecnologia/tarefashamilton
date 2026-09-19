import React from 'react';
import { Circle, FileText, Image as ImageIcon, Calendar, CheckSquare, AlertCircle, Repeat } from 'lucide-react';
import { Task, Category, Project, TaskStatus } from '../types';
import { URGENCY_CONFIG, getStatusConfig, isOverdue, formatPrettyDate, isToday, loadCustomStatuses, isNativeStatus, RECURRENCE_SHORT_LABELS } from '../constants';
import { useTeam, firstName } from './TeamContext';

interface TaskCardProps {
  task: Task;
  category?: Category;
  project?: Project;
  onClick: () => void;
  onComplete: () => void;
  onChangeStatus?: (status: TaskStatus) => void;
  compact?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, category, project, onClick, onComplete, onChangeStatus, compact }) => {
  const { findMember } = useTeam();
  const assignee = findMember(task.assignedTo);
  const urgencyStyle = URGENCY_CONFIG[task.urgency];
  const statusStyle = getStatusConfig(task.status, loadCustomStatuses());
  const statusIsCustom = task.status && !isNativeStatus(task.status);
  const dueDate = task.dueDate || task.scheduledDate;
  const overdue = !task.isCompleted && isOverdue(dueDate);
  const dueToday = !task.isCompleted && isToday(dueDate);

  const checklist = task.checklist || [];
  const checklistDone = checklist.filter(c => c.done).length;
  const checklistTotal = checklist.length;
  const checklistProgress = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const handleStatusCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onChangeStatus) return;
    const order: TaskStatus[] = ['todo', 'doing', 'done'];
    const current = task.status || 'todo';
    const idx = order.indexOf(current);
    const next = order[(idx + 1) % order.length];
    if (next === 'done') {
      onComplete();
    } else {
      onChangeStatus(next);
    }
  };

  return (
    <div
      className={`group relative bg-white border rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden ${
        overdue ? 'border-rose-300' : 'border-slate-200'
      } ${compact ? 'p-3' : 'p-4'}`}
      onClick={onClick}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${urgencyStyle?.color || 'bg-gray-500'}`} />

      <div className="flex flex-col space-y-2">
        {/* Top row: tags */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-hidden flex-wrap">
            {project ? (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider truncate"
                style={{ backgroundColor: `${project.color}15`, color: project.color, border: `1px solid ${project.color}30` }}
              >
                {project.name}
              </span>
            ) : category ? (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider truncate"
                style={{ backgroundColor: `${category.color}15`, color: category.color }}
              >
                {category.name}
              </span>
            ) : null}

            {/* Status badge */}
            {task.status && task.status !== 'todo' && (
              statusIsCustom ? (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: `${statusStyle.customColor}15`,
                    color: statusStyle.customColor,
                    border: `1px solid ${statusStyle.customColor}30`
                  }}
                >
                  {statusStyle.label}
                </span>
              ) : (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
              )
            )}

            {assignee && (
              <span
                className="text-[9px] font-bold pl-0.5 pr-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 flex items-center gap-1 flex-shrink-0"
                title={`Responsável: ${assignee.name}`}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-violet-600 text-white flex items-center justify-center text-[8px] uppercase">
                  {assignee.name.charAt(0)}
                </span>
                {firstName(assignee.name)}
              </span>
            )}

            {task.recurrence && task.recurrence !== 'none' && (
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-indigo-50 text-indigo-600 flex items-center gap-0.5 flex-shrink-0"
                title={`Tarefa recorrente: ${RECURRENCE_SHORT_LABELS[task.recurrence]}`}
              >
                <Repeat className="w-2.5 h-2.5" />
                {RECURRENCE_SHORT_LABELS[task.recurrence]}
              </span>
            )}
          </div>

          <button
            onClick={handleStatusCycle}
            className="text-slate-300 hover:text-emerald-500 transition-colors flex-shrink-0"
            title="Avançar status (Todo → Doing → Done)"
          >
            <Circle className="w-5 h-5" />
          </button>
        </div>

        {/* Title */}
        <h4 className={`font-semibold text-slate-800 leading-tight ${compact ? 'text-sm line-clamp-2' : 'text-sm line-clamp-3'}`}>
          {task.title}
        </h4>

        {/* Checklist progress */}
        {checklistTotal > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                {checklistDone}/{checklistTotal}
              </span>
              <span className="font-bold">{checklistProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${checklistProgress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${checklistProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Bottom: meta */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2.5 text-slate-400">
            {dueDate && (
              <div className={`flex items-center gap-1 ${overdue ? 'text-rose-600 font-bold' : dueToday ? 'text-blue-600 font-bold' : ''}`}>
                {overdue ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                <span className="text-[10px]">
                  {overdue ? 'Atrasada · ' : ''}{formatPrettyDate(dueDate)}{task.scheduledTime ? ` · ${task.scheduledTime}` : ''}
                </span>
              </div>
            )}
            {(task.notes || task.description) && (
              <FileText className="w-3 h-3" />
            )}
            {task.attachments && task.attachments.length > 0 && (
              <div className="flex items-center">
                <ImageIcon className="w-3 h-3 mr-0.5" />
                <span className="text-[10px]">{task.attachments.length}</span>
              </div>
            )}
          </div>

          <span className={`text-[9px] font-bold ${urgencyStyle?.text || 'text-slate-500'}`}>
            {urgencyStyle?.label || task.urgency}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
