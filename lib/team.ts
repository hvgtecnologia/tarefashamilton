import { supabase, isSupabaseConfigured, getCurrentUser } from './supabase';
import { TeamMember } from '../types';

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

// "bernardo" -> e-mail interno do membro; se já for e-mail, devolve como está
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const value = identifier.trim();
  if (value.includes('@')) return value;

  const { data, error } = await supabase.rpc('team_login_email', { p_username: value });
  if (error || !data) throw new Error('Usuário ou senha incorretos');
  return data as string;
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

export async function deleteTeamMember(memberId: string): Promise<void> {
  await callTeamFunction({ action: 'delete', member_id: memberId });
}

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
