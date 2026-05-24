import React, { useState, useRef, useEffect } from 'react';
import {
  X, Trash2, FileText, Plus, Calendar, Save, Edit3, Eye, Paperclip,
  CheckSquare, Square, Repeat, Flag, Tag, FolderKanban, AlertCircle, GripVertical
} from 'lucide-react';
import { Task, Category, Urgency, TaskAttachment, Project, ChecklistItem, TaskStatus, Recurrence } from '../types';
import { URGENCY_CONFIG, STATUS_CONFIG, RECURRENCE_LABELS, loadCustomStatuses, buildAllStatuses } from '../constants';

interface TaskModalProps {
  task: Task | null;
  categories: Category[];
  projects: Project[];
  defaultProjectId?: string;
  defaultStatus?: TaskStatus;
  onClose: () => void;
  onSave: (data: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

type ViewMode = 'edit' | 'work';

const TaskModal: React.FC<TaskModalProps> = ({
  task, categories, projects, defaultProjectId, defaultStatus, onClose, onSave, onDelete
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [urgency, setUrgency] = useState<Urgency>(task?.urgency || Urgency.MEDIUM);
  const [status, setStatus] = useState<TaskStatus>(task?.status || defaultStatus || 'todo');
  const [category, setCategory] = useState(task?.category || (categories.length > 0 ? categories[0].id : ''));
  const [projectId, setProjectId] = useState<string>(task?.projectId || defaultProjectId || '');
  const [scheduledDate, setScheduledDate] = useState<string>(task?.scheduledDate || '');
  const [dueDate, setDueDate] = useState<string>(task?.dueDate || '');
  const [notes, setNotes] = useState(task?.notes || '');
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task?.attachments || []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist || []);
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence || 'none');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [workNotes, setWorkNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const checklistDone = checklist.filter(c => c.done).length;
  const checklistProgress = checklist.length > 0 ? Math.round((checklistDone / checklist.length) * 100) : 0;

  const handleSave = () => {
    if (!title.trim()) return;
    const finalNotes = workNotes ? (notes ? `${notes}\n\n---\n${workNotes}` : workNotes) : notes;

    // Captura texto pendente do input de subtarefa que ainda não virou item
    let finalChecklist = checklist;
    if (newChecklistText.trim()) {
      finalChecklist = [...checklist, {
        id: crypto.randomUUID(),
        text: newChecklistText.trim(),
        done: false,
      }];
      setChecklist(finalChecklist);
      setNewChecklistText('');
    }

    onSave({
      title: title.trim(),
      description,
      urgency,
      status,
      category,
      projectId: projectId || undefined,
      scheduledDate: scheduledDate || undefined,
      dueDate: dueDate || undefined,
      dayOfWeek: scheduledDate ? 'monday' : 'inbox',
      notes: finalNotes,
      attachments,
      checklist: finalChecklist,
      recurrence,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList.item(i);
      if (!file) continue;
      const reader = new FileReader();
      reader.onloadend = () => {
        const newAttachment: TaskAttachment = {
          id: crypto.randomUUID(),
          url: reader.result as string,
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other',
          size: file.size
        };
        setAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const addChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setChecklist(prev => [...prev, {
      id: crypto.randomUUID(),
      text: newChecklistText.trim(),
      done: false,
    }]);
    setNewChecklistText('');
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c));
  };

  const removeChecklistItem = (id: string) => {
    setChecklist(prev => prev.filter(c => c.id !== id));
  };

  if (viewMode === 'edit') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden">
          {/* Main */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 border-b md:border-b-0 md:border-r">
            <div className="flex items-center justify-between mb-6">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('edit')}
                  className="flex items-center px-3 py-1.5 rounded-md bg-white text-slate-900 font-medium text-sm shadow-sm"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Editar
                </button>
                <button
                  onClick={() => setViewMode('work')}
                  className="flex items-center px-3 py-1.5 rounded-md text-slate-600 font-medium text-sm hover:text-slate-900"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Trabalhar
                </button>
              </div>

              <button onClick={onClose} className="md:hidden p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Título da tarefa..."
              className="text-2xl font-bold w-full outline-none text-slate-800 placeholder:text-slate-300 mb-6"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />

            {/* Checklist */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CheckSquare className="w-3 h-3" />
                  Subtarefas
                  {checklist.length > 0 && (
                    <span className="text-emerald-600 normal-case tracking-normal">
                      {checklistDone}/{checklist.length} · {checklistProgress}%
                    </span>
                  )}
                </h4>
              </div>

              {checklist.length > 0 && (
                <div className="mb-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all ${checklistProgress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
              )}

              <div className="space-y-1.5 mb-3">
                {checklist.map(item => (
                  <div key={item.id} className="group flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1.5">
                    <button onClick={() => toggleChecklistItem(item.id)} className="flex-shrink-0">
                      {item.done ? (
                        <CheckSquare className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 hover:text-blue-500" />
                      )}
                    </button>
                    <input
                      type="text"
                      value={item.text}
                      onChange={e => setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, text: e.target.value } : c))}
                      className={`flex-1 bg-transparent outline-none text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}
                    />
                    <button
                      onClick={() => removeChecklistItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Digite e pressione Enter para adicionar..."
                  value={newChecklistText}
                  onChange={e => setNewChecklistText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"
                />
                <button
                  onClick={addChecklistItem}
                  disabled={!newChecklistText.trim()}
                  className="px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 italic">
                💡 Cada subtarefa é confirmada pressionando <strong>Enter</strong> ou clicando em "Adicionar"
              </p>
            </div>

            {/* Notas detalhadas */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Notas / Briefing</h4>
              <textarea
                placeholder="Escreva briefings, ideias, contexto..."
                className="w-full h-[180px] bg-slate-50 border border-slate-200 rounded-xl p-4 outline-none text-slate-700 leading-relaxed resize-none focus:ring-2 focus:ring-blue-500/20"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Anexos */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Anexos</h4>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Anexar
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  multiple
                />
              </div>

              <div className="grid grid-cols-4 gap-3">
                {attachments.map(att => (
                  <div key={att.id} className="relative group">
                    {att.type === 'image' ? (
                      <div className="aspect-square rounded-lg overflow-hidden border border-slate-200">
                        <img src={att.url} className="w-full h-full object-cover" alt={att.name} />
                      </div>
                    ) : (
                      <div className="aspect-square rounded-lg border-2 border-slate-200 flex flex-col items-center justify-center p-2 bg-slate-50">
                        <FileText className="w-6 h-6 text-rose-500 mb-1" />
                        <span className="text-[10px] font-medium text-slate-600 text-center line-clamp-2">{att.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(att.id)}
                      className="absolute top-1 right-1 bg-white/90 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                >
                  <Paperclip className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-bold">Adicionar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar de metadados */}
          <div className="w-full md:w-80 bg-slate-50 overflow-y-auto flex flex-col p-4 md:p-6">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-bold text-slate-800">Detalhes</span>
              <button onClick={onClose} className="hidden md:block p-2 hover:bg-slate-200 rounded-lg text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5 flex-1">
              {/* Status */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  Status
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {buildAllStatuses(loadCustomStatuses()).map(({ id: s, cfg, isNative }) => {
                    const customColor = (cfg as any).customColor as string | undefined;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(s as TaskStatus)}
                        className={`flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          status === s
                            ? isNative
                              ? `${cfg.border} ${cfg.bg} ${cfg.text} shadow-sm`
                              : 'border-2 shadow-sm bg-slate-50 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                        style={!isNative && status === s ? { borderColor: customColor } : undefined}
                      >
                        {isNative ? (
                          <div className={`w-1.5 h-1.5 rounded-full ${cfg.color} mr-1.5`} />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: customColor }} />
                        )}
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Urgência */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Flag className="w-3 h-3" /> Prioridade
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(URGENCY_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setUrgency(key as Urgency)}
                      className={`flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        urgency === key ? `${cfg.border} ${cfg.bg} shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.color} mr-1.5`} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Projeto */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <FolderKanban className="w-3 h-3" /> Projeto
                </label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Categoria
                </label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Vou fazer em
                  </label>
                  <input
                    type="date"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                  />
                  <p className="text-[10px] text-blue-600 mt-1 italic leading-tight">
                    📅 Esta é a data que a tarefa aparece no calendário e na semana
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Prazo
                  </label>
                  <input
                    type="date"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-500 mt-1 italic leading-tight">
                    ⏰ Deadline (quando precisa estar pronta)
                  </p>
                </div>
              </div>

              {/* Recorrência */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Repeat className="w-3 h-3" /> Recorrência
                </label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={recurrence}
                  onChange={e => setRecurrence(e.target.value as Recurrence)}
                >
                  {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                {recurrence !== 'none' && (
                  <p className="text-[10px] text-blue-600 mt-1 italic">
                    Uma nova será criada ao concluir esta.
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Descrição</h4>
                <textarea
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none resize-none h-16 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Resumo curto..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col space-y-2">
              <button
                onClick={handleSave}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md shadow-blue-500/30 transition-all flex items-center justify-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </button>

              {task && (
                <button
                  onClick={() => { if (confirm('Excluir permanentemente?')) { onDelete(task.id); onClose(); } }}
                  className="w-full flex items-center justify-center py-2 text-rose-500 hover:bg-rose-50 font-bold text-xs rounded-xl transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Work Mode
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('edit')}
                className="flex items-center px-3 py-1.5 rounded-md text-slate-600 font-medium text-sm hover:text-slate-900"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Editar
              </button>
              <button
                onClick={() => setViewMode('work')}
                className="flex items-center px-3 py-1.5 rounded-md bg-white text-slate-900 font-medium text-sm shadow-sm"
              >
                <Eye className="w-4 h-4 mr-2" />
                Trabalhar
              </button>
            </div>
            <h2 className="text-lg font-bold text-slate-900 truncate">{title || 'Sem título'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {description && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-slate-700">{description}</p>
              </div>
            )}

            {/* Checklist interativo */}
            {checklist.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700">Checklist</h3>
                  <span className="text-sm font-bold text-emerald-600">
                    {checklistDone}/{checklist.length}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3 overflow-hidden">
                  <div
                    className={`h-full ${checklistProgress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
                <div className="space-y-2">
                  {checklist.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklistItem(item.id)}
                      className="flex items-center gap-2 w-full text-left p-2 hover:bg-slate-50 rounded-lg"
                    >
                      {item.done
                        ? <CheckSquare className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      }
                      <span className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {item.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {attachments.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center">
                  <Paperclip className="w-4 h-4 mr-2" />
                  Anexos ({attachments.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {attachments.map(att => (
                    <div key={att.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      {att.type === 'image' ? (
                        <img src={att.url} className="w-full aspect-video object-cover" alt={att.name} />
                      ) : (
                        <div className="aspect-video flex flex-col items-center justify-center bg-slate-50 p-3">
                          <FileText className="w-10 h-10 text-rose-500 mb-2" />
                          <a href={att.url} download={att.name} className="text-xs font-medium text-blue-600 hover:underline truncate max-w-full px-2">
                            {att.name}
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes && (
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">Notas / Briefing</h3>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre-wrap text-sm text-slate-700">
                  {notes}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-3">✏️ Anotações de Trabalho</h3>
              <textarea
                placeholder="Adicione anotações enquanto trabalha..."
                className="w-full h-40 bg-white border-2 border-blue-200 rounded-lg p-4 outline-none text-slate-700 leading-relaxed resize-none focus:ring-2 focus:ring-blue-500/40"
                value={workNotes}
                onChange={e => setWorkNotes(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500 italic">
                💡 Será adicionada às notas principais ao salvar.
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-slate-600 hover:text-slate-900 font-medium rounded-lg">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow flex items-center"
          >
            <Save className="w-4 h-4 mr-2" />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
