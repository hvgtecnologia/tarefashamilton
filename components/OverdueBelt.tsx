import React, { useMemo } from 'react';
import { Task } from '../types';
import { overdueShare, BeltLevel } from '../lib/health';

const COLORS: Record<BeltLevel, { bar: string; text: string; label: string }> = {
  none: { bar: 'bg-slate-300', text: 'text-slate-400', label: 'Sem tarefas abertas' },
  ok: { bar: 'bg-emerald-400', text: 'text-emerald-600', label: 'Em dia' },
  warn: { bar: 'bg-amber-400', text: 'text-amber-600', label: 'Atenção' },
  bad: { bar: 'bg-rose-400', text: 'text-rose-600', label: 'Muita coisa atrasada' },
};

// Faixa fina no topo: a parte colorida é a porcentagem das suas tarefas abertas que está atrasada.
// Quanto menor, melhor. Serve só para acompanhar a produtividade; não pede nada de você.
const OverdueBelt: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const share = useMemo(() => overdueShare(tasks), [tasks]);
  const c = COLORS[share.level];
  const detail = share.level === 'none'
    ? 'Nenhuma tarefa aberta'
    : `${share.overdue} de ${share.open} tarefas abertas estão atrasadas`;

  return (
    <div className="flex-shrink-0 bg-white" title={`${detail}. Backlog não conta.`}>
      <div className="h-1 bg-slate-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share.pct} aria-label="Porcentagem de tarefas atrasadas">
        <div className={`h-full ${c.bar} transition-all duration-700 ease-out`} style={{ width: `${share.level === 'none' ? 0 : Math.max(share.pct, share.overdue > 0 ? 2 : 0)}%` }} />
      </div>
      <p className={`text-[10px] font-medium px-3 md:px-5 pt-0.5 text-right ${c.text}`}>
        {share.level === 'none' ? c.label : `${share.pct}% atrasadas · ${c.label}`}
      </p>
    </div>
  );
};

export default OverdueBelt;
