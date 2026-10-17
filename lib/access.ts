import { supabase, isSupabaseConfigured } from './supabase';
import { ProjectMember, ProjectRole, TeamMember } from '../types';

// Quem está em cada projeto e com que papel. O master enxerga todos; o administrador, os dos projetos
// dele; o membro comum, só a própria linha (ou nada).
export async function listProjectMembers(): Promise<ProjectMember[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from('project_members').select('project_id, member_user_id, role');
  if (error) {
    // V11 ainda não rodou: o app segue funcionando sem a parte de administradores
    if (/project_members|relation|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((r: any) => ({ projectId: r.project_id, userId: r.member_user_id, role: r.role as ProjectRole }));
}

function friendly(message: string): string {
  if (/42501|permission|Sem permissão/i.test(message)) return 'Você não tem permissão para fazer isso neste projeto.';
  if (/não é da sua equipe/i.test(message)) return 'Essa pessoa não faz parte da equipe.';
  if (/project_members|function .* does not exist|schema cache/i.test(message)) {
    return 'Falta rodar o migration-v11-gestores.sql no Supabase.';
  }
  return message;
}

// Coloca a pessoa no projeto, ou muda o papel dela ('admin' | 'member')
export async function setProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<void> {
  const { error } = await supabase.rpc('set_project_member', { p_project: projectId, p_user: userId, p_role: role });
  if (error) throw new Error(friendly(error.message));
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_project_member', { p_project: projectId, p_user: userId });
  if (error) throw new Error(friendly(error.message));
}

// A equipe vista por um administrador de projeto: todos os nomes (para poder colocar no projeto), mas
// login e telefone só de quem já está nos projetos dele ou foi cadastrado por ele.
export async function listProjectTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('project_team');
  if (error) throw new Error(friendly(error.message));
  return (data || []).map((row: any): TeamMember => ({
    id: row.id,
    userId: row.member_user_id,
    name: row.name,
    username: row.username || '',
    phone: row.phone || undefined,
    createdAt: row.created_at,
  }));
}

// Papel de uma pessoa num projeto (undefined = não está nele)
export function roleIn(projectMembers: ProjectMember[], projectId: string, userId: string): ProjectRole | undefined {
  return projectMembers.find(m => m.projectId === projectId && m.userId === userId)?.role;
}

// Projetos que a pessoa administra e em que participa, para mostrar no cartão dela
export function projectsOf(projectMembers: ProjectMember[], userId: string) {
  const mine = projectMembers.filter(m => m.userId === userId);
  return {
    admin: mine.filter(m => m.role === 'admin').map(m => m.projectId),
    member: mine.filter(m => m.role === 'member').map(m => m.projectId),
  };
}
