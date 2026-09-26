import React, { useEffect, useRef, useState } from 'react';
import { X, FileText, Save, Loader2, Check, Copy } from 'lucide-react';
import { DriveFile } from '../types';
import { createDriveTextFile, readDriveText, saveDriveText, renameDriveFile } from '../lib/drive';

interface DriveTextModalProps {
  // Ausente = criar uma nota nova. Presente = editar a que já existe.
  file?: DriveFile | null;
  folderId: string | null;
  expiryHours: number | null;
  onClose: () => void;
  onSaved: () => void;
}

// Nota de texto dentro do Drive: escreve a orientação aqui e ela vira um arquivo na pasta.
// Quem recebe o link lê o texto na tela e copia num clique, sem baixar nada.
const DriveTextModal: React.FC<DriveTextModalProps> = ({ file, folderId, expiryHours, onClose, onSaved }) => {
  const isEditing = !!file;
  const [name, setName] = useState(file?.name || '');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!file) {
      textareaRef.current?.focus();
      return;
    }
    let alive = true;
    readDriveText(file)
      .then((text) => { if (alive) setContent(text); })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [file]);

  const handleSave = async () => {
    if (!content.trim() && !isEditing) {
      setError('Escreva a orientação antes de salvar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (file) {
        await saveDriveText(file, content);
        if (name.trim() && name.trim() !== file.name) await renameDriveFile(file.id, name);
      } else {
        await createDriveTextFile(name, content, folderId, expiryHours);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Seu navegador não deixou copiar. Selecione o texto e copie na mão.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Orientações"
            className="flex-1 text-base font-bold text-slate-800 outline-none placeholder:text-slate-300 min-w-0"
          />
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'Escreva aqui as orientações.\n\nQuem receber o link lê este texto na tela e copia num clique.'}
              className="w-full h-72 text-sm text-slate-700 leading-relaxed outline-none resize-none font-mono placeholder:text-slate-300 placeholder:font-sans"
            />
          )}

          {error && (
            <div className="mt-3 px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">{error}</div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <p className="text-[11px] text-slate-400 flex-1">
            {isEditing
              ? 'Salvar mantém o mesmo link: quem já recebeu passa a ver o texto novo.'
              : 'Vira um arquivo .txt nesta pasta, com a mesma validade dos outros envios.'}
          </p>

          {content && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg flex-shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex-shrink-0"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriveTextModal;
