import React, { useMemo, useState } from 'react';
import { Check, Plus, Clock, Calendar, Users, ChevronsRight, AlertCircle, Lock, MessageCircle, LayoutTemplate } from 'lucide-react';
import { Project, Task, Urgency } from '../types';
import { todayISO, isOverdue, formatPrettyDate } from '../constants';
import { sortSteps, shiftFollowing, waitingFor } from '../lib/steps';
import { buildTemplateSteps, createTemplate } from '../lib/templates';
import { hasWhatsapp, whatsappLink, releasedMessage } from '../lib/team';
import { useTeam, firstName } from './TeamContext';

interface ProjectStepsProps {
  project: Project;
  tasks: Task[]; // só as tarefas deste projeto
  onAddTask: (data: Partial<Task>) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onCompleteTask: (id: string) => void;
  onTaskClick: (task: Task) => void;
}

// Cronograma do projeto: cada etapa tem o que fazer, data, horário e (se quiser) um responsável da
// equipe. Cada etapa é uma tarefa do projeto, então já cai na semana, no calendário e na agenda do
// responsável automaticamente.
const ProjectSteps: React.FC<ProjectStepsProps> = ({
  project, tasks, onAddTask, onUpdateTask, onCompleteTask, onTaskClick,
}) => {
  const { members, findMember } = useTeam();
  const steps = useMemo(() => sortSteps(tasks), [tasks]);
  const today = todayISO();

  // Etapas costumam vir em sequência: já sugere o dia da última para poupar um clique.
  const lastDate = useMemo(() => [...steps].reverse().find(s => s.scheduledDate)?.scheduledDate || '', [steps]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dependsOn, setDependsOn] = useState('');
  const [showDescription, setShowDescription] = useState(false);
  const [notice, setNotice] = useState('');

  // Todas as etapas do projeto são do mesmo cliente: a nova herda sem perguntar.
  const projectClient = useMemo(() => tasks.find(t => t.client)?.client, [tasks]);

  const done = steps.filter(s => s.isCompleted).length;

  const add = () => {
    if (!title.trim()) return;
    const when = date || lastDate || undefined;
    const prev = dependsOn ? steps.find(s => s.id === dependsOn) : undefined;
    onAddTask({
      client: projectClient,
      dependsOn: prev ? prev.id : undefined,
      // Etapa que depende de outra ainda aberta nasce bloqueada; o banco libera quando a anterior for concluída
      ...(prev && !prev.isCompleted ? { status: 'blocked' as const } : {}),
      title: title.trim(),
      description: description.trim(),
      urgency: Urgency.MEDIUM,
      scheduledDate: when,
      scheduledTime: time || undefined,
      dayOfWeek: when ? 'monday' : 'inbox',
      assignedTo: assignedTo || undefined,
    });
    setDependsOn('');
    setTitle('');
    setDescription('');
    setTime('');
    setShowDescription(false);
    // data e responsável ficam como estão: a próxima etapa costuma ser parecida
  };

  const toggle = (step: Task) => {
    if (step.isCompleted) { onUpdateTask(step.id, { status: 'todo' }); return; }
    const prev = waitingFor(step, tasks);
    if (prev && !confirm(`A etapa "${prev.title}" ainda não foi concluída.\n\nConcluir esta mesmo assim?`)) return;
    onCompleteTask(step.id);
  };

  const saveAsTemplate = async () => {
    if (steps.length === 0) return;
    const name = prompt('Nome do modelo:', project.name);
    if (!name || !name.trim()) return;
    try {
      await createTemplate({ name: name.trim(), description: project.description, color: project.color, steps: buildTemplateSteps(steps) });
      setNotice(`Modelo "${name.trim()}" salvo. Use "Projeto a partir de modelo" no menu lateral.`);
    } catch (e) {
      setNotice((e as Error).message);
    }
    window.setTimeout(() => setNotice(''), 6000);
  };

  const postpone = (step: Task) => {
    const changes = shiftFollowing(steps, step.id, 1);
    if (changes.length === 0) return;
    const label = changes.length === 1 ? 'esta etapa' : `esta etapa e as ${changes.length - 1} seguinte(s)`;
    if (!confirm(`Adiar ${label} em 1 dia?`)) return;
    changes.forEach(c => onUpdateTask(c.id, { scheduledDate: c.scheduledDate }));
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-700">
          Etapas
          <span className="ml-2 text-xs font-medium text-slate-400">
            {steps.length === 0 ? 'nenhuma ainda' : `${done} de ${steps.length} concluída${done === 1 ? '' : 's'}`}
          </span>
        </h2>
        {steps.length > 0 && (
          <button
            onClick={saveAsTemplate}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600"
            title="Guarda estas etapas, com as datas relativas, para criar o próximo projeto parecido"
          >
            <LayoutTemplate className="w-3.5 h-3.5" /> Salvar como modelo
          </button>
        )}
      </div>
      {notice && <div className="mb-3 px-3 py-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg">{notice}</div>}

      {/* Nova etapa */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 mb-5 space-y-2">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="O que tem que ser feito? (ex: Pegar a senha do cliente)"
          className="w-full text-sm font-medium outline-none placeholder:text-slate-300 px-1 py-1"
        />

        {showDescription && (
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalhes desta etapa (opcional)"
            rows={2}
            className="w-full text-sm text-slate-600 outline-none resize-none bg-slate-50 rounded-lg px-2.5 py-2 placeholder:text-slate-300"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
            <Calendar className="w-3 h-3" />
            <input
              type="date"
              value={date || lastDate}
              onChange={e => setDate(e.target.value)}
              className="text-xs font-normal text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
            <Clock className="w-3 h-3" />
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="text-xs font-normal text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
            />
          </label>
          {members.length > 0 && (
            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
              <Users className="w-3 h-3" />
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="text-xs font-normal text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
              >
                <option value="">Eu mesmo</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </label>
          )}

          {steps.length > 0 && (
            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-400" title="A etapa nasce bloqueada e é liberada sozinha quando a escolhida for concluída">
              <Lock className="w-3 h-3" />
              <select
                value={dependsOn}
                onChange={e => setDependsOn(e.target.value)}
                className="text-xs font-normal text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none max-w-[170px]"
              >
                <option value="">Começa já</option>
                {steps.map((st, idx) => (
                  <option key={st.id} value={st.id}>Depois da {idx + 1}. {st.title.slice(0, 28)}</option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={() => setShowDescription(v => !v)}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-600"
          >
            {showDescription ? 'sem detalhes' : '+ detalhes'}
          </button>

          <button
            type="button"
            onClick={add}
            disabled={!title.trim()}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-40"
            style={{ backgroundColor: project.color }}
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar etapa
          </button>
        </div>
      </div>

      {/* Linha do tempo */}
      {steps.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">
          Adicione a primeira etapa acima. Cada uma entra sozinha na sua semana e na agenda de quem for responsável.
        </p>
      ) : (
        <ol className="relative">
          {steps.map((step, i) => {
            const late = !step.isCompleted && !!step.scheduledDate && isOverdue(step.scheduledDate);
            const member = findMember(step.assignedTo);
            const waiting = waitingFor(step, tasks);
            const predecessor = step.dependsOn ? tasks.find(t => t.id === step.dependsOn) : undefined;
            // Liberada: tinha dependência, a anterior já foi concluída, e ainda não foi feita
            const released = !!predecessor && predecessor.isCompleted && !step.isCompleted;
            return (
              <li key={step.id} className="group relative flex gap-3 pb-4 last:pb-0">
                {i < steps.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />}

                <button
                  type="button"
                  onClick={() => toggle(step)}
                  title={step.isCompleted ? 'Reabrir etapa' : 'Concluir etapa'}
                  className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
                    step.isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : late
                        ? 'bg-white border-rose-400 text-rose-500 hover:bg-rose-50'
                        : 'bg-white border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-500'
                  }`}
                >
                  {step.isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                </button>

                <div
                  onClick={() => onTaskClick(step)}
                  className={`flex-1 min-w-0 bg-white border rounded-xl px-3.5 py-2.5 cursor-pointer hover:shadow-sm transition-shadow ${
                    late ? 'border-rose-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <p className={`flex-1 min-w-0 text-sm font-semibold ${step.isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {step.title}
                    </p>
                    {step.scheduledDate && !step.isCompleted && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); postpone(step); }}
                        title="Adiar 1 dia esta etapa e as seguintes"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 flex-shrink-0"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {step.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-wrap">{step.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]">
                    <span className={`flex items-center gap-1 font-medium ${late ? 'text-rose-600' : step.scheduledDate === today ? 'text-blue-600' : 'text-slate-500'}`}>
                      {late ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                      {step.scheduledDate ? `${late ? 'Atrasada · ' : step.scheduledDate === today ? 'Hoje · ' : ''}${formatPrettyDate(step.scheduledDate)}` : 'Sem data'}
                      {step.scheduledTime ? ` · ${step.scheduledTime}` : ''}
                    </span>
                    {member && (
                      <span className="flex items-center gap-1 font-semibold text-violet-600">
                        <Users className="w-3 h-3" /> {firstName(member.name)}
                      </span>
                    )}
                    {waiting && (
                      <span className="flex items-center gap-1 font-semibold text-amber-600" title="Libera sozinha quando a anterior for concluída">
                        <Lock className="w-3 h-3" /> Aguardando: {waiting.title.slice(0, 32)}
                      </span>
                    )}
                    {released && (
                      <span className="font-semibold text-emerald-600">Liberada</span>
                    )}
                    {released && member && hasWhatsapp(member) && (
                      <a
                        href={whatsappLink(member.phone, releasedMessage(member, step, predecessor?.title))}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                        title="Abre o WhatsApp com o aviso pronto"
                      >
                        <MessageCircle className="w-3 h-3" /> Avisar {firstName(member.name)}
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default ProjectSteps;
