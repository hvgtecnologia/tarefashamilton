import React, { useState } from 'react';
import { Lock, User, Mail } from 'lucide-react';
import { signUp, signIn } from '../lib/supabase';
import { resolveLoginEmail } from '../lib/team';

interface LoginScreenProps {
    onLogin: () => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (isSignUp) {
                // Sign up mode
                if (password.length < 6) {
                    setError('A senha deve ter pelo menos 6 caracteres');
                    setIsLoading(false);
                    return;
                }

                if (password !== confirmPassword) {
                    setError('As senhas não coincidem');
                    setIsLoading(false);
                    return;
                }

                await signUp(email, password);
                onLogin();
            } else {
                // Sign in mode: aceita e-mail (gestor) ou usuário (membros da equipe)
                const loginEmail = resolveLoginEmail(email);
                await signIn(loginEmail, password);
                onLogin();
            }
        } catch (err: any) {
            console.error('Auth error:', err);
            if (err.message?.includes('Invalid login credentials')) {
                setError('Usuário/e-mail ou senha incorretos');
            } else if (err.message?.includes('User already registered')) {
                setError('Este email já está cadastrado. Faça login.');
            } else {
                setError(err.message || 'Erro ao fazer login. Tente novamente.');
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
                {/* Logo */}
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4">
                        <User className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900">Hamilton Planner</h1>
                    <p className="text-slate-500 text-sm mt-2">
                        {isSignUp ? 'Crie sua conta' : 'Bem-vindo de volta'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email Input */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            {isSignUp ? 'Email' : 'Email ou usuário'}
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type={isSignUp ? 'email' : 'text'}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                placeholder={isSignUp ? 'seu@email.com' : 'seu@email.com ou seu usuário'}
                                autoCapitalize="none"
                                autoCorrect="off"
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Password Input */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Senha
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                placeholder="••••••••"
                                required
                                minLength={6}
                            />
                        </div>
                    </div>

                    {/* Confirm Password (only in sign up mode) */}
                    {isSignUp && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Confirmar Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    placeholder="••••••••"
                                    required={isSignUp}
                                    minLength={6}
                                />
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                {isSignUp ? 'Criando...' : 'Entrando...'}
                            </>
                        ) : (
                            isSignUp ? 'Criar Conta' : 'Entrar'
                        )}
                    </button>

                    {/* Toggle Sign Up / Sign In */}
                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError('');
                                setConfirmPassword('');
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                            {isSignUp ? 'Já tem conta? Faça login' : 'Não tem conta? Cadastre-se'}
                        </button>
                    </div>
                </form>

                {/* Instructions */}
                {isSignUp && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-800">
                            💡 <strong>Dica:</strong> Use um email válido e uma senha de pelo menos 6 caracteres.
                            Você poderá fazer login imediatamente após o cadastro!
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
