import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HardDrive, Download, Folder, FileText, Image as ImageIcon, Video as VideoIcon,
  Clock, Loader2, Link2Off, Play, AlertTriangle, X, Copy, Check,
} from 'lucide-react';
import { fetchSharedDrive, formatBytes, refreshDelayMs, SharedDrivePayload, SharedDriveFileEntry } from '../lib/drive';

interface SharedDriveViewProps {
  token: string;
}

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm w-full max-w-xl p-7">{children}</div>
  </div>
);

function fileIcon(mime: string) {
  if (mime?.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (mime?.startsWith('video/')) return <VideoIcon className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

// Nota de texto: o conteúdo vem embutido no payload, então aparece na hora e o visitante copia num
// clique — que é a razão de existir da nota.
const TextNote: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência (comum dentro de app de mensagem).
      setFailed(true);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar texto'}
        </button>
      </div>
      <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[55vh] overflow-y-auto font-mono">
        {content}
      </pre>
      {failed && (
        <p className="text-[11px] text-amber-600 mt-2">
          Seu navegador não deixou copiar automaticamente. Selecione o texto acima e copie na mão.
        </p>
      )}
    </div>
  );
};

const isVideo = (mime?: string | null) => !!mime && mime.startsWith('video/');
const isAudio = (mime?: string | null) => !!mime && mime.startsWith('audio/');
const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/');

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
  const timerRef = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const payload = await fetchSharedDrive(token);
    setData(payload);
    return payload;
  }, [token]);

  // Os links de download são assinados e têm hora para morrer. Quem recebe costuma deixar a página
  // aberta e só clicar depois — e aí o link já tinha vencido, o que parecia "link quebrado".
  // Então renovamos sozinhos antes de vencer, enquanto a página estiver aberta.
  useEffect(() => {
    let alive = true;

    const schedule = (ttlSeconds?: number) => {
      timerRef.current = window.setTimeout(async () => {
        if (!alive) return;
        try {
          const fresh = await load();
          if (alive) schedule(fresh.ttl_seconds);
        } catch {
          // Renovação falhou (rede caiu, ou a pasta venceu de verdade). Os links atuais continuam
          // valendo até a hora deles; não vale derrubar a página que já está na tela.
          if (alive) schedule(600);
        }
      }, refreshDelayMs(ttlSeconds));
    };

    load()
      .then((payload) => { if (alive) schedule(payload.ttl_seconds); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });

    return () => {
      alive = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [load]);

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

  return <SharedDriveBody data={data} />;
};

// Corpo da página, separado da busca de propósito: assim dá para testar o que aparece na tela
// sem depender de rede nem de efeito rodando.
export const SharedDriveBody: React.FC<{ data: SharedDrivePayload }> = ({ data }) => {
  const [playing, setPlaying] = useState<SharedDriveFileEntry | null>(null);

  // ---------- Arquivo único ----------
  if (data.file) {
    const previewUrl = data.inline_url || data.url;

    // Nota de texto ganha a página inteira: ler e copiar é tudo que ela precisa.
    if (data.text_content != null) {
      return (
        <Shell>
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <h1 className="text-lg font-bold text-slate-800 break-words flex-1 min-w-0">{data.file}</h1>
          </div>
          <TextNote content={data.text_content} />
          <div className="flex items-center justify-between gap-3 mt-4">
            <a href={data.url} className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar como arquivo
            </a>
            {expiryText(data.expires_at) && <p className="text-xs text-slate-400">{expiryText(data.expires_at)}</p>}
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <div className="text-center">
          {isImage(data.mime_type) && (
            <img src={previewUrl} alt={data.file} className="max-w-full rounded-xl mb-5 mx-auto" />
          )}
          {isVideo(data.mime_type) && (
            // preload="none" de propósito: tráfego do Supabase é cota, e abrir a página não deveria
            // baixar o vídeo inteiro de quem só queria o arquivo.
            <video src={previewUrl} controls preload="none" playsInline className="w-full rounded-xl mb-5 bg-black" />
          )}
          {isAudio(data.mime_type) && <audio src={previewUrl} controls preload="none" className="w-full mb-5" />}
          {!isImage(data.mime_type) && !isVideo(data.mime_type) && !isAudio(data.mime_type) && (
            <FileText className="w-14 h-14 text-slate-300 mx-auto mb-4" />
          )}

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

  const groups = new Map<string, SharedDriveFileEntry[]>();
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

                {f.text_content != null && (
                  <button
                    onClick={() => setPlaying(f)}
                    className="text-sm font-bold text-slate-600 hover:text-slate-900 whitespace-nowrap flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Ver texto
                  </button>
                )}

                {f.inline_url && (isVideo(f.mime_type) || isAudio(f.mime_type)) && (
                  <button
                    onClick={() => setPlaying(f)}
                    className="text-sm font-bold text-slate-600 hover:text-slate-900 whitespace-nowrap flex items-center gap-1"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Assistir
                  </button>
                )}

                {f.url ? (
                  <a href={f.url} className="text-sm font-bold text-blue-600 hover:text-blue-700 whitespace-nowrap flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" />
                    Baixar
                  </a>
                ) : (
                  <span className="text-xs font-bold text-amber-600 whitespace-nowrap flex items-center gap-1" title="O arquivo está na pasta mas não pôde ser aberto agora. Recarregue a página.">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Indisponível
                  </span>
                )}
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

      {playing && (playing.text_content != null || playing.inline_url) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80" onClick={() => setPlaying(null)} />
          <div className="relative w-full max-w-3xl">
            <div className="flex items-center gap-3 mb-2">
              <p className="text-sm font-semibold text-white truncate flex-1">{playing.name}</p>
              <a href={playing.url || undefined} className="text-xs font-bold text-white/80 hover:text-white flex items-center gap-1 flex-shrink-0">
                <Download className="w-3.5 h-3.5" /> Baixar
              </a>
              <button onClick={() => setPlaying(null)} className="text-white/70 hover:text-white flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            {playing.text_content != null ? (
              <div className="bg-white rounded-xl p-4">
                <TextNote content={playing.text_content} />
              </div>
            ) : isAudio(playing.mime_type) ? (
              <audio src={playing.inline_url!} controls autoPlay className="w-full" />
            ) : (
              <video src={playing.inline_url!} controls autoPlay playsInline className="w-full rounded-xl bg-black max-h-[75vh]" />
            )}
          </div>
        </div>
      )}
    </Shell>
  );
};

export default SharedDriveView;
