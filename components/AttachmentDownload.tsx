import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { TaskAttachment } from '../types';
import { downloadAttachment, downloadAllAttachments } from '../lib/download';

// Botão redondo que aparece ao passar o mouse sobre o anexo. Quem usa precisa de "relative group"
// no cartão do anexo.
export const AttachmentDownloadButton: React.FC<{ attachment: TaskAttachment; className?: string }> = ({
  attachment, className = 'top-1 left-1',
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (e: React.MouseEvent) => {
    // O cartão em volta costuma ser um link que abre o arquivo; aqui só queremos baixar.
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError('');
    try {
      await downloadAttachment(attachment);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title={error || `Baixar "${attachment.name}"`}
        className={`absolute ${className} z-10 bg-white/95 p-1.5 rounded-full shadow-sm border border-slate-200 text-slate-600 transition-opacity hover:bg-blue-600 hover:text-white hover:border-blue-600 ${
          busy || error ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        } ${error ? 'text-rose-600 border-rose-300' : ''}`}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </button>
    </>
  );
};

export const DownloadAllButton: React.FC<{ attachments: TaskAttachment[]; zipName?: string }> = ({
  attachments, zipName,
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (attachments.length === 0) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadAllAttachments(attachments, zipName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-rose-600 max-w-[260px] truncate" title={error}>{error}</span>}
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-60"
        title={attachments.length > 1 ? 'Baixa todos de uma vez, num arquivo .zip' : 'Baixar o anexo'}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {busy ? 'Baixando...' : attachments.length > 1 ? `Baixar tudo (${attachments.length})` : 'Baixar'}
      </button>
    </div>
  );
};
