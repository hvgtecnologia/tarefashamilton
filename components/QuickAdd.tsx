import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Flag, FolderKanban, Tag, Sparkles, X } from 'lucide-react';
import { Task, Urgency, Category, Project, TaskStatus } from '../types';
import { URGENCY_CONFIG, todayISO } from '../constants';

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
  const [category, setCategory] = useState(categories[0]?.id || '');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [scheduledDate, setScheduledDate] = useState(defaultDate || todayISO());
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = () => {
    if (!title.trim()) return;

    const parsed = parseSmartInput(title);

    onSubmit({
      title: parsed.title || title.trim(),
      urgency: parsed.urgency || urgency,
      category,
      projectId: projectId || undefined,
      scheduledDate: parsed.date || scheduledDate || undefined,
      dayOfWeek: 'inbox',
      notes: '',
      attachments: [],
      checklist: [],
      status: 'todo',
      recurrence: 'none',
      isCompleted: false,
      position: 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-white" />
          <span className="text-white font-bold">Adicionar Rápido</span>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <input
            ref={inputRef}
            type="text"
            placeholder="O que precisa ser feito?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') onClose();
            }}
            className="w-full text-lg outline-none placeholder:text-slate-300 border-b-2 border-transparent focus:border-blue-500 pb-2 font-medium"
          />

          <div className="text-xs text-slate-400">
            💡 Dicas: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">!p0</code> urgência •{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">/hoje</code> data •{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">Enter</code> salvar
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

            {/* Data */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Quando
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
              />
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
