import { supabase, isSupabaseConfigured, getCurrentUser } from './supabase';
import { Task, TeamMember } from '../types';
import { formatPrettyDate } from '../constants';

// Domínio interno dos logins de equipe. ".invalid" é reservado (RFC 6761): nunca existe de verdade,
// então nenhum e-mail sai daqui e ninguém consegue "recuperar senha" de um membro por fora.
// Quem redefine senha é o gestor, dentro do app.
export const TEAM_EMAIL_DOMAIN = 'equipe.invalid';

export interface TeamContextData {
  role: 'master' | 'member';
  members: TeamMember[];
  membership?: { name: string; username: string; masterId: string };
  // false quando a migração V5 ainda não foi aplicada no banco
  ready: boolean;
}

const rowToMember = (row: any): TeamMember => ({
  id: row.id,
  userId: row.member_user_id,
  name: row.name,
  username: row.username,
  phone: row.phone || undefined,
  createdAt: row.created_at,
});

// Descobre se o usuário logado é gestor ou membro, e (para o gestor) lista a equipe.
// Uma única consulta: a policy devolve as linhas em que sou gestor OU a minha própria linha de membro.
export async function loadTeamContext(): Promise<TeamContextData> {
  if (!isSupabaseConfigured()) return { role: 'master', members: [], ready: false };

  const user = await getCurrentUser();
  if (!user) return { role: 'master', members: [], ready: false };

  const { data, error } = await supabase.from('team_members').select('*').order('name', { ascending: true });
  if (error) {
    // Tabela ainda não existe (migração V5 pendente): app segue funcionando como antes
    return { role: 'master', members: [], ready: false };
  }

  const own = (data || []).find(r => r.member_user_id === user.id);
  if (own) {
    return {
      role: 'member',
      members: [],
      membership: { name: own.name, username: own.username, masterId: own.master_id },
      ready: true,
    };
  }

  return { role: 'master', members: (data || []).filter(r => r.master_id === user.id).map(rowToMember), ready: true };
}

// "bernardo" -> bernardo@equipe.invalid; se já for e-mail (gestor), devolve como está
export function resolveLoginEmail(identifier: string): string {
  const value = identifier.trim();
  if (value.includes('@')) return value;
  return `${value.toLowerCase()}@${TEAM_EMAIL_DOMAIN}`;
}

async function callTeamFunction(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('manage-team', { body });
  if (error) {
    let message = error.message;
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        const detail = parsed?.error || parsed?.message;
        if (detail) message = detail;
      } catch { /* mantém a mensagem genérica */ }
    }
    if (/Failed to send a request|not found|404/i.test(message)) {
      message = 'A função de equipe ainda não foi publicada no Supabase (manage-team).';
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createTeamMember(input: { name: string; username: string; password: string }): Promise<TeamMember> {
  const data = await callTeamFunction({ action: 'create', ...input });
  return rowToMember(data.member);
}

export async function resetTeamMemberPassword(memberId: string, password: string): Promise<void> {
  await callTeamFunction({ action: 'reset_password', member_id: memberId, password });
}

// O próprio membro troca a senha. Confirma a senha atual entrando de novo (protege contra celular
// desbloqueado na mão de outra pessoa e deixa a sessão "recente", que o Supabase exige) e, depois de
// trocar, derruba as outras sessões abertas em outros aparelhos.
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user?.email) throw new Error('Sessão inválida. Entre novamente.');

  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verifyError) throw new Error('A senha atual está incorreta.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    if (/different|same/i.test(error.message)) throw new Error('A nova senha precisa ser diferente da atual.');
    if (/at least|weak|characters/i.test(error.message)) throw new Error('A nova senha é muito fraca. Use pelo menos 6 caracteres.');
    throw new Error('Não foi possível trocar a senha. Tente novamente.');
  }

  await supabase.auth.signOut({ scope: 'others' }).catch(() => { /* não bloqueia a troca */ });
}

export async function deleteTeamMember(memberId: string): Promise<void> {
  await callTeamFunction({ action: 'delete', member_id: memberId });
}

export async function updateTeamMember(memberId: string, input: { name: string; phone: string }): Promise<TeamMember> {
  const data = await callTeamFunction({ action: 'update', member_id: memberId, ...input });
  return rowToMember(data.member);
}

// ==================== WhatsApp ====================

// Aceita "(31) 98765-4321", "31987654321", "+55 31 98765-4321" -> "5531987654321"
export function normalizePhone(raw?: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function hasWhatsapp(member?: TeamMember): boolean {
  return normalizePhone(member?.phone).length >= 12;
}

export function whatsappLink(phone: string | undefined, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

const appUrl = () => (typeof window !== 'undefined' ? window.location.origin : '');

export function accessMessage(member: { name: string; username: string }, password: string): string {
  return [
    `Oi ${firstName(member.name)}! Criei seu acesso ao nosso planner de tarefas.`,
    '',
    `Site: ${appUrl()}`,
    `Usuário: ${member.username}`,
    `Senha: ${password}`,
    '',
    'É só entrar que suas tarefas aparecem lá.',
  ].join('\n');
}

export function newTaskMessage(member: TeamMember, task: { title: string; scheduledDate?: string; scheduledTime?: string; notes?: string }): string {
  const when = task.scheduledDate
    ? `Para: ${formatPrettyDate(task.scheduledDate)}${task.scheduledTime ? ` às ${task.scheduledTime}` : ''}`
    : '';
  return [
    `Oi ${firstName(member.name)}, nova tarefa pra você:`,
    '',
    task.title,
    when,
    task.notes ? `\n${task.notes}` : '',
    '',
    `Detalhes e conclusão em: ${appUrl()}`,
  ].filter(Boolean).join('\n');
}

export function reminderMessage(member: TeamMember, tasks: Task[]): string {
  const lines = tasks.slice(0, 10).map(t => {
    const due = t.scheduledDate || t.dueDate;
    return `- ${t.title}${due ? ` (era ${formatPrettyDate(due)})` : ''}`;
  });
  return [
    `Oi ${firstName(member.name)}, tudo bem?`,
    tasks.length === 1 ? 'Essa tarefa está atrasada:' : `Essas ${tasks.length} tarefas estão atrasadas:`,
    '',
    ...lines,
    '',
    `Consegue me dar um retorno? ${appUrl()}`,
  ].join('\n');
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// Sugere um usuário a partir do nome: "João Silva" -> "joao.silva"
export function suggestUsername(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30);
}

export function generatePassword(length = 8): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
