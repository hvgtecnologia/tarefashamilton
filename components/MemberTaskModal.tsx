import React, { useRef, useState } from 'react';
import {
  X, CheckSquare, Square, Paperclip, FileText, Plus, CheckCircle2, Calendar, Clock, Flag,
  FolderKanban, Tag, Save, AlertCircle, RotateCcw,
} from 'lucide-react';
import { Task, Category, Project, TaskAttachment, ChecklistItem, TaskStatus } from '../types';
import { URGENCY_CONFIG, STATUS_CONFIG, formatPrettyDate, isOverdue } from '../constants';
import { uploadAttachment } from '../lib/storage';
import DriveLinkChips from './DriveLinkChips';

interface MemberTaskModalProps {
  task: Task;
  category?: Category;
  project?: Project;
  onClose: () => void;
  onSave: (updates: Partial<Task>) => Promise<boolean>;
  onReopen?: () => Promise<boolean>;
}

const MEMBER_STATUSES: TaskStatus[] = ['todo', 'doing', 'blocked'];

const MemberTaskModal: React.FC<MemberTaskModalProps> = ({ task, category, project, onClose, onSave, onReopen }) => {
  const readOnly = task.isCompleted;
  const [status, setStatus] = useState<TaskStatus>(task.status && task.status !== 'done' ? task.status : 'todo');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist || []);
  const [memberNotes, setMemberNotes] = useState(task.memberNotes || '');
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task.attachments || []);
  const [saving, setSaving] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Só os arquivos que o próprio membro anexou nesta abertura podem ser removidos
  const originalAttachmentIds = useRef(new Set((task.attachments || []).map(a => a.id)));

  const urgency = URGENCY_CONFIG[task.urgency];
  const day = task.scheduledDate || task.dueDate;
  const late = !readOnly && isOverdue(day);
  const checklistDone = checklist.filter(c => c.done).length;

  const toggleItem = (id: string) => {
    if (readOnly) return;
    setChecklist(prev => prev.map(c => (c.id === id ? { ...c, done: !c.done } : c)));
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const files: File[] = [];
    for (let i = 0; fileList && i < fileList.length; i++) {
      const f = fileList.item(i);
      if (f) files.push(f);
    }
    e.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const attachment = await uploadAttachment(file);
        setAttachments(prev => [...prev, attachment]);
      } catch (err: any) {
        console.error('Erro ao anexar arquivo:', err);
        setError(err?.message || `Não foi possível anexar "${file.name}".`);
      }
    }
    setUploading(false);
  };

  const submit = async (complete: boolean) => {
    if (complete && !confirm('Concluir esta tarefa?\n\nSe precisar, você pode reabri-la depois em "Concluídas".')) return;
    setSaving(true);
    setError('');
    const updates: Partial<Task> = { status, checklist, memberNotes: memberNotes.trim(), attachments };
    if (complete) {
      updates.status = 'done';
      updates.isCompleted = true;
      updates.completedAt = new Date().toISOString();
    }
    const ok = await onSave(updates);
    setSaving(false);
    if (ok) onClose();
    else setError('Não foi possível salvar. Verifique a conexão e tente novamente.');
  };

  const reopen = async () => {
    if (!onReopen) return;
    setReopening(true);
    setError('');
    const ok = await onReopen();
    setReopening(false);
    if (ok) onClose();
    else setError('Não foi possível reabrir. Verifique a conexão e tente novamente.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-2xl max-h-[94vh] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${urgency?.bg} ${urgency?.text}`}>
                <Flag className="w-3 h-3 inline mr-1 -mt-0.5" />
                {urgency?.label}
              </span>
              {project && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ backgroundColor: `${project.color}15`, color: project.color, border: `1px solid ${project.color}30` }}
                >
                  <FolderKanban className="w-3 h-3 inline mr-1 -mt-0.5" />
                  {project.name}
                </span>
              )}
              {category && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{ backgroundColor: `${category.color}15`, color: category.color }}
                >
                  <Tag className="w-3 h-3 inline mr-1 -mt-0.5" />
                  {category.name}
                </span>
              )}
              {readOnly && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-3 h-3 inline mr-1 -mt-0.5" />
                  Concluída
                </span>
              )}
            </div>
            <h2 className={`text-xl font-bold ${readOnly ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{task.title}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
              {day && (
                <span className={`flex items-center gap-1 ${late ? 'text-rose-600 font-bold' : ''}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  {late ? 'Atrasada · ' : ''}{formatPrettyDate(day)}
                </span>
              )}
              {task.scheduledTime && (
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{task.scheduledTime}</span>
              )}
              {task.dueDate && task.scheduledDate && task.dueDate !== task.scheduledDate && (
                <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Prazo {formatPrettyDate(task.dueDate)}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {task.description && <p className="text-sm text-slate-700">{task.description}</p>}

          {task.notes && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">Instruções</h4>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{task.notes}</p>
            </div>
          )}

          {task.driveLinks && task.driveLinks.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Material do Drive</h4>
              <DriveLinkChips links={task.driveLinks} />
            </div>
          )}

          {checklist.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <CheckSquare className="w-3 h-3" />
                Subtarefas
                <span className="text-emerald-600 normal-case tracking-normal">{checklistDone}/{checklist.length}</span>
              </h4>
              <div className="space-y-1">
                {checklist.map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    disabled={readOnly}
                    className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 disabled:hover:bg-transparent"
                  >
                    {item.done
                      ? <CheckSquare className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      : <Square className="w-5 h-5 text-slate-300 flex-shrink-0" />}
                    <span className={`text-sm ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Anexos */}
          {(attachments.length > 0 || !readOnly) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Paperclip className="w-3 h-3" />
                  Anexos
                </h4>
                {!readOnly && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      {uploading ? 'Enviando...' : 'Anexar comprovante'}
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFiles}
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      multiple
                    />
                  </>
                )}
              </div>
              {attachments.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {attachments.map(att => (
                    <div key={att.id} className="relative group">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block">
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
                      </a>
                      {!readOnly && !originalAttachmentIds.current.has(att.id) && (
                        <button
                          onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                          className="absolute top-1 right-1 bg-white/90 p-1 rounded-full hover:bg-rose-500 hover:text-white"
                          title="Remover"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Retorno */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Seu retorno para o gestor</h4>
            {readOnly ? (
              <p className="text-sm text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-xl p-4 min-h-[3rem]">
                {task.memberNotes || <span className="italic text-slate-400">Sem observações.</span>}
              </p>
            ) : (
              <textarea
                value={memberNotes}
                onChange={e => setMemberNotes(e.target.value)}
                placeholder="Conte como foi, o que falta, dúvidas..."
                className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500/20"
              />
            )}
          </div>

          {/* Andamento */}
          {!readOnly && (
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Andamento</h4>
              <div className="grid grid-cols-3 gap-1.5">
                {MEMBER_STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];
                  return (
                    <button
                      key={s}
                      onClick={() => setStatus(s)}
                      className={`flex items-center justify-center px-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        status === s ? `${cfg.border} ${cfg.bg} ${cfg.text} shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.color} mr-1.5`} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs">{error}</div>}
        </div>

        {/* Rodapé */}
        {readOnly && onReopen && (
          <div className="p-4 border-t bg-slate-50">
            <button
              onClick={reopen}
              disabled={reopening}
              className="w-full flex items-center justify-center gap-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-800 font-bold py-3 rounded-xl text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              {reopening ? 'Reabrindo...' : 'Reabrir tarefa'}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">Ela volta para "A fazer" e o aviso de conclusão é desfeito.</p>
          </div>
        )}
        {!readOnly && (
          <div className="p-4 border-t bg-slate-50 flex gap-2">
            <button
              onClick={() => submit(false)}
              disabled={saving || uploading}
              className="flex-1 flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-bold py-3 rounded-xl text-sm"
            >
              <Save className="w-4 h-4" />
              Salvar andamento
            </button>
            <button
              onClick={() => submit(true)}
              disabled={saving || uploading}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm shadow-md shadow-emerald-500/30"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Concluir tarefa'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberTaskModal;
