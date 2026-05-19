import React, { useState } from 'react';
import { Category, Urgency, Project, View } from '../types';
import { URGENCY_CONFIG, isOverdue } from '../constants';
import {
  LayoutDashboard, Sun, BarChart3, Calendar, Columns,
  Plus, Circle, History, X, Trash2, FolderKanban, Sparkles
} from 'lucide-react';

interface SidebarProps {
  categories: Category[];
  projects: Project[];
  view: View;
  setView: (v: View) => void;
  openProjectId: string | null;
  pendingByProject: Record<string, number>;
  overdueByProject: Record<string, number>;
  todayCount: number;
  overdueCount: number;
  selectedUrgency: Urgency | null;
  setSelectedUrgency: (u: Urgency | null) => void;
  selectedCategory: string | null;
  setSelectedCategory: (id: string | null) => void;
  addCategory: (name: string, color: string) => void;
  deleteCategory: (id: string) => void;
  addProject: (name: string, description: string, color: string) => void;
  deleteProject: (id: string) => void;
  onOpenProject: (id: string) => void;
  onOpenHistory: () => void;
  onClose?: () => void;
  onQuickAdd: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  categories, projects, view, setView, openProjectId,
  pendingByProject, overdueByProject, todayCount, overdueCount,
  selectedUrgency, setSelectedUrgency, selectedCategory, setSelectedCategory,
  addCategory, deleteCategory, addProject, deleteProject,
  onOpenProject, onOpenHistory, onClose, onQuickAdd
}) => {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3b82f6');

  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjColor, setNewProjColor] = useState('#3b82f6');

  const handleAddCategory = () => {
    if (newCatName.trim()) {
      addCategory(newCatName.trim(), newCatColor);
      setNewCatName('');
      setIsAddingCategory(false);
    }
  };

  const handleAddProject = () => {
    if (newProjName.trim()) {
      addProject(newProjName.trim(), '', newProjColor);
      setNewProjName('');
      setIsAddingProject(false);
    }
  };

  const NavBtn = ({ icon, label, active, onClick, badge, urgent }: {
    icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; badge?: number; urgent?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      {icon}
      <span className="ml-3 flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          urgent ? 'bg-rose-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <aside className="w-64 bg-white border-r flex flex-col flex-shrink-0 overflow-y-auto h-full relative">
      <div className="p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow">
              <LayoutDashboard className="text-white w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-800">Comando</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1 hover:bg-slate-100 rounded text-slate-500">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quick Add CTA */}
        <button
          onClick={() => { onQuickAdd(); onClose?.(); }}
          className="w-full mb-5 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-500/30 text-sm"
        >
          <Sparkles className="w-4 h-4" />
          Adicionar Rápido
        </button>

        <nav className="space-y-5">
          {/* Visões */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Visões</h3>
            <div className="space-y-0.5">
              <NavBtn
                icon={<Sun className="w-4 h-4" />}
                label="Hoje"
                active={view === 'today' && !openProjectId}
                onClick={() => { setView('today'); onClose?.(); }}
                badge={todayCount + overdueCount}
                urgent={overdueCount > 0}
              />
              <NavBtn
                icon={<BarChart3 className="w-4 h-4" />}
                label="Painel Geral"
                active={view === 'dashboard' && !openProjectId}
                onClick={() => { setView('dashboard'); onClose?.(); }}
              />
              <NavBtn
                icon={<Columns className="w-4 h-4" />}
                label="Semana"
                active={view === 'week' && !openProjectId}
                onClick={() => { setView('week'); onClose?.(); }}
              />
              <NavBtn
                icon={<Calendar className="w-4 h-4" />}
                label="Calendário"
                active={view === 'calendar' && !openProjectId}
                onClick={() => { setView('calendar'); onClose?.(); }}
              />
              <NavBtn
                icon={<History className="w-4 h-4" />}
                label="Histórico"
                onClick={() => { onOpenHistory(); onClose?.(); }}
              />
            </div>
          </div>

          {/* Projetos */}
          <div>
            <div className="flex items-center justify-between mb-2 ml-2">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Negócios / Projetos</h3>
              <button onClick={() => setIsAddingProject(true)} className="p-1 hover:bg-slate-100 rounded">
                <Plus className="w-3 h-3 text-slate-500" />
              </button>
            </div>
            <div className="space-y-0.5">
              {projects.length === 0 && (
                <p className="text-[11px] text-slate-400 italic px-3 py-1">
                  Crie um projeto para cada negócio (Áurea, Tráfego, etc.)
                </p>
              )}
              {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })).map(proj => {
                const pending = pendingByProject[proj.id] || 0;
                const overdue = overdueByProject[proj.id] || 0;
                return (
                  <div key={proj.id} className="group relative">
                    <button
                      onClick={() => { onOpenProject(proj.id); onClose?.(); }}
                      className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        openProjectId === proj.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <FolderKanban className="w-4 h-4 flex-shrink-0" style={{ color: proj.color }} />
                      <span className="flex-1 text-left truncate ml-3">{proj.name}</span>
                      {overdue > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white mr-1">
                          {overdue}!
                        </span>
                      )}
                      {pending > 0 && (
                        <span className="text-[10px] font-bold text-slate-500">{pending}</span>
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir projeto "${proj.name}"?`)) deleteProject(proj.id);
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded transition-all z-10"
                      title="Excluir"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Urgência */}
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-2">Filtrar Prioridade</h3>
            <div className="space-y-0.5">
              {Object.entries(URGENCY_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => { setSelectedUrgency(selectedUrgency === key ? null : key as Urgency); onClose?.(); }}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    selectedUrgency === key ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${config.color} mr-3`} />
                  {config.label}
                  {selectedUrgency === key && <X className="ml-auto w-3 h-3 text-slate-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Categorias */}
          <div>
            <div className="flex items-center justify-between mb-2 ml-2">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Categorias</h3>
              <button onClick={() => setIsAddingCategory(true)} className="p-1 hover:bg-slate-100 rounded">
                <Plus className="w-3 h-3 text-slate-500" />
              </button>
            </div>
            <div className="space-y-0.5">
              {categories.map(cat => (
                <div key={cat.id} className="group relative">
                  <button
                    onClick={() => { setSelectedCategory(selectedCategory === cat.id ? null : cat.id); onClose?.(); }}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      selectedCategory === cat.id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Circle className="w-3 h-3 mr-3" fill={cat.color} stroke={cat.color} />
                    <span className="flex-1 text-left truncate">{cat.name}</span>
                    {selectedCategory === cat.id && <X className="w-3 h-3 text-slate-400" />}
                  </button>
                  {selectedCategory !== cat.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir categoria "${cat.name}"?`)) deleteCategory(cat.id);
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded transition-all z-10"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </nav>
      </div>

      {(isAddingCategory || isAddingProject) && (
        <div className="p-4 border-t bg-slate-50 sticky bottom-0">
          {isAddingCategory ? (
            <>
              <input
                type="text"
                placeholder="Nome da categoria"
                className="w-full px-3 py-2 text-xs border rounded mb-2 outline-none"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                autoFocus
              />
              <div className="flex space-x-2">
                <input type="color" className="w-8 h-8 rounded border-none cursor-pointer" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} />
                <button onClick={handleAddCategory} className="flex-1 bg-blue-600 text-white text-xs py-1 rounded hover:bg-blue-700">
                  Adicionar
                </button>
                <button onClick={() => setIsAddingCategory(false)} className="px-2 text-xs text-slate-500">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder="Nome do projeto/negócio"
                className="w-full px-3 py-2 text-xs border rounded mb-2 outline-none"
                value={newProjName}
                onChange={e => setNewProjName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddProject()}
                autoFocus
              />
              <div className="flex space-x-2">
                <input type="color" className="w-8 h-8 rounded border-none cursor-pointer" value={newProjColor} onChange={e => setNewProjColor(e.target.value)} />
                <button onClick={handleAddProject} className="flex-1 bg-blue-600 text-white text-xs py-1 rounded hover:bg-blue-700">
                  Criar
                </button>
                <button onClick={() => setIsAddingProject(false)} className="px-2 text-xs text-slate-500">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
