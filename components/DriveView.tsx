import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  HardDrive, Folder, FolderPlus, Upload, ChevronRight, Trash2, Link2, Clock,
  File as FileIcon, Image as ImageIcon, Video as VideoIcon, Check, X, Loader2
} from 'lucide-react';
import { DriveFolder, DriveFile } from '../types';
import {
  listFolders, listFiles, createFolder, deleteFolder, uploadDriveFile,
  deleteDriveFile, updateFileExpiry, updateFolderExpiry, getShareUrl, getOwnerFileUrl,
  getDriveUsage, formatBytes, EXPIRY_OPTIONS, FOLDER_EXPIRY_OPTIONS, DEFAULT_FOLDER_EXPIRY_HOURS
} from '../lib/drive';

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (mime.startsWith('video/')) return <VideoIcon className="w-4 h-4" />;
  return <FileIcon className="w-4 h-4" />;
}

function expiryLabel(expiresAt: string | null): { text: string; urgent: boolean } {
  if (!expiresAt) return { text: 'Sem validade', urgent: false };
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return { text: 'Vencido', urgent: true };
  const hours = diffMs / (60 * 60 * 1000);
  if (hours < 1) return { text: `Expira em ${Math.ceil(diffMs / 60000)} min`, urgent: true };
  if (hours < 24) return { text: `Expira em ${Math.ceil(hours)}h`, urgent: hours < 6 };
  return { text: `Expira em ${Math.ceil(hours / 24)} dias`, urgent: false };
}

