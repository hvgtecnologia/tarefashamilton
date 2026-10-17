import React, { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Project, ProjectMember, ProjectRole } from '../types';

interface ProjectAccessEditorProps {
  userId: string;
  projects: Project[];
  projectMembers: ProjectMember[];
  // role null = tirar do projeto
  onChange: (projectId: string, userId: string, role: ProjectRole | null) => Promise<void>;
}

// Na edição do membro: em quais projetos ele está e com que papel. Cada mudança vale na hora.
// "Nenhum" = usuário básico naquele projeto; "Administrador" em pelo menos um = acesso de gestor.
const ProjectAccessEditor: React.FC<ProjectAccessEditorProps> = ({ userId, projects, projectMembers, onChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const roleOf = (projectId: string): '' | ProjectRole =>
    projectMembers.find(m => m.projectId === projectId && m.userId === userId)?.role || '';

  const change = async (projectId: string, value: string) => {
    setBusy(projectId);
    setError('');
    try { await onChange(projectId, userId, value === '' ? null : (value as ProjectRole)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const adminCount = projects.filter(p => roleOf(p.id) === 'admin').length;

  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" /> Acesso a projetos
      </label>
      <p className="text-[11px] text-slate-500 mb-2">
        {adminCount === 0
          ? 'Hoje esta pessoa é usuário básico: só vê as tarefas delegadas a ela.'
          : `Administra ${adminCount} projeto${adminCount > 1 ? 's' : ''}: vê tudo neles, coloca pessoas e pode criar projetos.`}
      </p>
      {error && <div className="mb-2 px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>}
      <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
        {projects.length === 0 && <li className="px-3 py-3 text-xs text-slate-400">Nenhum projeto ainda.</li>}
        {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })).map(p => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{p.name}</span>
            {busy === p.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
            <select
              value={roleOf(p.id)}
              disabled={busy !== null}
              onChange={e => change(p.id, e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none"
            >
              <option value="">Nenhum</option>
              <option value="member">Participante</option>
              <option value="admin">Administrador</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProjectAccessEditor;
