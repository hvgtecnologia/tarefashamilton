import React, { useMemo, useState } from 'react';
import { Users, UserPlus, KeyRound, Trash2, RefreshCw, Send, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Task, TeamMember } from '../types';
import { todayISO, isOverdue, formatPrettyDate, sortTasksByTime } from '../constants';

interface TeamViewProps {
  members: TeamMember[];
  tasks: Task[];
  ready: boolean;
  onAddMember: () => void;
  onResetPassword: (member: TeamMember) => void;
  onDeleteMember: (member: TeamMember) => Promise<void>;
  onDelegate: (member: TeamMember) => void;
  onOpenTask: (task: Task) => void;
  onMarkSeen: (ids: string[]) => void;
  onRefresh: () => Promise<void>;
}

const taskDay = (t: Task) => t.scheduledDate || t.dueDate;

const formatCompletion = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const TeamView: React.FC<TeamViewProps> = ({
  members, tasks, ready, onAddMember, onResetPassword, onDeleteMember, onDelegate, onOpenTask, onMarkSeen, onRefresh,
}) => {
  const today = todayISO();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const unseen = useMemo(
    () => tasks
      .filter(t => t.isCompleted && t.completionSeen === false)
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()),
    [tasks]
  );

  const cards = useMemo(() => {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return members.map(member => {
      const open = tasks.filter(t => t.assignedTo === member.userId && !t.isCompleted);
      // Atrasadas primeiro (mais antigas no topo), depois por dia e horário
      const overdue = open.filter(t => isOverdue(taskDay(t))).sort((a, b) => (taskDay(a) || '').localeCompare(taskDay(b) || ''));
      const rest = open.filter(t => !isOverdue(taskDay(t)));
      const dated = rest.filter(t => taskDay(t)).sort((a, b) =>
        (taskDay(a) || '').localeCompare(taskDay(b) || '') || (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));
      const undated = sortTasksByTime(rest.filter(t => !taskDay(t)));
      const doneRecently = tasks.filter(t => t.completedBy === member.userId && t.completedAt && new Date(t.completedAt).getTime() >= monthAgo).length;
      return { member, open: [...overdue, ...dated, ...undated], overdueCount: overdue.length, doneRecently };
    });
  }, [members, tasks]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const handleDelete = async (member: TeamMember) => {
    if (!confirm(`Remover ${member.name} da equipe?\n\nAs tarefas abertas dele voltam para você, sem responsável. O histórico do que ele concluiu é mantido.`)) return;
    try {
      await onDeleteMember(member);
    } catch (err: any) {
      alert(err?.message || 'Não foi possível remover o membro.');
    }
  };

  const nameOf = (userId?: string | null) => members.find(m => m.userId === userId)?.name;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 rounded-2xl p-6 md:p-8 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Equipe do Hamilton</h1>
              <p className="text-violet-100 text-sm mt-1">
                {members.length === 0
                  ? 'Cadastre seus membros e passe a delegar tarefas.'
                  : `${members.length} membro${members.length > 1 ? 's' : ''} · você delega, eles concluem e o resultado volta pra você.`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-white/15 hover:bg-white/25 text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"
              title="Buscar novidades da equipe"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              onClick={onAddMember}
              disabled={!ready}
              className="bg-white text-violet-700 hover:bg-violet-50 disabled:opacity-60 font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm shadow"
            >
              <UserPlus className="w-4 h-4" />
              Cadastrar membro
            </button>
          </div>
        </div>
      </div>

      {/* Módulo ainda não instalado no banco */}
      {!ready && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 space-y-2">
            <p className="font-bold">O módulo de equipe ainda não está ativo no banco de dados.</p>
            <ol className="list-decimal ml-5 space-y-1 text-amber-800">
              <li>No Supabase, abra o <strong>SQL Editor</strong> e rode o arquivo <code className="bg-amber-100 px-1 rounded">migration-v5-equipe.sql</code>.</li>
              <li>No Terminal, publique a função: <code className="bg-amber-100 px-1 rounded">supabase functions deploy manage-team</code>.</li>
              <li>Recarregue esta página.</li>
            </ol>
          </div>
        </div>
      )}

      {/* Conclusões novas da equipe */}
      {unseen.length > 0 && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold text-emerald-900">Concluídas pela equipe</h2>
              <span className="bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unseen.length}</span>
            </div>
            <button
              onClick={() => onMarkSeen(unseen.map(t => t.id))}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline"
            >
              Marcar todas como vistas
            </button>
          </div>
          <div className="space-y-2">
            {unseen.map(task => (
              <button
                key={task.id}
                onClick={() => onOpenTask(task)}
                className="w-full text-left bg-white border border-emerald-100 hover:border-emerald-300 rounded-xl px-4 py-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{task.title}</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      ✓ {task.completedByName || nameOf(task.assignedTo) || 'Equipe'} · {formatCompletion(task.completedAt)}
                    </p>
                    {task.memberNotes && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic">"{task.memberNotes}"</p>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 whitespace-nowrap">Ver detalhes</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Membros */}
      {ready && members.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">Nenhum membro na equipe ainda</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Cadastre com nome, usuário e uma senha simples. Depois é só escolher o responsável em cada tarefa.</p>
          <button
            onClick={onAddMember}
            className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-5 py-2.5 rounded-xl inline-flex items-center gap-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar primeiro membro
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map(({ member, open, overdueCount, doneRecently }) => {
            const isExpanded = expanded[member.id];
            const visible = isExpanded ? open : open.slice(0, 4);
            return (
              <div key={member.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg uppercase flex-shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 truncate">{member.name}</h3>
                        <p className="text-xs text-slate-400 font-mono">@{member.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onResetPassword(member)}
                        className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"
                        title="Redefinir senha"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(member)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Remover da equipe"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <div className="text-xl font-bold text-slate-800">{open.length}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Abertas</div>
                    </div>
                    <div className={`rounded-xl p-2.5 text-center ${overdueCount > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                      <div className={`text-xl font-bold ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{overdueCount}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Atrasadas</div>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <div className="text-xl font-bold text-emerald-600">{doneRecently}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Concl. 30d</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    {open.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">Nenhuma tarefa aberta com {member.name.split(' ')[0]}.</p>
                    ) : (
                      visible.map(task => {
                        const day = taskDay(task);
                        const late = isOverdue(day);
                        return (
                          <button
                            key={task.id}
                            onClick={() => onOpenTask(task)}
                            className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100"
                          >
                            <span className="text-sm text-slate-700 truncate">{task.title}</span>
                            <span className={`text-[10px] font-bold whitespace-nowrap flex items-center gap-1 ${
                              late ? 'text-rose-600' : day === today ? 'text-blue-600' : 'text-slate-400'
                            }`}>
                              <Clock className="w-3 h-3" />
                              {day ? `${late ? 'Atrasada · ' : day === today ? 'Hoje · ' : ''}${formatPrettyDate(day)}` : 'Sem data'}
                              {task.scheduledTime ? ` ${task.scheduledTime}` : ''}
                            </span>
                          </button>
                        );
                      })
                    )}
                    {open.length > 4 && (
                      <button
                        onClick={() => setExpanded(prev => ({ ...prev, [member.id]: !prev[member.id] }))}
                        className="text-xs font-bold text-violet-600 hover:underline px-3 py-1"
                      >
                        {isExpanded ? 'Mostrar menos' : `Ver todas (${open.length})`}
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <button
                    onClick={() => onDelegate(member)}
                    className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-bold py-2 rounded-lg text-sm"
                  >
                    <Send className="w-4 h-4" />
                    Delegar tarefa para {member.name.split(' ')[0]}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TeamView;
