import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar, Flag, FolderKanban, Tag, Sparkles, X, AlertCircle, Repeat,
  CheckSquare, Square, Plus, Paperclip, FileText,
} from 'lucide-react';
import { Task, Urgency, Category, Project, TaskStatus, Recurrence, ChecklistItem, TaskAttachment } from '../types';
import { URGENCY_CONFIG, RECURRENCE_LABELS, todayISO, loadCustomStatuses, buildAllStatuses } from '../constants';
import { uploadAttachment } from '../lib/storage';

interface QuickAddProps {
  categories: Category[];
  projects: Project[];
  defaultProjectId?: string;
  defaultDate?: string;
  onClose: () => void;
  onSubmit: (data: Partial<Task>) => void;
}

const QuickAdd: React.FC<QuickAddProps> = ({
  categories,
  projects,
  defaultProjectId,
  defaultDate,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState<Urgency>(Urgency.MEDIUM);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [category, setCategory] = useState(categories[0]?.id || '');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [scheduledDate, setScheduledDate] = useState(defaultDate || todayISO());
  const [scheduledTime, setScheduledTime] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Parser de comandos rápidos:
  // "Texto !p0 @projeto #categoria /hoje"
  const parseSmartInput = (text: string) => {
    let cleanTitle = text;
    let parsedUrgency: Urgency | undefined;
    let parsedDate: string | undefined;

    // Urgência: !p0 !p1 !p2 !p3 ou !critica !alta !media !baixa
    const urgencyMatch = text.match(/!(p[0-3]|critica|alta|media|baixa)/i);
    if (urgencyMatch) {
      const u = urgencyMatch[1].toLowerCase();
      const map: Record<string, Urgency> = {
        'p0': Urgency.CRITICAL, 'critica': Urgency.CRITICAL,
        'p1': Urgency.HIGH, 'alta': Urgency.HIGH,
        'p2': Urgency.MEDIUM, 'media': Urgency.MEDIUM,
        'p3': Urgency.LOW, 'baixa': Urgency.LOW,
      };
      parsedUrgency = map[u];
      cleanTitle = cleanTitle.replace(urgencyMatch[0], '').trim();
    }

    // Data: /hoje /amanha /YYYY-MM-DD
    const dateMatch = text.match(/\/(hoje|amanha|amanhã|\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      const d = dateMatch[1].toLowerCase();
      if (d === 'hoje') {
        parsedDate = todayISO();
      } else if (d === 'amanha' || d === 'amanhã') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        parsedDate = tomorrow.toISOString().split('T')[0];
      } else {
        parsedDate = d;
      }
      cleanTitle = cleanTitle.replace(dateMatch[0], '').trim();
    }

    return { title: cleanTitle, urgency: parsedUrgency, date: parsedDate };
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

  const removeChecklistItem = (id: string) => {
    setChecklist(prev => prev.filter(c => c.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const files = Array.from(fileList);
    e.target.value = '';
    for (const file of files) {
      try {
        const attachment = await uploadAttachment(file);
        setAttachments(prev => [...prev, attachment]);
      } catch (err) {
        console.error('Erro ao anexar arquivo:', err);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = () => {
    if (!title.trim()) return;

    const parsed = parseSmartInput(title);

    // Captura texto pendente do input de subtarefa que ainda não virou item
    let finalChecklist = checklist;
    if (newChecklistText.trim()) {
      finalChecklist = [...checklist, {
        id: crypto.randomUUID(),
        text: newChecklistText.trim(),
        done: false,
      }];
    }

    onSubmit({
      title: parsed.title || title.trim(),
      description,
      urgency: parsed.urgency || urgency,
      status,
      category,
      projectId: projectId || undefined,
      scheduledDate: parsed.date || scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined,
      dueDate: dueDate || undefined,
      dayOfWeek: 'inbox',
      notes,
      attachments,
      checklist: finalChecklist,
      recurrence,
      isCompleted: false,
      position: 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[6vh] px-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center gap-3 flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
          <span className="text-white font-bold">Adicionar Rápido</span>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <input
            ref={inputRef}
            type="text"
            placeholder="O que precisa ser feito?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            className="w-full text-lg outline-none placeholder:text-slate-300 border-b-2 border-transparent focus:border-blue-500 pb-2 font-medium"
          />

          <div className="text-xs text-slate-400">
            💡 Dicas: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">!p0</code> urgência •{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">/hoje</code> data •{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">⌘/Ctrl+Enter</code> salvar
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Status</label>
            <div className="grid grid-cols-2 gap-1.5">
              {buildAllStatuses(loadCustomStatuses()).map(({ id: s, cfg, isNative }) => {
                const customColor = (cfg as any).customColor as string | undefined;
                return (
                  <button
                    key={s}
                    type="button"
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

          <div className="grid grid-cols-2 gap-3">
            {/* Urgência */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <Flag className="w-3 h-3" /> Prioridade
              </label>
              <select
                value={urgency}
                onChange={e => setUrgency(e.target.value as Urgency)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {Object.entries(URGENCY_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>

            {/* Recorrência */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <Repeat className="w-3 h-3" /> Recorrência
              </label>
              <select
                value={recurrence}
                onChange={e => setRecurrence(e.target.value as Recurrence)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {Object.entries(RECURRENCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Data */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Quando vou fazer
              </label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <input
                  type="time"
                  title="Horário (opcional)"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <p className="text-[9px] text-blue-600 mt-1 italic">
                📅 Aparece no calendário e na semana, ordenada pelo horário
              </p>
            </div>

            {/* Prazo */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Prazo
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="text-[9px] text-slate-500 mt-1 italic">
                ⏰ Deadline (quando precisa estar pronta)
              </p>
            </div>

            {/* Projeto */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <FolderKanban className="w-3 h-3" /> Projeto
              </label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Nenhum</option>
                {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Categoria */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <Tag className="w-3 h-3" /> Categoria
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Descrição</label>
            <textarea
              placeholder="Resumo curto..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full h-16 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Notas / Briefing */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Notas / Briefing</label>
            <textarea
              placeholder="Escreva briefings, ideias, contexto..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full h-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none resize-none leading-relaxed focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Checklist */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-2">
              <CheckSquare className="w-3 h-3" /> Subtarefas
              {checklist.length > 0 && (
                <span className="text-emerald-600 normal-case font-normal">{checklist.length}</span>
              )}
            </label>

            {checklist.length > 0 && (
              <div className="space-y-1 mb-2">
                {checklist.map(item => (
                  <div key={item.id} className="group flex items-center gap-2 hover:bg-slate-50 rounded-lg px-1.5 py-1">
                    <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <span className="flex-1 text-sm text-slate-700">{item.text}</span>
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                type="button"
                onClick={addChecklistItem}
                disabled={!newChecklistText.trim()}
                className="px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>
          </div>

          {/* Anexos */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Anexos
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                multiple
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {attachments.map(att => (
                <div key={att.id} className="relative group">
                  {att.type === 'image' ? (
                    <div className="aspect-square rounded-lg overflow-hidden border border-slate-200">
                      <img src={att.url} className="w-full h-full object-cover" alt={att.name} />
                    </div>
                  ) : (
                    <div className="aspect-square rounded-lg border-2 border-slate-200 flex flex-col items-center justify-center p-1 bg-slate-50">
                      <FileText className="w-5 h-5 text-rose-500 mb-1" />
                      <span className="text-[9px] font-medium text-slate-600 text-center line-clamp-2">{att.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-1 right-1 bg-white/90 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
              >
                <Paperclip className="w-4 h-4 mb-1" />
                <span className="text-[9px] font-bold">Anexar</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-lg transition-colors"
          >
            Criar Tarefa
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickAdd;
