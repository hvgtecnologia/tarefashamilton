import React, { useEffect, useMemo, useState } from 'react';
import { X, Zap, Trash2, Loader2, Calendar, ArrowRight, Users, Lock, Pencil, Plus } from 'lucide-react';
import { ProjectTemplate, planFromTemplate, listTemplates, deleteTemplate, offsetLabel } from '../lib/templates';
import { Project } from '../types';
import { todayISO, formatPrettyDate } from '../constants';
import { useTeam } from './TeamContext';
import TemplateEditorModal from './TemplateEditorModal';

export interface ActivateOptions {
  // Projeto/cliente que já existe. Ausente = cria um projeto novo com "name".
  projectId?: string;
  name: string;
  startDate: string;
  client: string;
}

interface TemplatesModalProps {
  projects: Project[];
  clients: string[];
  // Abre já pensando em ativar neste projeto (vindo da aba Etapas)
  initialProjectId?: string;
  onActivate: (template: ProjectTemplate, options: ActivateOptions) => Promise<void>;
  onClose: () => void;
}

// Automações de projeto: uma lista de etapas prontas com datas relativas (D+0, D+1, D+2…). Escreva
// uma vez e ative em qualquer cliente informando só a data de início.
const TemplatesModal: React.FC<TemplatesModalProps> = ({ projects, clients, initialProjectId, onActivate, onClose }) => {
  const { members } = useTeam();
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<ProjectTemplate | null>(null);
  const [editing, setEditing] = useState<ProjectTemplate | 'new' | null>(null);

  const [target, setTarget] = useState<'existing' | 'new'>(projects.length > 0 ? 'existing' : 'new');
  const [projectId, setProjectId] = useState(initialProjectId || '');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [client, setClient] = useState('');
  const [working, setWorking] = useState(false);

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
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [projects]);
  const targetProject = projects.find(p => p.id === projectId);

  const choose = (t: ProjectTemplate) => {
    setPicked(t);
    setName(t.name);
    setError('');
  };

  const canActivate = !!picked && !working && (target === 'existing' ? !!projectId : !!name.trim());

  const activate = async () => {
    if (!picked || !canActivate) return;
    setWorking(true);
    setError('');
    try {
      await onActivate(picked, {
        projectId: target === 'existing' ? projectId : undefined,
        name: target === 'existing' ? (targetProject?.name || '') : name.trim(),
        startDate,
        client: client.trim(),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  };

  const remove = async (t: ProjectTemplate) => {
    if (!confirm(`Excluir a automação "${t.name}"?\n\nOs projetos em que você já ativou ela não mudam.`)) return;
    try {
      await deleteTemplate(t.id);
      setTemplates(prev => prev.filter(x => x.id !== t.id));
      if (picked?.id === t.id) setPicked(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saved = (t: ProjectTemplate) => {
    setTemplates(prev => (prev.some(x => x.id === t.id) ? prev.map(x => (x.id === t.id ? t : x)) : [t, ...prev]));
    if (picked?.id === t.id) setPicked(t);
    setEditing(null);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-slate-800 flex-1">Automações de projeto</h2>
          {!picked && !loading && (
            <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
              <Plus className="w-3.5 h-3.5" /> Nova automação
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <div className="mb-3 px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : !picked ? (
            templates.length === 0 && !error ? (
              <div className="text-center py-10 text-slate-400 text-sm space-y-3">
                <Zap className="w-10 h-10 mx-auto opacity-40" />
                <p className="font-medium text-slate-500">Nenhuma automação ainda</p>
                <p className="text-xs max-w-xs mx-auto">Escreva uma vez (ex: <strong>Construção de conta de tráfego pago</strong>, com D+0, D+1, D+2…) e ative em qualquer cliente informando só a data de início.</p>
                <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                  <Plus className="w-4 h-4" /> Criar a primeira
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {templates.map(t => (
                  <li key={t.id} className="group flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300">
                    <button onClick={() => choose(t)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-slate-800 truncate">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.steps.length} etapa{t.steps.length === 1 ? '' : 's'}</p>
                    </button>
                    <button onClick={() => setEditing(t)} className="p-1.5 text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100" title="Editar"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(t)} className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                    <button onClick={() => choose(t)} className="flex items-center gap-1 text-xs font-bold text-blue-600">Ativar <ArrowRight className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              <button onClick={() => setPicked(null)} className="text-xs font-semibold text-slate-400 hover:text-slate-600">← outras automações</button>
              <p className="text-base font-bold text-slate-800">{picked.name}</p>

              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ativar em</span>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {([['existing', 'Um cliente/projeto que já existe'], ['new', 'Um projeto novo']] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setTarget(value)}
                        disabled={value === 'existing' && projects.length === 0}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-40 ${
                          target === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {target === 'existing' ? (
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente / projeto</span>
                    <select value={projectId} onChange={e => setProjectId(e.target.value)} className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option value="">Escolha…</option>
                      {sortedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome do projeto</span>
                      <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente (opcional)</span>
                      <input value={client} onChange={e => setClient(e.target.value)} list="cliente-sugestoes" placeholder="Empresa X" className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
                      <datalist id="cliente-sugestoes">{clients.map(c => <option key={c} value={c} />)}</datalist>
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Começa em (D+0)</span>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
                </label>
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
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />
                            <strong className="text-slate-500">{offsetLabel(s.offsetDays)}</strong>
                            {s.scheduledDate ? ` · ${formatPrettyDate(s.scheduledDate)}` : ''}{s.time ? ` · ${s.time}` : ''}
                          </span>
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
              onClick={activate}
              disabled={!canActivate}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {working && <Loader2 className="w-4 h-4 animate-spin" />}
              {working
                ? 'Criando as etapas...'
                : target === 'existing'
                  ? (targetProject ? `Ativar em ${targetProject.name}` : 'Escolha o cliente/projeto')
                  : 'Criar projeto e ativar'}
            </button>
          </div>
        )}
      </div>

      {editing && <TemplateEditorModal template={editing === 'new' ? undefined : editing} onSaved={saved} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default TemplatesModal;
