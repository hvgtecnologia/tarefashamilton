
import React, { useState } from 'react';
import { X, RotateCcw, Trash2, Calendar, CheckCircle, Clock } from 'lucide-react';
import { Task, Category } from '../types';
import { URGENCY_CONFIG } from '../constants';

interface HistoryModalProps {
  tasks: Task[];
  deletedTasks: Task[];
  categories: Category[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onRestoreDeleted: (id: string) => void;
  onPermanentDelete: (id: string) => void;
}

type Tab = 'completed' | 'trash';

const HistoryModal: React.FC<HistoryModalProps> = ({
  tasks, deletedTasks, categories, onClose, onRestore, onRestoreDeleted, onPermanentDelete
}) => {
  const [tab, setTab] = useState<Tab>('completed');

  // Calculate days remaining until auto-delete (30 days) — só se aplica às concluídas
  const getDaysRemaining = (completedAt?: string) => {
    if (!completedAt) return 30;
    const completed = new Date(completedAt);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - completed.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, 30 - daysPassed);
  };

  const list = tab === 'completed' ? tasks : deletedTasks;
  const sortKey = (t: Task) => (tab === 'completed' ? t.completedAt : t.deletedAt) || '0';
  const onRestoreClick = tab === 'completed' ? onRestore : onRestoreDeleted;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <header className="p-6 border-b flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {tab === 'completed'
              ? <CheckCircle className="text-green-500 w-6 h-6" />
              : <Trash2 className="text-rose-500 w-6 h-6" />}
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {tab === 'completed' ? 'Tarefas Concluídas' : 'Lixeira'}
              </h2>
              <p className="text-xs text-slate-500">
                {tab === 'completed' ? 'Mantidas por 30 dias' : 'Restaure ou exclua definitivamente'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex bg-slate-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setTab('completed')}
              className={`flex items-center px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${
                tab === 'completed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Concluídas ({tasks.length})
            </button>
            <button
              onClick={() => setTab('trash')}
              className={`flex items-center px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${
                tab === 'trash' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Lixeira ({deletedTasks.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {list.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                {tab === 'completed' ? <CheckCircle className="w-10 h-10" /> : <Trash2 className="w-10 h-10" />}
              </div>
              <p className="font-medium">
                {tab === 'completed' ? 'Nenhuma tarefa no histórico ainda.' : 'A lixeira está vazia.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {[...list].sort((a, b) => new Date(sortKey(b)).getTime() - new Date(sortKey(a)).getTime()).map(task => {
                const urgency = URGENCY_CONFIG[task.urgency];
                const cat = categories.find(c => c.id === task.category);
                const daysRemaining = tab === 'completed' ? getDaysRemaining(task.completedAt) : null;

                return (
                  <div key={task.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-blue-200 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${urgency.bg} ${urgency.text}`}>
                          {task.urgency}
                        </span>
                        {cat && (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            • {cat.name}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 flex items-center">
                          <Calendar className="w-2 h-2 mr-1" />
                          {tab === 'completed'
                            ? (task.completedAt ? new Date(task.completedAt).toLocaleDateString('pt-BR') : '')
                            : (task.deletedAt ? new Date(task.deletedAt).toLocaleDateString('pt-BR') : '')}
                        </span>
                        {/* Days remaining indicator (só concluídas) */}
                        {daysRemaining !== null && daysRemaining <= 7 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center ${daysRemaining <= 3 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                            <Clock className="w-2 h-2 mr-1" />
                            {daysRemaining}d
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold text-slate-700 line-through decoration-slate-300">{task.title}</h4>
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-1 line-through decoration-slate-200">{task.description}</p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => onRestoreClick(task.id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center text-xs font-bold"
                        title="Restaurar"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Restaurar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Excluir permanentemente esta tarefa? Essa ação não pode ser desfeita.')) {
                            onPermanentDelete(task.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir Permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="p-6 bg-slate-50 border-t">
          <div className="flex items-center justify-between text-xs">
            <p className="text-slate-500">
              {tab === 'completed'
                ? <>💡 <strong>Lixeira automática:</strong> Tarefas são excluídas após 30 dias</>
                : <>💡 <strong>Reversível:</strong> "Excluir" em uma tarefa manda ela pra cá antes de sumir de vez</>}
            </p>
            <span className="text-slate-400">
              {list.length} {list.length === 1 ? 'tarefa' : 'tarefas'}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HistoryModal;