const DriveView: React.FC = () => {
  const [path, setPath] = useState<DriveFolder[]>([]); // trilha até a pasta atual (vazio = raiz)
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [pendingExpiryHours, setPendingExpiryHours] = useState<number | null>(24);
  const [newFolderExpiryHours, setNewFolderExpiryHours] = useState<number | null>(DEFAULT_FOLDER_EXPIRY_HOURS);
  const [usage, setUsage] = useState<{ files: number; bytes: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingExpiryId, setEditingExpiryId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFolderId = path.length > 0 ? path[path.length - 1].id : null;

  const reload = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setError('');
    try {
      const [f, fl, u] = await Promise.all([listFolders(folderId), listFiles(folderId), getDriveUsage()]);
      setFolders(f);
      setFiles(fl);
      setUsage(u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(currentFolderId); }, [currentFolderId, reload]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createFolder(name, currentFolderId, newFolderExpiryHours);
      setNewFolderName('');
      setNewFolderExpiryHours(DEFAULT_FOLDER_EXPIRY_HOURS);
      setIsAddingFolder(false);
      reload(currentFolderId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDeleteFolder = async (folder: DriveFolder) => {
    if (!confirm(`Excluir a pasta "${folder.name}" e tudo dentro dela?\n\nOs links já compartilhados dela param de funcionar na hora.`)) return;
    try {
      await deleteFolder(folder.id);
      reload(currentFolderId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(fileList)) {
        await uploadDriveFile(file, currentFolderId, pendingExpiryHours);
      }
      setNotice(fileList.length === 1 ? 'Arquivo enviado.' : `${fileList.length} arquivos enviados.`);
      reload(currentFolderId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (file: DriveFile) => {
    if (!confirm(`Excluir "${file.name}"? O link público para de funcionar na hora.`)) return;
    try {
      await deleteDriveFile(file);
      reload(currentFolderId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleCopyLink = async (id: string, shareToken: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(shareToken));
      setCopiedId(id);
      setNotice('Link copiado. Quem receber consegue ver e baixar, sem login.');
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setError('Não foi possível copiar o link. Copie manualmente pela URL.');
    }
  };

  const handleOpenFile = async (file: DriveFile) => {
    try {
      window.open(await getOwnerFileUrl(file), '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleChangeFolderExpiry = async (folder: DriveFolder, hours: number | null) => {
    try {
      await updateFolderExpiry(folder.id, hours);
      setEditingExpiryId(null);
      reload(currentFolderId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleChangeExpiry = async (file: DriveFile, hours: number | null) => {
    try {
      await updateFileExpiry(file.id, hours);
      setEditingExpiryId(null);
      reload(currentFolderId);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <HardDrive className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-slate-800">Meu Drive</h1>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
        <p className="text-sm text-slate-500">
          Pastas e arquivos com link para compartilhar e prazo de validade. O link da pasta dá acesso a tudo que está dentro dela.
        </p>
        {usage && (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {usage.files} arquivo{usage.files === 1 ? '' : 's'} · {formatBytes(usage.bytes)} no drive
          </span>
        )}
      </div>

      {/* Trilha de pastas */}
      <div className="flex items-center flex-wrap gap-1 text-sm mb-4">
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
              className={`px-2 py-1 rounded-lg font-medium truncate max-w-[160px] ${
                i === path.length - 1 ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {folder.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button
          onClick={() => setIsAddingFolder(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border rounded-lg hover:bg-slate-50"
        >
          <FolderPlus className="w-4 h-4" /> Nova pasta
        </button>

        <select
          value={pendingExpiryHours === null ? 'none' : pendingExpiryHours}
          onChange={(e) => setPendingExpiryHours(e.target.value === 'none' ? null : Number(e.target.value))}
          className="px-2 py-2 text-sm border rounded-lg bg-white text-slate-600"
          title="Validade dos próximos arquivos enviados"
        >
          {EXPIRY_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.hours === null ? 'none' : opt.hours}>
              Enviar com validade: {opt.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Enviando...' : 'Enviar arquivos'}
        </button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleFilesSelected(e.target.files)} />
      </div>

      {isAddingFolder && (
        <div className="flex items-center gap-2 mb-4 bg-white border rounded-lg p-2">
          <input
            autoFocus
            type="text"
            placeholder="Nome da pasta"
            className="flex-1 px-2 py-1.5 text-sm outline-none"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
          <select
            value={newFolderExpiryHours === null ? 'none' : newFolderExpiryHours}
            onChange={(e) => setNewFolderExpiryHours(e.target.value === 'none' ? null : Number(e.target.value))}
            className="px-2 py-1.5 text-xs border rounded bg-white text-slate-600"
            title="Depois desse prazo a pasta e tudo dentro dela são apagados"
          >
            {FOLDER_EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.hours === null ? 'none' : opt.hours}>
                Validade: {opt.label}
              </option>
            ))}
          </select>
          <button onClick={handleCreateFolder} className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700">
            Criar
          </button>
          <button onClick={() => { setIsAddingFolder(false); setNewFolderName(''); }} className="px-2 py-1.5 text-xs text-slate-500">
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : folders.length === 0 && files.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <HardDrive className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nada por aqui ainda. Crie uma pasta ou envie um arquivo.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {folders.map((folder) => {
            const fExpiry = expiryLabel(folder.expiresAt);
            return (
              <div key={folder.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <button onClick={() => setPath([...path, folder])} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700 truncate">{folder.name}</span>
                </button>

                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setEditingExpiryId(editingExpiryId === folder.id ? null : folder.id)}
                    className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                      fExpiry.urgent ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'
                    }`}
                    title="Depois desse prazo a pasta e tudo dentro dela são apagados"
                  >
                    <Clock className="w-3 h-3" /> {fExpiry.text}
                  </button>
                  {editingExpiryId === folder.id && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white border rounded-lg shadow-lg py-1 w-40">
                      {FOLDER_EXPIRY_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => handleChangeFolderExpiry(folder, opt.hours)}
                          className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleCopyLink(folder.id, folder.shareToken)}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg flex-shrink-0"
                  title="Copiar link da pasta (dá acesso a tudo que está dentro)"
                >
                  {copiedId === folder.id ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copiedId === folder.id ? 'Copiado' : 'Link'}
                </button>

                <button
                  onClick={() => handleDeleteFolder(folder)}
                  className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded transition-all flex-shrink-0"
                  title="Excluir pasta"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            );
          })}

          {files.map((file) => {
            const expiry = expiryLabel(file.expiresAt);
            return (
              <div key={file.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="text-slate-400 flex-shrink-0">{fileIcon(file.mimeType)}</div>
                <button onClick={() => handleOpenFile(file)} className="flex-1 min-w-0 text-left" title="Abrir arquivo">
                  <p className="text-sm font-medium text-slate-700 truncate hover:text-blue-600">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(file.sizeBytes)}</p>
                </button>

                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setEditingExpiryId(editingExpiryId === file.id ? null : file.id)}
                    className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${
                      expiry.urgent ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'
                    }`}
                    title="Alterar validade"
                  >
                    <Clock className="w-3 h-3" /> {expiry.text}
                  </button>
                  {editingExpiryId === file.id && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white border rounded-lg shadow-lg py-1 w-40">
                      {EXPIRY_OPTIONS.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => handleChangeExpiry(file, opt.hours)}
                          className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleCopyLink(file.id, file.shareToken)}
                  className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg flex-shrink-0"
                  title="Copiar link público"
                >
                  {copiedId === file.id ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copiedId === file.id ? 'Copiado' : 'Link'}
                </button>

                <button
                  onClick={() => handleDeleteFile(file)}
                  className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded transition-all flex-shrink-0"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {notice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white text-sm px-4 py-3 rounded-xl shadow-lg">
          {notice}
        </div>
      )}
    </div>
  );
};

export default DriveView;
