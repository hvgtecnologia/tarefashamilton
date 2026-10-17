import React, { useEffect, useMemo, useState } from 'react';
import { X, LayoutTemplate, Trash2, Loader2, Calendar, ArrowRight, Users, Lock } from 'lucide-react';
import { ProjectTemplate, planFromTemplate, listTemplates, deleteTemplate } from '../lib/templates';
import { todayISO, formatPrettyDate } from '../constants';
import { useTeam } from './TeamContext';

interface TemplatesModalProps {
  onClose: () => void;
  onCreate: (template: ProjectTemplate, options: { name: string; startDate: string; client: string }) => Promise<void>;
  clients: string[];
}

// Cria um projeto novo a partir de um modelo: escolhe o modelo, informa nome, data de início e
// cliente, e as etapas entram com as datas já calculadas.
const TemplatesModal: React.FC<TemplatesModalProps> = ({ onClose, onCreate, clients }) => {
  const { members } = useTeam();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<ProjectTemplate | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [client, setClient] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    listTemplates()
      .then(list => { if (alive) setTemplates(list); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const preview = useMemo(() => (picked ? planFromTemplate(picked.steps, startDate) : []), [picked, startDate]);
  const nameOf = (userId?: string) => members.find(m => m.userId === userId)?.name;

  const choose = (t: ProjectTemplate) => {
    setPicked(t);
    setName(t.name);
    setError('');
  };

  const create = async () => {
    if (!picked || !name.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await onCreate(picked, { name: name.trim(), startDate, client: client.trim() });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  const remove = async (t: ProjectTemplate) => {
    if (!confirm(`Excluir o modelo "${t.name}"?\n\nOs projetos que você já criou com ele não mudam.`)) return;
    try {
      await deleteTemplate(t.id);
      setTemplates(prev => prev.filter(x => x.id !== t.id));
      if (picked?.id === t.id) setPicked(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <LayoutTemplate className="w-5 h-5 text-blue-500" />
          <h2 className="font-bold text-slate-800 flex-1">Projeto a partir de um modelo</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <div className="mb-3 px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : !picked ? (
            templates.length === 0 && !error ? (
              <div className="text-center py-10 text-slate-400 text-sm space-y-2">
                <LayoutTemplate className="w-10 h-10 mx-auto opacity-40" />
                <p>Você ainda não tem modelos.</p>
                <p className="text-xs">Monte as etapas de um projeto e use <strong>Salvar como modelo</strong> na aba Etapas.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {templates.map(t => (
                  <li key={t.id} className="group flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                    <button onClick={() => choose(t)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-slate-800 truncate">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.steps.length} etapa{t.steps.length === 1 ? '' : 's'}</p>
                    </button>
                    <button onClick={() => remove(t)} className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100" title="Excluir modelo">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              <button onClick={() => setPicked(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">← outros modelos</button>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome do projeto</span>
                  <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Começa em</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente (opcional)</span>
                    <input value={client} onChange={e => setClient(e.target.value)} list="cliente-sugestoes" placeholder="Empresa X" className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
                    <datalist id="cliente-sugestoes">{clients.map(c => <option key={c} value={c} />)}</datalist>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Etapas que serão criadas</p>
                <ol className="space-y-1.5">
                  {preview.map(s => (
                    <li key={s.index} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{s.index + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-700">{s.title}</p>
                        <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{s.scheduledDate ? formatPrettyDate(s.scheduledDate) : 'Sem data'}{s.time ? ` · ${s.time}` : ''}</span>
                          {nameOf(s.assignedTo) && <span className="flex items-center gap-1 text-violet-500"><Users className="w-3 h-3" />{nameOf(s.assignedTo)}</span>}
                          {s.dependsOn !== undefined && <span className="flex items-center gap-1 text-amber-600"><Lock className="w-3 h-3" />depois da etapa {s.dependsOn + 1}</span>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>

        {picked && (
          <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
            <button
              onClick={create}
              disabled={!name.trim() || creating}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {creating && <Loader2 className="w-4 h-4 animate-spin" />}
              {creating ? 'Criando as etapas...' : `Criar projeto com ${picked.steps.length} etapa${picked.steps.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatesModal;
