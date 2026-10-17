import React, { createContext, useContext } from 'react';
import { TeamMember, ProjectMember } from '../types';

interface TeamContextValue {
  members: TeamMember[];
  // 'master' = dono; 'manager' = membro que administra projetos (tela completa, dados limitados)
  role?: 'master' | 'manager';
  // Quem está em cada projeto
  projectMembers?: ProjectMember[];
  // Projetos que o usuário logado administra (só faz sentido para 'manager'; o master administra todos)
  adminProjectIds?: string[];
}

const TeamContext = createContext<TeamContextValue>({ members: [] });

export const TeamProvider = TeamContext.Provider;

export function useTeam() {
  const { members, role = 'master', projectMembers = [], adminProjectIds = [] } = useContext(TeamContext);
  const findMember = (userId?: string | null) => (userId ? members.find(m => m.userId === userId) : undefined);
  // O master administra todos os projetos; o administrador, só os dele
  const canAdminProject = (projectId: string) => role === 'master' || adminProjectIds.includes(projectId);
  return { members, findMember, role, projectMembers, adminProjectIds, canAdminProject };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
