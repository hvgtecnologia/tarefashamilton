import React, { useMemo, useState } from 'react';
import { X, Users, UserPlus, Loader2, Trash2, ShieldCheck, User } from 'lucide-react';
import { Project, ProjectMember, ProjectRole, TeamMember } from '../types';

interface ProjectPeopleModalProps {
  project: Project;
  team: TeamMember[];
  projectMembers: ProjectMember[]; // só as deste projeto
  onSetRole: (userId: string, role: ProjectRole) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  // Abre o cadastro de uma pessoa nova que já entra neste projeto
  onCreateNew: () => void;
  onClose: () => void;
}

const ROLE_LABEL: Record<ProjectRole, string> = { admin: 'Administrador', member: 'Participante' };

// Quem trabalha neste projeto. Administrador vê e edita tudo do projeto, coloca pessoas e pode tornar
// outro administrador; participante só enxerga o que for delegado a ele.
const ProjectPeopleModal: React.FC<ProjectPeopleModalProps> = ({
  project, team, projectMembers, onSetRole, onRemove, onCreateNew, onClose,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toAdd, setToAdd] = useState('');

  const nameOf = (userId: string) => team.find(m => m.userId === userId)?.name || 'Pessoa removida da equipe';
  const inProject = useMemo(
    () => [...projectMembers].sort((a, b) =>
      (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || nameOf(a.userId).localeCompare(nameOf(b.userId))),
    [projectMembers, team], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const available = team.filter(m => !projectMembers.some(pm => pm.userId === m.userId));

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <Users className="w-5 h-5" style={{ color: project.color }} />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 truncate">Pessoas do projeto</h2>
            <p className="text-xs text-slate-400 truncate">{project.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>}

          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-0.5">
            <p><strong className="text-slate-700">Administrador:</strong> vê e edita tudo deste projeto, coloca pessoas e pode tornar outra pessoa administradora.</p>
            <p><strong className="text-slate-700">Participante:</strong> vê só as tarefas delegadas a ele.</p>
          </div>

          {inProject.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Ninguém neste projeto ainda.</p>
          ) : (
            <ul className="space-y-2">
              {inProject.map(pm => (
                <li key={pm.userId} className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2.5">
                  {pm.role === 'admin' ? <ShieldCheck className="w-4 h-4 text-violet-600" /> : <User className="w-4 h-4 text-slate-400" />}
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 truncate">{nameOf(pm.userId)}</span>
                  <select
                    value={pm.role}
                    disabled={busy !== null}
                    onChange={e => run(pm.userId, () => onSetRole(pm.userId, e.target.value as ProjectRole))}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none"
                  >
                    {(Object.keys(ROLE_LABEL) as ProjectRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <button
                    disabled={busy !== null}
                    onClick={() => {
                      if (confirm(`Tirar ${nameOf(pm.userId)} deste projeto?\n\nAs tarefas delegadas a essa pessoa continuam existindo.`)) {
                        run(pm.userId, () => onRemove(pm.userId));
                      }
                    }}
                    className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-40"
                    title="Tirar do projeto"
                  >
                    {busy === pm.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Colocar alguém</p>
            {available.length > 0 && (
              <div className="flex gap-2">
                <select
                  value={toAdd}
                  onChange={e => setToAdd(e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none"
                >
                  <option value="">Escolha alguém da equipe…</option>
                  {available.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                </select>
                <button
                  disabled={!toAdd || busy !== null}
                  onClick={() => run('add', async () => { await onSetRole(toAdd, 'member'); setToAdd(''); })}
                  className="px-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg flex items-center gap-1.5"
                >
                  {busy === 'add' && <Loader2 className="w-4 h-4 animate-spin" />} Colocar
                </button>
              </div>
            )}
            <button
              onClick={onCreateNew}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg"
            >
              <UserPlus className="w-4 h-4" /> Cadastrar pessoa nova neste projeto
            </button>
            <p className="text-[11px] text-slate-400">A pessoa nova ganha login e senha e entra na equipe. Você escolhe se ela vira administradora depois.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectPeopleModal;
