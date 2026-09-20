import React, { useState } from 'react';
import { X, KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { changeOwnPassword } from '../lib/team';

interface ChangePasswordModalProps {
  onClose: () => void;
}

const inputClass =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/30';

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 6) return setError('A nova senha deve ter pelo menos 6 caracteres.');
    if (next !== confirmation) return setError('A confirmação não bate com a nova senha.');
    if (next === current) return setError('A nova senha precisa ser diferente da atual.');

    setError('');
    setSaving(true);
    try {
      await changeOwnPassword(current, next);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível trocar a senha. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 flex items-center gap-3">
          <KeyRound className="w-5 h-5 text-white" />
          <span className="text-white font-bold">Alterar minha senha</span>
          <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <div>
              <p className="font-bold text-slate-800">Senha alterada!</p>
              <p className="text-sm text-slate-500 mt-1">
                Use a nova senha na próxima vez que entrar. Outros aparelhos onde você estava logado foram desconectados.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-2.5 rounded-lg"
            >
              Fechar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Senha atual</label>
              <input
                type={type}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nova senha</label>
              <input
                type={type}
                value={next}
                onChange={e => setNext(e.target.value)}
                autoComplete="new-password"
                required
                className={inputClass}
              />
              <p className="text-[10px] text-slate-400 mt-1">Mínimo de 6 caracteres.</p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Repita a nova senha</label>
              <input
                type={type}
                value={confirmation}
                onChange={e => setConfirmation(e.target.value)}
                autoComplete="new-password"
                required
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={() => setShow(v => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
            >
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {show ? 'Ocultar senhas' : 'Mostrar senhas'}
            </button>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 rounded-lg text-xs">{error}</div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar nova senha'}
            </button>

            <p className="text-[11px] text-slate-400 text-center">
              Esqueceu a senha atual? Peça ao Hamilton para redefinir.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;
