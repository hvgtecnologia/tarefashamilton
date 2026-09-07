import React, { useState, useEffect } from 'react';
import { X, Calendar, Copy, Check, ExternalLink, Download, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { Task } from '../types';
import { downloadICalFile } from '../lib/ical';
import { getCurrentUserId } from '../lib/storage';

interface CalendarSyncModalProps {
  tasks: Task[];
  onClose: () => void;
}

export const CalendarSyncModal: React.FC<CalendarSyncModalProps> = ({ tasks, onClose }) => {
  const [userId, setUserId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getCurrentUserId().then(id => {
      if (id) setUserId(id);
    });
  }, []);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const feedUrl = userId && supabaseUrl 
    ? `${supabaseUrl}/functions/v1/calendar-feed?user_id=${userId}`
    : '';

  const handleCopy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    downloadICalFile(tasks, 'planner-semanal-agenda.ics');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      <div className="relative bg-white w-full max-w-xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <header className="p-6 border-b flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Sincronizar com Google Agenda
              </h2>
              <p className="text-xs text-slate-500">
                Seus compromissos atualizados automaticamente via Feed iCal (.ics)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/80 rounded-full text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Caixa do Link de Assinatura */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Seu Link de Assinatura (Feed iCal)
              </label>
              <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Link Único Pessoal
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={feedUrl || 'Carregando link...'}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-700 font-mono select-all focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCopy}
                disabled={!feedUrl}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-xs transition shadow-sm whitespace-nowrap ${
                  copied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copiar Link
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Passo a Passo no Google Agenda */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Como adicionar no Google Agenda (Passo a Passo)
            </h3>
            
            <ol className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-start gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <div>
                  Copie o <strong>Link de Assinatura</strong> acima.
                </div>
              </li>
              <li className="flex items-start gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <div className="flex-1">
                  Abra o <strong>Google Agenda</strong> no computador, vá na barra lateral esquerda e clique no <strong>+</strong> ao lado de <em>"Outras agendas"</em> &gt; <strong>"Do URL"</strong>.
                </div>
              </li>
              <li className="flex items-start gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <div>
                  Cole a URL e clique em <strong>"Adicionar agenda"</strong>. Seus compromissos e tarefas agendadas serão sincronizados automaticamente!
                </div>
              </li>
            </ol>

            <a
              href="https://calendar.google.com/calendar/r/settings/addbyurl"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition"
            >
              <ExternalLink className="w-4 h-4 text-blue-600" />
              Abrir tela "Do URL" no Google Agenda
            </a>
          </div>

          {/* Opção Alternativa: Download .ics */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-700">Prefere importar manualmente?</p>
              <p className="text-[11px] text-slate-500">Baixe o arquivo .ics para Apple Calendar, Outlook ou Google.</p>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition"
            >
              <Download className="w-3.5 h-3.5" /> Baixar .ics
            </button>
          </div>
        </div>

        {/* Footer */}
        <footer className="p-4 border-t bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
            O Google Agenda atualiza o feed periodicamente em segundo plano.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium text-xs transition"
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
};
