
export enum Urgency {
  CRITICAL = 'P0',
  HIGH = 'P1',
  MEDIUM = 'P2',
  LOW = 'P3'
}

export type DayOfWeek = 'inbox' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type NativeTaskStatus = 'backlog' | 'todo' | 'doing' | 'blocked' | 'done';
// TaskStatus aceita os nativos OU um id UUID de status customizado
export type TaskStatus = NativeTaskStatus | string;

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface TaskAttachment {
  id: string;
  url: string;
  name: string;
  type: 'image' | 'pdf' | 'other';
  size?: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  urgency: Urgency;
  status: TaskStatus;
  category: string;
  projectId?: string;
  dayOfWeek: DayOfWeek;
  scheduledDate?: string;
  scheduledTime?: string;
  dueDate?: string;
  position: number;
  notes: string;
  checklist: ChecklistItem[];
  recurrence: Recurrence;
  isCompleted: boolean;
  completedAt?: string;
  deletedAt?: string;
  attachments: TaskAttachment[];
  // Equipe: responsável (id do usuário do membro; null limpa a delegação), quem concluiu e retorno do membro
  assignedTo?: string | null;
  completedBy?: string;
  completedByName?: string;
  completionSeen?: boolean;
  memberNotes?: string;
  nextSpawned?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  username: string;
  phone?: string;
  createdAt?: string;
}

export type View = 'today' | 'dashboard' | 'week' | 'calendar' | 'project' | 'team' | 'drive';

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  shareToken: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface DriveFile {
  id: string;
  folderId: string | null;
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  shareToken: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface AppState {
  tasks: Task[];
  categories: Category[];
  projects: Project[];
  filters: {
    urgency: Urgency | null;
    category: string | null;
    projectId: string | null;
    search: string;
  };
  showCompleted: boolean;
}
