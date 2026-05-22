import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Search, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Menu, Sparkles } from 'lucide-react';
import { Task, Category, Urgency, DayOfWeek, Project, TaskStatus, View } from './types';
import { DEFAULT_CATEGORIES, getStartOfWeek, getWeekDates, formatDate, todayISO, isOverdue } from './constants';
import KanbanBoard from './components/KanbanBoard';
import Sidebar from './components/Sidebar';
import TaskModal from './components/TaskModal';
import HistoryModal from './components/HistoryModal';
import ProjectBoard from './components/ProjectBoard';
import QuickAdd from './components/QuickAdd';
import TodayView from './components/TodayView';
import Dashboard from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { LoginScreen } from './components/LoginScreen';
import { buildRecurringClone } from './lib/recurrence';
import {
  getTasks, addTask as addTaskToStorage, updateTask as updateTaskInStorage,
  deleteTask as deleteTaskFromStorage,
  getCategories, addCategory as addCategoryToStorage, deleteCategory as deleteCategoryFromStorage,
  getProjects, addProject as addProjectToStorage, updateProject as updateProjectToStorage,
  deleteProject as deleteProjectFromStorage, getCurrentUserId
} from './lib/storage';
import { getSession, onAuthStateChange } from './lib/supabase';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<View>('today');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddDefaults, setQuickAddDefaults] = useState<{ projectId?: string; date?: string }>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskModalDefaults, setTaskModalDefaults] = useState<{ projectId?: string; status?: TaskStatus }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUrgency, setSelectedUrgency] = useState<Urgency | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getStartOfWeek(new Date()));
  const weekColumns = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);

  // Auth
  useEffect(() => {
    const checkSession = async () => {
      const session = await getSession();
      if (session) setIsAuthenticated(true);
    };
    checkSession();

    const { data: { subscription } } = onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto cleanup das concluídas + 30 dias
  useEffect(() => {
    const cleanup = () => {
      const now = new Date();
      setTasks(prev => prev.filter(task => {
        if (!task.isCompleted || !task.completedAt) return true;
        const completedDate = new Date(task.completedAt);
        const daysPassed = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysPassed < 30;
      }));
    };
    cleanup();
    const interval = setInterval(cleanup, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Carrega dados quando autenticado
  useEffect(() => {
    const loadData = async () => {
      if (!isAuthenticated) return;
      const userId = await getCurrentUserId();
      if (!userId) return;

      try {
        const loadedProjects = await getProjects();
        setProjects([...loadedProjects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })));

        let loadedCategories = await getCategories();
        // Apenas recria as categorias padrão se for um usuário completamente novo (sem categorias e sem projetos cadastrados)
        if (loadedCategories.length === 0 && loadedProjects.length === 0) {
          for (const cat of DEFAULT_CATEGORIES) {
            try {
              await addCategoryToStorage({ name: cat.name, color: cat.color });
            } catch (err) {
              console.error('Erro ao criar categoria padrão:', err);
            }
          }
          loadedCategories = await getCategories();
        }
        setCategories(loadedCategories);

        const loadedTasks = await getTasks();

        // Fix legacy
        const legacyIds = ['1', '2', '3', '4'];
        const legacyMap: Record<string, string> = {
          '1': 'Pessoal', '2': 'Áurea', '3': 'Tráfego Pago', '4': 'Consultoria IA'
        };
        const fixed = await Promise.all(loadedTasks.map(async t => {
          if (legacyIds.includes(t.category)) {
            const name = legacyMap[t.category];
            const correct = loadedCategories.find(c => c.name === name);
            if (correct) {
              await updateTaskInStorage(t.id, { category: correct.id });
              return { ...t, category: correct.id };
            }
          }
          return t;
        }));

        setTasks(fixed);
      } catch (e) {
        console.error('Error loading data:', e);
      }
    };
    loadData();
  }, [isAuthenticated]);

  // Atalho Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickAddOpen(true);
      }
      if (e.key === 'Escape' && isQuickAddOpen) {
        setIsQuickAddOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isQuickAddOpen]);

  // Responsivo
  useEffect(() => {
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============ Task CRUD ============

  const addTask = async (data: Partial<Task>) => {
    try {
      const newTask = await addTaskToStorage({
        title: data.title || '',
        description: data.description || '',
        urgency: data.urgency || Urgency.MEDIUM,
        status: data.status || 'todo',
        category: data.category || categories[0]?.id || '',
        projectId: data.projectId,
        dayOfWeek: data.dayOfWeek || 'inbox',
        scheduledDate: data.scheduledDate,
        dueDate: data.dueDate,
        position: tasks.length,
        notes: data.notes || '',
        checklist: data.checklist || [],
        recurrence: data.recurrence || 'none',
        attachments: data.attachments || [],
        isCompleted: false,
      });
      setTasks(prev => [...prev, newTask]);
      return newTask;
    } catch (e) {
      console.error('Error adding task:', e);
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      await updateTaskInStorage(id, updates);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
    } catch (e) {
      console.error('Error updating task:', e);
    }
  };

  const completeTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const now = new Date().toISOString();
    await updateTask(id, { isCompleted: true, status: 'done', completedAt: now });

    // Recriar se for recorrente
    if (task.recurrence && task.recurrence !== 'none') {
      const clone = buildRecurringClone(task);
      try {
        const newTask = await addTaskToStorage({ ...clone, position: tasks.length });
        setTasks(prev => [...prev, newTask]);
      } catch (e) {
        console.error('Error recreating recurring task:', e);
      }
    }
  };

  const restoreTask = async (id: string) => {
    await updateTask(id, { isCompleted: false, status: 'todo', completedAt: undefined });
  };

  const changeStatus = async (id: string, status: TaskStatus) => {
    if (status === 'done') {
      await completeTask(id);
    } else {
      const task = tasks.find(t => t.id === id);
      const wasCompleted = task?.isCompleted;
      await updateTask(id, { status, isCompleted: false, completedAt: undefined });
      if (wasCompleted) {
        // Garantia adicional
      }
    }
  };

  const deleteTaskById = async (id: string) => {
    await deleteTaskFromStorage(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // ============ Drag & Drop ============

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const taskToMove = tasks.find(t => t.id === draggableId);
    if (!taskToMove) return;

    const updated = { ...taskToMove };
    if (destination.droppableId === 'inbox') {
      updated.dayOfWeek = 'inbox';
      updated.scheduledDate = undefined;
    } else {
      const col = weekColumns.find(c => c.date === destination.droppableId);
      if (col) {
        updated.scheduledDate = col.date;
        updated.dayOfWeek = col.dayKey;
      }
    }

    const destTasks = tasks
      .filter(t => {
        if (t.id === draggableId) return false;
        if (destination.droppableId === 'inbox') return t.dayOfWeek === 'inbox';
        return t.scheduledDate === destination.droppableId;
      })
      .sort((a, b) => a.position - b.position);

    destTasks.splice(destination.index, 0, updated);
    destTasks.forEach((t, i) => { t.position = i; });

    const finalTasks = tasks.map(t => {
      if (t.id === draggableId) return updated;
      const found = destTasks.find(dt => dt.id === t.id);
      return found || t;
    });

    setTasks(finalTasks);

    try {
      await updateTaskInStorage(updated.id, {
        dayOfWeek: updated.dayOfWeek,
        scheduledDate: updated.scheduledDate,
        position: updated.position,
      });
      for (const t of destTasks) {
        if (t.id !== updated.id) await updateTaskInStorage(t.id, { position: t.position });
      }
    } catch (e) {
      console.error('Error persisting drag:', e);
    }
  };

  // ============ Categories / Projects ============

  const addCategory = async (name: string, color: string) => {
    try {
      const c = await addCategoryToStorage({ name, color });
      setCategories(prev => [...prev, c]);
    } catch (e) {
      console.error("Erro ao adicionar categoria:", e);
      alert("Erro ao salvar categoria: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const success = await deleteCategoryFromStorage(id);
      if (!success) {
        alert("Erro ao excluir a categoria no banco de dados.");
        return;
      }
      const def = categories[0]?.id;
      if (def) setTasks(prev => prev.map(t => t.category === id ? { ...t, category: def } : t));
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error("Erro ao deletar categoria:", e);
      alert("Erro ao deletar categoria: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const addProject = async (name: string, description: string, color: string) => {
    try {
      const p = await addProjectToStorage({ name, description, color });
      setProjects(prev => [...prev, p].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })));
    } catch (e) { console.error(e); }
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    try {
      const updated = await updateProjectToStorage(id, updates);
      if (updated) setProjects(prev => prev.map(p => p.id === id ? updated : p).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })));
    } catch (e) { console.error(e); }
  };

  const deleteProject = async (id: string) => {
    try {
      await deleteProjectFromStorage(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      setTasks(prev => prev.map(t => t.projectId === id ? { ...t, projectId: undefined } : t));
      if (openProjectId === id) setOpenProjectId(null);
    } catch (e) { console.error(e); }
  };

  // ============ Filtered & derived ============

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchesSearch = !searchTerm ||
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesUrgency = !selectedUrgency || t.urgency === selectedUrgency;
      const matchesCategory = !selectedCategory || t.category === selectedCategory;
      const notCompleted = !t.isCompleted;
      return matchesSearch && matchesUrgency && matchesCategory && notCompleted;
    });
  }, [tasks, searchTerm, selectedUrgency, selectedCategory]);

  const pendingByProject = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach(t => {
      if (t.projectId && !t.isCompleted) map[t.projectId] = (map[t.projectId] || 0) + 1;
    });
    return map;
  }, [tasks]);

  const overdueByProject = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach(t => {
      if (t.projectId && !t.isCompleted && isOverdue(t.dueDate || t.scheduledDate)) {
        map[t.projectId] = (map[t.projectId] || 0) + 1;
      }
    });
    return map;
  }, [tasks]);

  const today = todayISO();
  const todayCount = useMemo(() => tasks.filter(t => !t.isCompleted && (t.dueDate || t.scheduledDate) === today).length, [tasks, today]);
  const overdueCount = useMemo(() => tasks.filter(t => !t.isCompleted && isOverdue(t.dueDate || t.scheduledDate)).length, [tasks]);

  const handleDayClick = (date: Date) => {
    setCurrentWeekStart(getStartOfWeek(date));
    setView('week');
  };

  const openTaskModal = (task: Task | null, defaults: { projectId?: string; status?: TaskStatus } = {}) => {
    setEditingTask(task);
    setTaskModalDefaults(defaults);
    setIsTaskModalOpen(true);
  };

  const openQuickAdd = (defaults: { projectId?: string; date?: string } = {}) => {
    setQuickAddDefaults(defaults);
    setIsQuickAddOpen(true);
  };

  const changeWeek = (direction: number) => {
    const next = new Date(currentWeekStart);
    next.setHours(12, 0, 0, 0);
    next.setDate(next.getDate() + (direction * 7));
    setCurrentWeekStart(getStartOfWeek(next));
  };

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  const openedProject = openProjectId ? projects.find(p => p.id === openProjectId) : null;

  // ============ Calendar adapter (legado) ============
  const calendarTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: (t.urgency === Urgency.CRITICAL || t.urgency === Urgency.HIGH ? 'high' : t.urgency === Urgency.MEDIUM ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    columnId: t.dayOfWeek === 'inbox' ? 'inbox' : (t.scheduledDate || 'inbox'),
    projectId: t.projectId,
    position: t.position,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt || new Date().toISOString(),
  }));

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden relative">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`
        fixed lg:static inset-y-0 left-0 z-30
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
        ${isSidebarOpen && 'lg:w-64'}
      `}>
        <Sidebar
          view={view}
          setView={(v) => { setView(v); setOpenProjectId(null); }}
          openProjectId={openProjectId}
          pendingByProject={pendingByProject}
          overdueByProject={overdueByProject}
          todayCount={todayCount}
          overdueCount={overdueCount}
          categories={categories}
          projects={projects}
          selectedUrgency={selectedUrgency}
          setSelectedUrgency={setSelectedUrgency}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          addCategory={addCategory}
          deleteCategory={deleteCategory}
          addProject={addProject}
          deleteProject={deleteProject}
          onOpenProject={(id) => setOpenProjectId(id)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onClose={() => setIsSidebarOpen(false)}
          onQuickAdd={() => openQuickAdd()}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 w-full relative">
        <header className="border-b bg-white flex flex-col md:flex-row md:items-center justify-between px-3 py-3 md:px-5 md:h-16 gap-3 flex-shrink-0 z-10">
          <div className="flex flex-col md:flex-row md:items-center gap-3 flex-1">
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 md:hidden"
                  title="Menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 hidden md:block"
                  title="Toggle"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="relative w-full md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar em todas as tarefas..."
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-blue-500 rounded-lg text-sm outline-none"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {view === 'week' && !openProjectId && (
              <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                <button onClick={() => changeWeek(-1)} className="p-1 hover:bg-white rounded">
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <div className="px-2 md:px-3 flex items-center gap-1 text-[10px] md:text-xs font-bold text-slate-600">
                  <CalendarIcon className="w-3 h-3 hidden sm:block" />
                  <span className="whitespace-nowrap">
                    {currentWeekStart.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <button onClick={() => changeWeek(1)} className="p-1 hover:bg-white rounded">
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
                <button
                  onClick={() => setCurrentWeekStart(getStartOfWeek(new Date()))}
                  className="ml-1 px-2 py-1 text-[10px] bg-white text-blue-600 rounded border shadow-sm hover:bg-blue-50"
                >
                  Hoje
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => openQuickAdd()}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              title="Cmd+K"
            >
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono">⌘K</kbd>
            </button>

            <button
              onClick={async () => {
                if (confirm('Sair?')) {
                  const { signOut } = await import('./lib/supabase');
                  await signOut();
                  setIsAuthenticated(false);
                  setTasks([]);
                  setCategories(DEFAULT_CATEGORIES);
                  setProjects([]);
                }
              }}
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
            >
              Sair
            </button>

            <button
              onClick={() => openQuickAdd()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 md:px-4 rounded-lg text-sm font-bold flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 md:mr-1.5" />
              <span className="hidden md:inline">Nova</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {openedProject ? (
            <div className="-m-4 md:-m-6 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)]">
              <ProjectBoard
                project={openedProject}
                tasks={tasks}
                categories={categories}
                projects={projects}
                onBack={() => setOpenProjectId(null)}
                onAddTask={(data) => addTask({
                  ...data,
                  projectId: openedProject.id,
                  dayOfWeek: 'inbox',
                })}
                onUpdateTask={updateTask}
                onCompleteTask={completeTask}
                onTaskClick={(task) => openTaskModal(task)}
                onDeleteProject={() => deleteProject(openedProject.id)}
                onEditProject={(updates) => updateProject(openedProject.id, updates)}
              />
            </div>
          ) : view === 'today' ? (
            <TodayView
              tasks={tasks}
              categories={categories}
              projects={projects}
              onTaskClick={(task) => openTaskModal(task)}
              onCompleteTask={completeTask}
              onChangeStatus={changeStatus}
              onOpenProject={(id) => setOpenProjectId(id)}
              onQuickAdd={() => openQuickAdd({ date: today })}
            />
          ) : view === 'dashboard' ? (
            <Dashboard
              tasks={tasks}
              categories={categories}
              projects={projects}
              onOpenProject={(id) => setOpenProjectId(id)}
              onTaskClick={(task) => openTaskModal(task)}
              onCompleteTask={completeTask}
              onChangeStatus={changeStatus}
            />
          ) : view === 'calendar' ? (
            <CalendarView tasks={calendarTasks as any} projects={projects} onDayClick={handleDayClick} />
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <KanbanBoard
                tasks={filteredTasks}
                categories={categories}
                projects={projects}
                weekColumns={weekColumns}
                onTaskClick={(task) => openTaskModal(task)}
                onCompleteTask={completeTask}
                onChangeStatus={changeStatus}
                onQuickAddForDate={(date) => openQuickAdd({ date })}
              />
            </DragDropContext>
          )}
        </div>

        {/* FAB mobile */}
        <button
          onClick={() => openQuickAdd()}
          className="md:hidden fixed bottom-6 right-6 z-30 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-500/40 flex items-center justify-center"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      </main>

      {/* Modais */}
      {isTaskModalOpen && (
        <TaskModal
          task={editingTask}
          categories={categories}
          projects={projects}
          defaultProjectId={taskModalDefaults.projectId}
          defaultStatus={taskModalDefaults.status}
          onClose={() => { setIsTaskModalOpen(false); setEditingTask(null); setTaskModalDefaults({}); }}
          onSave={(data) => {
            if (editingTask) {
              updateTask(editingTask.id, data);
            } else {
              addTask(data);
            }
            setIsTaskModalOpen(false);
            setEditingTask(null);
            setTaskModalDefaults({});
          }}
          onDelete={(id) => deleteTaskById(id)}
        />
      )}

      {isQuickAddOpen && (
        <QuickAdd
          categories={categories}
          projects={projects}
          defaultProjectId={quickAddDefaults.projectId}
          defaultDate={quickAddDefaults.date}
          onClose={() => { setIsQuickAddOpen(false); setQuickAddDefaults({}); }}
          onSubmit={(data) => { addTask(data); }}
        />
      )}

      {isHistoryOpen && (
        <HistoryModal
          tasks={tasks.filter(t => t.isCompleted)}
          categories={categories}
          onClose={() => setIsHistoryOpen(false)}
          onRestore={restoreTask}
          onPermanentDelete={(id) => deleteTaskById(id)}
        />
      )}
    </div>
  );
};

export default App;
