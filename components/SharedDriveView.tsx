import React, { useEffect, useState } from 'react';
import { HardDrive, Download, Folder, FileText, Image as ImageIcon, Video as VideoIcon, Clock, Loader2, Link2Off } from 'lucide-react';
import { fetchSharedDrive, formatBytes, SharedDrivePayload } from '../lib/drive';

interface SharedDriveViewProps {
  token: string;
}

function fileIcon(mime: string) {
  if (mime?.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (mime?.startsWith('video/')) return <VideoIcon className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function expiryText(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const hours = diff / 3_600_000;
  if (hours < 1) return `Este link expira em ${Math.ceil(diff / 60000)} minutos.`;
  if (hours < 24) return `Este link expira em ${Math.ceil(hours)} horas.`;
  return `Este link expira em ${Math.ceil(hours / 24)} dias.`;
}

// Página pública de um link do Meu Drive. Sem login.
// Mora no domínio do app de propósito: o Supabase força text/plain em HTML vindo de Edge Function
// (proteção antiphishing do domínio deles), então a página não renderizaria de lá. A função
// continua sendo a autoridade: é ela que confere a validade e emite os links de download.
const SharedDriveView: React.FC<SharedDriveViewProps> = ({ token }) => {
  const [data, setData] = useState<SharedDrivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchSharedDrive(token)
      .then((payload) => { if (alive) setData(payload); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full max-w-xl p-7">{children}</div>
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <div className="text-center py-4">
          <Link2Off className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-slate-800 mb-1">Esse link não está mais disponível</h1>
          <p className="text-sm text-slate-500">{error || 'Ele expirou ou o conteúdo foi removido.'}</p>
        </div>
      </Shell>
    );
  }

  // ---------- Arquivo único ----------
  if (data.file) {
    const isImage = data.mime_type?.startsWith('image/');
    const isVideo = data.mime_type?.startsWith('video/');
    const previewUrl = data.inline_url || data.url;
    return (
      <Shell>
        <div className="text-center">
          {isImage && <img src={previewUrl} alt={data.file} className="max-w-full rounded-xl mb-5 mx-auto" />}
          {isVideo && <video src={previewUrl} controls className="max-w-full rounded-xl mb-5 mx-auto" />}
          {!isImage && !isVideo && <FileText className="w-14 h-14 text-slate-300 mx-auto mb-4" />}

          <h1 className="text-lg font-bold text-slate-800 break-words">{data.file}</h1>
          <p className="text-sm text-slate-500 mt-1 mb-5">{formatBytes(data.size_bytes || 0)}</p>

          <a
            href={data.url}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl"
          >
            <Download className="w-4 h-4" />
            Baixar arquivo
          </a>
          {expiryText(data.expires_at) && <p className="text-xs text-slate-400 mt-4">{expiryText(data.expires_at)}</p>}
        </div>
      </Shell>
    );
  }

  // ---------- Pasta ----------
  const files = data.files || [];
  const totalBytes = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0);

  const groups = new Map<string, typeof files>();
  for (const f of files) {
    const key = f.subfolder || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  return (
    <Shell>
      <div className="flex items-center gap-3 mb-1">
        <Folder className="w-6 h-6 text-amber-500 flex-shrink-0" />
        <h1 className="text-lg font-bold text-slate-800 break-words">{data.folder}</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        {files.length === 0
          ? 'Esta pasta está vazia.'
          : `${files.length} arquivo${files.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
      </p>

      {[...groups.entries()].map(([subfolder, list]) => (
        <div key={subfolder || '__root'} className="mb-4">
          {subfolder && (
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{subfolder}</h2>
          )}
          <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {list.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="text-slate-400 flex-shrink-0">{fileIcon(f.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 break-words">{f.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(f.size_bytes || 0)}</p>
                </div>
                <a href={f.url} className="text-sm font-bold text-blue-600 hover:text-blue-700 whitespace-nowrap flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" />
                  Baixar
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {expiryText(data.expires_at) && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-4">
          <Clock className="w-3 h-3" />
          {expiryText(data.expires_at)}
        </p>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-slate-300 mt-6 pt-4 border-t border-slate-100">
        <HardDrive className="w-3 h-3" />
        Compartilhado pelo Hamilton Planner
      </div>
    </Shell>
  );
};

export default SharedDriveView;
