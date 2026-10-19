export type Tab = 'ghosts' | 'public' | 'anonymous' | 'games' | 'profile';
export type PollRoom = Exclude<Tab, 'ghosts' | 'profile'>;

export interface RoomPoll {
  id: string;
  room: PollRoom;
  hostId: string;
  hostName: string;
  createdAt: number;
  votes: Record<string, 'accept' | 'reject'>;
}

export interface User {
  id: string;
  fullName: string;
  /** 10-digit Indian mobile number (no country code). Only set on the signed-in user. */
  phone?: string;
  /** Only kept in local-only mode; the backend verifies passwords server-side. */
  password?: string;
  createdAt: number;
  avatar: AvatarConfig;
  bio: string;
}

export interface AvatarConfig {
  type: 'preset' | 'color';
  preset?: string;
  color?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  avatar: AvatarConfig;
  text: string;
  timestamp: number;
  kind: 'public' | 'anonymous';
}

export interface PresenceRecord {
  userId: string;
  fullName: string;
  avatar: AvatarConfig;
  bio: string;
  lastSeen: number;
  inRoom: 'ghosts' | 'public' | 'anonymous' | 'games' | 'profile' | 'idle';
}

export type GameMode = 'public' | 'anonymous';
export type GameStatus = 'lobby' | 'playing' | 'finished';
export type PlayerRole = 'player' | 'spectator';
export type TurnPhase = 'idle' | 'spinning' | 'awaiting_choice' | 'truth' | 'dare' | 'done';

export interface GamePlayer {
  userId: string;
  fullName: string;
  displayName: string;
  avatar: AvatarConfig;
  role: PlayerRole;
  joinedAt: number;
}

export interface GameTurn {
  pickedUserId: string;
  pickedDisplayName: string;
  pickedAvatar: AvatarConfig;
  promptText: string;
  promptKind: 'truth' | 'dare';
  phase: TurnPhase;
  startedAt: number;
  completedBy?: string;
  completionNote?: string;
}

export interface GameRoom {
  id: string;
  name: string;
  mode: GameMode;
  hostId: string;
  hostName: string;
  status: GameStatus;
  createdAt: number;
  players: Record<string, GamePlayer>;
  invites: string[];
  currentTurn: GameTurn | null;
  turnHistory: { text: string; by: string; at: number }[];
  chat: { id: string; userId: string; displayName: string; avatar: AvatarConfig; text: string; timestamp: number }[];
}

export interface DM {
  id: string;
  // Stable conversation key (sorted userIds joined by ':')
  conversation: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  fromAvatar: AvatarConfig;
  text: string;
  timestamp: number;
}

export interface ToastMessage {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'warning';
}
