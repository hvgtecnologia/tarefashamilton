import React, { useState, useMemo, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, ArrowLeft, Settings, Trash2, AlertCircle, X, HelpCircle, Layers, Users } from 'lucide-react';
import { Project, Task, Category, TaskStatus, Urgency } from '../types';
import { STATUS_CONFIG, NATIVE_STATUS_ORDER, isOverdue, isTaskOverdue, CustomStatus, loadCustomStatuses, saveCustomStatuses, buildAllStatuses } from '../constants';
import TaskCard from './TaskCard';
import Tooltip from './Tooltip';
import StatusManager from './StatusManager';
import ProjectSteps from './ProjectSteps';

interface ProjectBoardProps {
  project: Project;
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  onBack: () => void;
  onAddTask: (data: Partial<Task>) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onCompleteTask: (id: string) => void;
  onTaskClick: (task: Task) => void;
  onDeleteProject: () => void;
  onEditProject: (updates: Partial<Project>) => void;
  // Quem não administra o projeto (só enxerga porque recebeu uma tarefa nele) vê o quadro, sem editar
  canManage?: boolean;
  peopleCount?: number;
  onOpenPeople?: () => void;
  // Abre a janela de automações já apontando para este projeto
  onApplyAutomation?: () => void;
}

const ProjectBoard: React.FC<ProjectBoardProps> = ({
  project, tasks, categories, projects,
  onBack, onAddTask, onUpdateTask, onCompleteTask, onTaskClick,
  onDeleteProject, onEditProject, canManage = true, peopleCount = 0, onOpenPeople, onApplyAutomation,
}) => {
  // Quadro por status, ou cronograma de etapas com data/horário/responsável
  const [viewMode, setViewMode] = useState<'board' | 'steps'>('board');
  const [quickAddCol, setQuickAddCol] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showStatusManager, setShowStatusManager] = useState(false);
  const [customStatuses, setCustomStatuses] = useState<CustomStatus[]>([]);
  const [editName, setEditName] = useState(project.name);
  const [editColor, setEditColor] = useState(project.color);
  const [editDescription, setEditDescription] = useState(project.description);

  useEffect(() => {
    setCustomStatuses(loadCustomStatuses());
  }, []);

  const allStatuses = useMemo(() => buildAllStatuses(customStatuses), [customStatuses]);

  const projectTasks = useMemo(() => tasks.filter(t => t.projectId === project.id), [tasks, project.id]);

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    allStatuses.forEach(s => { map[s.id] = []; });

    projectTasks.forEach(t => {
      const statusKey = t.isCompleted ? 'done' : (t.status || 'todo');
      if (map[statusKey]) {
        map[statusKey].push(t);
      } else {
        // Status órfão (custom apagado) → manda pra "A Fazer"
        map['todo'] = map['todo'] || [];
        map['todo'].push(t);
      }
    });

    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => a.position - b.position);
    });
    return map;
  }, [projectTasks, allStatuses]);

  const totalTasks = projectTasks.length;
  const doneCount = tasksByStatus.done?.length || 0;
  const progress = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const overdueCount = projectTasks.filter(isTaskOverdue).length;

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId;
    const task = projectTasks.find(t => t.id === draggableId);
    if (!task) return;

    const updates: Partial<Task> = { status: newStatus as TaskStatus };
    if (newStatus === 'done') {
      updates.isCompleted = true;
      updates.completedAt = new Date().toISOString();
    } else if (task.isCompleted) {
      updates.isCompleted = false;
      updates.completedAt = undefined;
    }

    onUpdateTask(draggableId, updates);
  };

  const handleQuickAdd = (status: string) => {
    if (!quickAddText.trim()) {
      setQuickAddCol(null);
      return;
    }
    onAddTask({ title: quickAddText.trim(), status: status as TaskStatus });
    setQuickAddText('');
  };

  const handleSaveSettings = () => {
    onEditProject({ name: editName, color: editColor, description: editDescription });
    setShowSettings(false);
  };

  const handleSaveStatuses = (list: CustomStatus[]) => {
    saveCustomStatuses(list);
    setCustomStatuses(list);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="bg-white border-b px-4 md:px-6 py-4 flex items-center justify-between gap-4 flex-shrink-0"
        style={{ borderTop: `4px solid ${project.color}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-white text-lg"
            style={{ backgroundColor: project.color }}
          >
            {project.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-slate-900 truncate">{project.name}</h1>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{totalTasks} tarefa{totalTasks !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span className="font-bold text-emerald-600">{progress}% completo</span>
              {overdueCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {overdueCount} atrasada{overdueCount > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Adicione, edite ou remova colunas de status (ex: 'Aguardando Aprovação', 'Em Revisão')" title="Gerenciar Status" position="bottom" width="md">
            <button
              onClick={() => setShowStatusManager(true)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            >
              <Layers className="w-5 h-5" />
            </button>
          </Tooltip>
          {canManage && onOpenPeople && (
            <button
              onClick={onOpenPeople}
              className="flex items-center gap-1.5 px-2.5 py-2 hover:bg-slate-100 rounded-lg text-slate-600 text-sm font-semibold transition-colors"
              title="Quem trabalha neste projeto"
            >
              <Users className="w-4 h-4" />
              Pessoas{peopleCount > 0 && <span className="text-xs text-slate-400">{peopleCount}</span>}
            </button>
          )}
          {canManage && (
          <button
            onClick={() => {
              setEditName(project.name);
              setEditColor(project.color);
              setEditDescription(project.description);
              setShowSettings(true);
            }}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
            title="Configurações"
          >
            <Settings className="w-5 h-5" />
          </button>
          )}
        </div>
      </div>

      {/* Quadro | Etapas */}
      <div className="bg-white border-b px-4 md:px-6 flex gap-1 flex-shrink-0">
        {(canManage ? ([['board', 'Quadro'], ['steps', 'Etapas']] as const) : ([['board', 'Quadro']] as const)).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              viewMode === mode ? 'text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
            style={viewMode === mode ? { borderColor: project.color } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-100 flex-shrink-0">
        <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: project.color }} />
      </div>

      {/* Description */}
      {project.description && (
        <div className="bg-slate-50 px-4 md:px-6 py-2 text-sm text-slate-600 border-b">
          {project.description}
        </div>
      )}

      {viewMode === 'steps' && (
        <div className="flex-1 overflow-y-auto">
          <ProjectSteps
            project={project}
            tasks={projectTasks}
            onAddTask={onAddTask}
            onUpdateTask={onUpdateTask}
            onCompleteTask={onCompleteTask}
            onTaskClick={onTaskClick}
            onApplyAutomation={onApplyAutomation}
          />
        </div>
      )}

      {/* Kanban Columns */}
      {viewMode === 'board' && (
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full min-w-max">
            {allStatuses.map(({ id, cfg, isNative }) => {
              const customColor = (cfg as any).customColor as string | undefined;
              const colTasks = tasksByStatus[id] || [];
              const dotStyle = isNative ? '' : '';

              return (
                <div key={id} className="w-72 md:w-80 flex flex-col flex-shrink-0">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {isNative ? (
                        <div className={`w-2 h-2 rounded-full ${cfg.color} flex-shrink-0`} />
                      ) : (
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: customColor }} />
                      )}
                      <Tooltip
                        title={cfg.label}
                        content={cfg.description}
                        position="bottom"
                        width="md"
                      >
                        <h3 className="font-bold text-sm text-slate-700 cursor-help truncate flex items-center gap-1">
                          {cfg.label}
                          <HelpCircle className="w-3 h-3 text-slate-300" />
                        </h3>
                      </Tooltip>
                      <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                        {colTasks.length}
                      </span>
                    </div>
                    <button
                      onClick={() => setQuickAddCol(quickAddCol === id ? null : id)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 flex-shrink-0"
                      title="Adicionar tarefa"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <Droppable droppableId={id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 rounded-xl p-2 overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? 'bg-blue-50/60 outline outline-2 outline-dashed outline-blue-300' : 'bg-slate-100/40'
                        }`}
                      >
                        {quickAddCol === id && (
                          <div className="mb-2 bg-white rounded-lg p-2 border border-blue-200 shadow-sm">
                            <textarea
                              placeholder="Título da tarefa..."
                              autoFocus
                              value={quickAddText}
                              onChange={e => setQuickAddText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleQuickAdd(id);
                                }
                                if (e.key === 'Escape') {
                                  setQuickAddCol(null);
                                  setQuickAddText('');
                                }
                              }}
                              className="w-full text-sm outline-none resize-none"
                              rows={2}
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleQuickAdd(id)}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 rounded"
                              >
                                Adicionar
                              </button>
                              <button
                                onClick={() => { setQuickAddCol(null); setQuickAddText(''); }}
                                className="px-3 text-xs text-slate-500 hover:text-slate-700"
                              >
                                Esc
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          {colTasks.map((task, idx) => (
                            <Draggable key={task.id} draggableId={task.id} index={idx}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`transition-all ${snapshot.isDragging ? 'rotate-1 scale-[1.02] shadow-xl' : ''}`}
                                  style={provided.draggableProps.style}
                                >
                                  <TaskCard
                                    task={task}
                                    category={categories.find(c => c.id === task.category)}
                                    project={project}
                                    onClick={() => onTaskClick(task)}
                                    onComplete={() => onCompleteTask(task.id)}
                                    onChangeStatus={(s) => onUpdateTask(task.id, { status: s })}
                                    compact
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}

                          {colTasks.length === 0 && quickAddCol !== id && (
                            <button
                              onClick={() => setQuickAddCol(id)}
                              className="w-full py-6 text-xs text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-300 transition-all"
                            >
                              + Adicionar tarefa
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}

            {/* Botão para adicionar status */}
            <div className="w-72 md:w-80 flex-shrink-0 flex items-start pt-7">
              <button
                onClick={() => setShowStatusManager(true)}
                className="w-full py-4 text-sm text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 font-semibold"
              >
                <Plus className="w-4 h-4" />
                Novo status
              </button>
            </div>
          </div>
        </DragDropContext>
      </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Configurações do Projeto</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nome</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Cor</label>
                <input
                  type="color"
                  value={editColor}
                  onChange={e => setEditColor(e.target.value)}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Descrição</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  rows={3}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSettings}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Excluir projeto "${project.name}"? As tarefas vinculadas perderão o vínculo.`)) {
                      onDeleteProject();
                      setShowSettings(false);
                      onBack();
                    }
                  }}
                  className="px-4 text-rose-600 hover:bg-rose-50 rounded-lg font-bold"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Manager Modal */}
      {showStatusManager && (
        <StatusManager
          customStatuses={customStatuses}
          onSave={handleSaveStatuses}
          onClose={() => setShowStatusManager(false)}
        />
      )}
    </div>
  );
};

export default ProjectBoard;
