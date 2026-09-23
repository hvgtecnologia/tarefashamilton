import React, { useCallback, useEffect, useState } from 'react';
import {
  X, Folder, ChevronRight, HardDrive, Loader2, Check,
  File as FileIcon, Image as ImageIcon, Video as VideoIcon, Clock,
} from 'lucide-react';
import { DriveFolder, DriveFile, DriveLink } from '../types';
import { listFolders, listFiles, formatBytes } from '../lib/drive';

interface DrivePickerModalProps {
  // O que já está anexado, para marcar como escolhido e evitar repetição
  selected: DriveLink[];
  onClose: () => void;
  onPick: (link: DriveLink) => void;
}

function fileIcon(mime: string) {
  if (mime?.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (mime?.startsWith('video/')) return <VideoIcon className="w-4 h-4" />;
  return <FileIcon className="w-4 h-4" />;
}

function expiryLabel(expiresAt: string | null): { text: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { text: 'Vencido', urgent: true };
  const hours = diff / 3_600_000;
  if (hours < 24) return { text: `${Math.ceil(hours)}h`, urgent: true };
  return { text: `${Math.ceil(hours / 24)}d`, urgent: hours < 72 };
}

// Escolhe uma pasta ou um arquivo do Meu Drive para anexar numa tarefa.
// Anexar a PASTA costuma ser melhor do que o arquivo: o que você colocar nela depois
// aparece sozinho para quem já recebeu a tarefa.
const DrivePickerModal: React.FC<DrivePickerModalProps> = ({ selected, onClose, onPick }) => {
  const [path, setPath] = useState<DriveFolder[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currentFolder = path.length > 0 ? path[path.length - 1] : null;
  const currentFolderId = currentFolder?.id ?? null;
  const isPicked = (id: string) => selected.some(l => l.id === id);

  const load = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setError('');
    try {
      const [f, fl] = await Promise.all([listFolders(folderId), listFiles(folderId)]);
      setFolders(f);
      setFiles(fl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(currentFolderId); }, [currentFolderId, load]);

  const pickFolder = (folder: DriveFolder) =>
    onPick({ kind: 'folder', id: folder.id, name: folder.name, token: folder.shareToken });

  const pickFile = (file: DriveFile) =>
    onPick({ kind: 'file', id: file.id, name: file.name, token: file.shareToken });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center gap-3 flex-shrink-0">
          <HardDrive className="w-5 h-5 text-white" />
          <span className="text-white font-bold">Anexar do Meu Drive</span>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Trilha */}
        <div className="flex items-center flex-wrap gap-1 text-sm px-4 pt-3 flex-shrink-0">
          <button
            onClick={() => setPath([])}
            className={`px-2 py-1 rounded-lg font-medium ${path.length === 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Meu Drive
          </button>
          {path.map((folder, i) => (
            <React.Fragment key={folder.id}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <button
                onClick={() => setPath(path.slice(0, i + 1))}
                className={`px-2 py-1 rounded-lg font-medium truncate max-w-[140px] ${
                  i === path.length - 1 ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {folder.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Anexar a pasta em que estou */}
        {currentFolder && (
          <div className="px-4 pt-3 flex-shrink-0">
            <button
              onClick={() => pickFolder(currentFolder)}
              disabled={isPicked(currentFolder.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 text-white"
            >
              {isPicked(currentFolder.id) ? <Check className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
              {isPicked(currentFolder.id) ? 'Esta pasta já está anexada' : `Anexar a pasta "${currentFolder.name}"`}
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              Anexando a pasta, o que você colocar nela depois aparece sozinho para quem recebeu a tarefa.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-3 px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {path.length === 0
                  ? 'Seu Drive está vazio. Crie uma pasta em "Meu Drive" primeiro.'
                  : 'Esta pasta está vazia.'}
              </p>
            </div>
          ) : (
            <div className="border rounded-xl divide-y">
              {folders.map(folder => {
                const exp = expiryLabel(folder.expiresAt);
                const picked = isPicked(folder.id);
                return (
                  <div key={folder.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50">
                    <button onClick={() => setPath([...path, folder])} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate">{folder.name}</span>
                      {exp && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 flex-shrink-0 ${
                          exp.urgent ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Clock className="w-2.5 h-2.5" />{exp.text}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => pickFolder(folder)}
                      disabled={picked}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0 disabled:text-emerald-600 text-blue-600 hover:bg-blue-50 disabled:hover:bg-transparent"
                    >
                      {picked ? 'Anexada' : 'Anexar'}
                    </button>
                  </div>
                );
              })}

              {files.map(file => {
                const exp = expiryLabel(file.expiresAt);
                const picked = isPicked(file.id);
                return (
                  <div key={file.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50">
                    <span className="text-slate-400 flex-shrink-0">{fileIcon(file.mimeType)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        {formatBytes(file.sizeBytes)}
                        {exp && <span className={exp.urgent ? 'text-rose-500 font-bold' : ''}>· expira em {exp.text}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => pickFile(file)}
                      disabled={picked}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0 disabled:text-emerald-600 text-blue-600 hover:bg-blue-50 disabled:hover:bg-transparent"
                    >
                      {picked ? 'Anexado' : 'Anexar'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DrivePickerModal;
