import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Zap } from 'lucide-react';
import { ProjectTemplate, EditorRow, blankRow, stepsToRows, rowsToSteps, createTemplate, updateTemplate } from '../lib/templates';
import { useTeam } from './TeamContext';

interface TemplateEditorModalProps {
  template?: ProjectTemplate; // ausente = criar uma automação nova
  onSaved: (template: ProjectTemplate) => void;
  onClose: () => void;
}

// Escreve uma automação direto: o que fazer em cada etapa e quantos dias depois do início (D+0, D+2…).
// Para usar, é só ativar num cliente informando a data de início.
const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({ template, onSaved, onClose }) => {
  const { members } = useTeam();
  const [name, setName] = useState(template?.name || '');
  const [rows, setRows] = useState<EditorRow[]>(() => (template && template.steps.length > 0 ? stepsToRows(template.steps) : [blankRow()]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const patch = (key: string, changes: Partial<EditorRow>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...changes } : r)));
  const remove = (key: string) => setRows(prev => prev.filter(r => r.key !== key).map(r => (r.dependsOnKey === key ? { ...r, dependsOnKey: '' } : r)));
  const move = (index: number, delta: number) => setRows(prev => {
    const target = index + delta;
    if (target < 0 || target >= prev.length) return prev;
    const next = [...prev];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Dê um nome para a automação (ex: Construção de conta de tráfego pago).');
    const converted = rowsToSteps(rows);
    if (converted.error) return setError(converted.error);
    const steps = converted.steps;

    setSaving(true);
    try {
      const input = { name: name.trim(), description: template?.description || '', color: template?.color || '#3b82f6', steps };
      onSaved(template ? await updateTemplate(template.id, input) : await createTemplate(input));
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-slate-800 flex-1">{template ? 'Editar automação' : 'Nova automação'}</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome da automação</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Construção de conta de tráfego pago"
              className="mt-1 w-full text-sm font-semibold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Etapas</p>
            <p className="text-[11px] text-slate-500 mb-2">
              <strong>D+</strong> é quantos dias depois do início a etapa cai: D+0 é o dia que você ativar, D+2 é dois dias depois.
            </p>
            <ol className="space-y-2">
              {rows.map((r, i) => (
                <li key={r.key} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-1.5">{i + 1}</span>
                    <input
                      value={r.title}
                      onChange={e => patch(r.key, { title: e.target.value })}
                      placeholder="O que tem que ser feito (ex: Pegar a senha do cliente)"
                      className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <div className="flex flex-col">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30" title="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30" title="Descer"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <button onClick={() => remove(r.key)} disabled={rows.length === 1} className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-30 mt-0.5" title="Tirar etapa"><Trash2 className="w-4 h-4" /></button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pl-8">
                    <label className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                      D+
                      <input
                        value={r.offset}
                        onChange={e => patch(r.key, { offset: e.target.value })}
                        inputMode="numeric"
                        placeholder="—"
                        className="w-14 text-xs font-normal text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 outline-none text-center"
                        title="Dias depois do início. Vazio = sem data."
                      />
                    </label>
                    <input type="time" value={r.time} onChange={e => patch(r.key, { time: e.target.value })} className="text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 outline-none" title="Horário (opcional)" />
                    {members.length > 0 && (
                      <select value={r.assignedTo} onChange={e => patch(r.key, { assignedTo: e.target.value })} className="text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none">
                        <option value="">Eu mesmo</option>
                        {members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                      </select>
                    )}
                    {i > 0 && (
                      <select value={r.dependsOnKey} onChange={e => patch(r.key, { dependsOnKey: e.target.value })} className="text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none max-w-[190px]" title="A etapa fica bloqueada até a escolhida ser concluída">
                        <option value="">Começa já</option>
                        {rows.slice(0, i).map((prev, pi) => (
                          <option key={prev.key} value={prev.key}>Depois da {pi + 1}. {(prev.title || 'sem título').slice(0, 24)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <textarea
                    value={r.description}
                    onChange={e => patch(r.key, { description: e.target.value })}
                    placeholder="Detalhes (opcional)"
                    rows={1}
                    className="ml-8 w-[calc(100%-2rem)] text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 outline-none resize-none placeholder:text-slate-300"
                  />
                </li>
              ))}
            </ol>
            <button onClick={() => setRows(prev => [...prev, blankRow()])} className="mt-2 flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700">
              <Plus className="w-3.5 h-3.5" /> Adicionar etapa
            </button>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={save} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Salvando...' : 'Salvar automação'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditorModal;
