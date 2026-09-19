import React, { createContext, useContext } from 'react';
import { TeamMember } from '../types';

interface TeamContextValue {
  members: TeamMember[];
}

const TeamContext = createContext<TeamContextValue>({ members: [] });

export const TeamProvider = TeamContext.Provider;

export function useTeam() {
  const { members } = useContext(TeamContext);
  const findMember = (userId?: string | null) => (userId ? members.find(m => m.userId === userId) : undefined);
  return { members, findMember };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
