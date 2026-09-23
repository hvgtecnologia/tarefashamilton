import React from 'react';
import { Folder, FileText, ExternalLink, X } from 'lucide-react';
import { DriveLink } from '../types';
import { getShareUrl } from '../lib/drive';

interface DriveLinkChipsProps {
  links: DriveLink[];
  // Ausente = somente leitura (é o caso da tela do membro)
  onRemove?: (link: DriveLink) => void;
}

// Lista do que veio do Meu Drive numa tarefa. Abre sempre pelo link de compartilhamento,
// que é o que permite ao membro da equipe acessar sem ter o Drive do gestor.
const DriveLinkChips: React.FC<DriveLinkChipsProps> = ({ links, onRemove }) => {
  if (!links || links.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {links.map(link => (
        <div
          key={`${link.kind}-${link.id}`}
          className="group flex items-center gap-2.5 px-3 py-2 bg-blue-50/60 border border-blue-100 rounded-lg"
        >
          {link.kind === 'folder'
            ? <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
            : <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700 truncate">{link.name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">
              {link.kind === 'folder' ? 'Pasta do Drive' : 'Arquivo do Drive'}
            </p>
          </div>

          <a
            href={getShareUrl(link.token)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 flex-shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir
          </a>

          {onRemove && (
            <button
              onClick={() => onRemove(link)}
              className="p-1 text-slate-300 hover:text-rose-500 flex-shrink-0"
              title="Tirar da tarefa (não apaga do Drive)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default DriveLinkChips;
