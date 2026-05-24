import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { Task, DayOfWeek, Category, Project, TaskStatus } from '../types';
import { DAY_LABELS, todayISO } from '../constants';
import TaskCard from './TaskCard';

interface KanbanBoardProps {
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  weekColumns: { date: string, label: string, dayKey: DayOfWeek }[];
  onTaskClick: (task: Task) => void;
  onCompleteTask: (id: string) => void;
  onChangeStatus: (id: string, status: TaskStatus) => void;
  onQuickAddForDate: (date: string) => void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tasks, categories, projects, weekColumns, onTaskClick, onCompleteTask, onChangeStatus, onQuickAddForDate
}) => {
  const today = todayISO();

  const columns = [
    { id: 'inbox', label: DAY_LABELS['inbox'], isInbox: true, date: null as string | null, isToday: false },
    ...weekColumns.map(c => ({ id: c.date, label: c.label, isInbox: false, date: c.date, isToday: c.date === today }))
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-3">
      {columns.map(col => {
        let colTasks: Task[];
        if (col.isInbox) {
          // Inbox = sem data + atrasadas (scheduledDate anterior a hoje)
          const noDate = tasks
            .filter(t => t.dayOfWeek === 'inbox' || !t.scheduledDate)
            .sort((a, b) => a.position - b.position);

          const overdue = tasks
            .filter(t => t.scheduledDate && t.scheduledDate < today && t.dayOfWeek !== 'inbox')
            .sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '')); // antiga -> recente

          colTasks = [...noDate, ...overdue];
        } else {
          colTasks = tasks
            .filter(t => t.scheduledDate === col.id)
            .sort((a, b) => a.position - b.position);
        }

        return (
          <div key={col.id} className="flex flex-col">
            <div className={`flex items-center justify-between mb-3 px-2 ${col.isToday ? 'bg-blue-100 rounded-lg py-1.5' : ''}`}>
              <div className="flex flex-col">
                <h3 className={`font-bold text-xs tracking-wide uppercase ${
                  col.isInbox ? 'text-blue-600' : col.isToday ? 'text-blue-700' : 'text-slate-700'
                }`}>
                  {col.label}{col.isToday ? ' · HOJE' : ''}
                </h3>
                {col.isInbox ? (
                  <span className="text-[9px] text-slate-400 font-medium">Sem data + atrasadas</span>
                ) : (
                  <span className="text-[9px] text-slate-400 font-medium">Programado</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
                {col.date && (
                  <button
                    onClick={() => onQuickAddForDate(col.date!)}
                    className="p-0.5 hover:bg-white rounded text-slate-400 hover:text-blue-600"
                    title="Adicionar nesta data"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <Droppable droppableId={col.id}>
              {(provided, snapshot) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`min-h-[200px] rounded-xl transition-colors duration-200 p-1.5 ${
                    snapshot.isDraggingOver ? 'bg-blue-50/60 outline outline-2 outline-dashed outline-blue-300' : col.isToday ? 'bg-blue-50/30' : 'bg-slate-100/30'
                  }`}
                >
                  <div className="space-y-2">
                    {colTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`transition-all ${snapshot.isDragging ? 'scale-[1.02] rotate-1 z-50 shadow-xl' : ''}`}
                            style={provided.draggableProps.style}
                          >
                            <TaskCard
                              task={task}
                              category={categories.find(c => c.id === task.category)}
                              project={task.projectId ? projects.find(p => p.id === task.projectId) : undefined}
                              onClick={() => onTaskClick(task)}
                              onComplete={() => onCompleteTask(task.id)}
                              onChangeStatus={(s) => onChangeStatus(task.id, s)}
                              compact
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          </div>
        );
      })}
    </div>
  );
};

export default KanbanBoard;
