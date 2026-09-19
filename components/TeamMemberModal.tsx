import React, { useState } from 'react';
import { X, UserPlus, KeyRound, Copy, Check, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { TeamMember } from '../types';
import { suggestUsername, generatePassword } from '../lib/team';

export type TeamMemberModalMode = { kind: 'create' } | { kind: 'reset'; member: TeamMember };

interface TeamMemberModalProps {
  mode: TeamMemberModalMode;
  onClose: () => void;
  onCreate: (input: { name: string; username: string; password: string }) => Promise<TeamMember>;
  onReset: (memberId: string, password: string) => Promise<void>;
}

const TeamMemberModal: React.FC<TeamMemberModalProps> = ({ mode, onClose, onCreate, onReset }) => {
  const isCreate = mode.kind === 'create';
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!usernameTouched) setUsername(suggestUsername(value));
  };

  const validate = (): string => {
    if (isCreate) {
      if (!name.trim()) return 'Informe o nome do membro.';
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return 'O usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou underline.';
      }
    }
    if (password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setSaving(true);
    try {
      if (mode.kind === 'create') {
        const member = await onCreate({ name: name.trim(), username, password });
        setDone({ name: member.name, username: member.username, password });
      } else {
        await onReset(mode.member.id, password);
        setDone({ name: mode.member.name, username: mode.member.username, password });
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const accessText = done
    ? `Acesso ao Hamilton Planner\nEndereço: ${window.location.origin}\nUsuário: ${done.username}\nSenha: ${done.password}`
    : '';

  const copyAccess = async () => {
    try {
      await navigator.clipboard.writeText(accessText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* navegador sem permissão de área de transferência */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center gap-3">
          {isCreate ? <UserPlus className="w-5 h-5 text-white" /> : <KeyRound className="w-5 h-5 text-white" />}
          <span className="text-white font-bold">
            {isCreate ? 'Cadastrar membro da equipe' : `Nova senha para ${mode.kind === 'reset' ? mode.member.name : ''}`}
          </span>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm font-bold text-emerald-800 mb-1">
                {isCreate ? `${done.name} foi cadastrado(a)!` : 'Senha atualizada!'}
              </p>
              <p className="text-xs text-emerald-700">Envie estes dados de acesso para {done.name}:</p>
            </div>
            <pre className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap font-mono select-all">
              {accessText}
            </pre>
            <p className="text-[11px] text-slate-400">
              A senha não fica visível depois que você fechar esta janela. Se {done.name} esquecer, use "Redefinir senha".
            </p>
            <div className="flex gap-2">
              <button
                onClick={copyAccess}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition-colors ${
                  copied ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar dados de acesso'}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {isCreate && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nome</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => handleNameChange(e.target.value)}
                    placeholder="Ex: Bernardo Silva"
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Usuário (para entrar)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => { setUsername(e.target.value.toLowerCase().replace(/\s+/g, '')); setUsernameTouched(true); }}
                    placeholder="bernardo"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                {isCreate ? 'Senha' : 'Nova senha'}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoFocus={!isCreate}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    title={showPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
                  className="px-3 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-violet-600"
                  title="Gerar senha"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Mínimo de 6 caracteres. Simples de digitar no celular.</p>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs">{error}</div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Salvando...' : isCreate ? 'Cadastrar membro' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default TeamMemberModal;
