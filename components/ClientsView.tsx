import React, { useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { Task } from '../types';
import { todayISO, formatPrettyDate } from '../constants';
import { summarizeClients } from '../lib/clients';
import { sortSteps } from '../lib/steps';
import { useTeam, firstName } from './TeamContext';

interface ClientsViewProps {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}

// Tudo de cada cliente num lugar só: o que está aberto, o que está atrasado e o que já foi feito.
const ClientsView: React.FC<ClientsViewProps> = ({ tasks, onOpenTask }) => {
  const { findMember } = useTeam();
  const today = todayISO();
  const clients = useMemo(() => summarizeClients(tasks, today), [tasks, today]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});

  if (clients.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-500">Nenhum cliente ainda</p>
        <p className="text-xs mt-1">Preencha o campo <strong>Cliente</strong> ao criar ou editar uma tarefa e ela passa a aparecer aqui.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-lg font-bold text-slate-800 mb-1">Clientes</h1>
      {clients.map(c => {
        const isOpen = !!open[c.name];
        const openTasks: Task[] = sortSteps<Task>(c.tasks.filter(t => !t.isCompleted));
        const doneTasks = c.tasks.filter(t => t.isCompleted)
          .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
        return (
          <section key={c.name} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(p => ({ ...p, [c.name]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <Building2 className="w-4 h-4 text-blue-500" />
              <span className="flex-1 font-bold text-slate-800 truncate">{c.name}</span>
              {c.overdue > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" /> {c.overdue} atrasada{c.overdue > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-500">{c.open} aberta{c.open === 1 ? '' : 's'}</span>
              <span className="text-[11px] font-semibold text-emerald-600">{c.done} feita{c.done === 1 ? '' : 's'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-slate-100 px-4 py-2">
                {openTasks.length === 0 && <p className="text-xs text-slate-400 py-2">Nada aberto para este cliente.</p>}
                <ul className="divide-y divide-slate-100">
                  {openTasks.map(t => {
                    const day = t.scheduledDate || t.dueDate;
                    const late = !!day && day < today;
                    const member = findMember(t.assignedTo);
                    return (
                      <li key={t.id}>
                        <button onClick={() => onOpenTask(t)} className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-slate-50 -mx-2 px-2 rounded">
                          <Circle className={`w-3.5 h-3.5 flex-shrink-0 ${late ? 'text-rose-400' : 'text-slate-300'}`} />
                          <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{t.title}</span>
                          {member && <span className="text-[11px] font-semibold text-violet-600">{firstName(member.name)}</span>}
                          <span className={`text-[11px] font-medium ${late ? 'text-rose-600' : 'text-slate-400'}`}>
                            {day ? formatPrettyDate(day) : 'Sem data'}{t.scheduledTime ? ` · ${t.scheduledTime}` : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {doneTasks.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowDone(p => ({ ...p, [c.name]: !p[c.name] }))}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {showDone[c.name] ? 'Esconder concluídas' : `Ver ${doneTasks.length} concluída${doneTasks.length === 1 ? '' : 's'}`}
                    </button>
                    {showDone[c.name] && (
                      <ul className="mt-1">
                        {doneTasks.map(t => (
                          <li key={t.id}>
                            <button onClick={() => onOpenTask(t)} className="w-full text-left py-1 text-sm text-slate-400 line-through truncate hover:text-slate-600">
                              {t.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default ClientsView;
