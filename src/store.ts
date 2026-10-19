// Real-time store.
//
// Reads/writes always go through a local cache (localStorage) so the component
// API stays synchronous. When Supabase is configured the store additionally:
//   - hydrates the cache from Postgres on boot,
//   - subscribes to postgres_changes and mirrors every change into the cache,
//   - writes every local mutation through to Postgres.
// Without Supabase it behaves exactly like the original local-only store.

import { supabase } from './supabase';
import type {
  AvatarConfig,
  ChatMessage,
  DM,
  GameRoom,
  PresenceRecord,
  RoomPoll,
  User,
} from './types';

type ChangeKind = 'users' | 'messages' | 'dms' | 'presence' | 'games' | 'poll';
type Listener = () => void;

const KEYS = {
  users: 'ccp:users',
  messages: 'ccp:messages',
  dms: 'ccp:dms',
  presence: 'ccp:presence',
  games: 'ccp:games',
  poll: 'ccp:poll',
  session: 'ccp:session',
  me: 'ccp:me',
} as const;

const CHANNEL = 'ccp-channel';

const MAX_MESSAGES = 500;
const MAX_DMS = 1000;

// ---------------------------------------------------------------------------
// Row <-> app model mapping
// ---------------------------------------------------------------------------

interface ProfileRow {
  user_id: string;
  display_name: string;
  avatar: AvatarConfig;
  bio: string | null;
  created_at: string;
}
interface MessageRow {
  id: string;
  user_id: string;
  display_name: string;
  avatar: AvatarConfig;
  text: string;
  kind: 'public' | 'anonymous';
  created_at: string;
}
interface DmRow {
  id: string;
  conversation: string;
  from_id: string;
  to_id: string;
  from_name: string;
  to_name: string;
  from_avatar: AvatarConfig;
  text: string;
  created_at: string;
}
interface PresenceRow {
  user_id: string;
  display_name: string;
  avatar: AvatarConfig;
  bio: string | null;
  in_room: PresenceRecord['inRoom'];
  last_seen: string;
}
interface DocumentRow {
  id: string;
  data: unknown;
}

const ts = (v: string | number) => (typeof v === 'number' ? v : Date.parse(v));

const toUser = (r: ProfileRow): User => ({
  id: r.user_id,
  fullName: r.display_name,
  avatar: r.avatar,
  bio: r.bio ?? '',
  createdAt: ts(r.created_at),
});

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  userId: r.user_id,
  displayName: r.display_name,
  avatar: r.avatar,
  text: r.text,
  kind: r.kind,
  timestamp: ts(r.created_at),
});

const toDM = (r: DmRow): DM => ({
  id: r.id,
  conversation: r.conversation,
  from: r.from_id,
  to: r.to_id,
  fromName: r.from_name,
  toName: r.to_name,
  fromAvatar: r.from_avatar,
  text: r.text,
  timestamp: ts(r.created_at),
});

const toPresence = (r: PresenceRow): PresenceRecord => ({
  userId: r.user_id,
  fullName: r.display_name,
  avatar: r.avatar,
  bio: r.bio ?? '',
  inRoom: r.in_room,
  lastSeen: ts(r.last_seen),
});

function fail(where: string, error: { message: string } | null) {
  if (error) console.error(`[sync] ${where}: ${error.message}`);
}

class Store {
  private channel: BroadcastChannel | null = null;
  private listeners: Record<ChangeKind, Set<Listener>> = {
    users: new Set(),
    messages: new Set(),
    dms: new Set(),
    presence: new Set(),
    games: new Set(),
    poll: new Set(),
  };
  private externalChange = new Set<ChangeKind>();
  private connected = false;

  constructor() {
    try {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e) => {
        const kind = e.data as ChangeKind;
        if (kind && this.listeners[kind]) {
          this.externalChange.add(kind);
          this.emit(kind);
        }
      };
    } catch {
      this.channel = null;
    }
    // Fallback: storage event for cross-tab when BroadcastChannel is unavailable
    window.addEventListener('storage', (e) => {
      if (!e.key) return;
      if (e.key === KEYS.users) this.crossEmit('users');
      else if (e.key === KEYS.messages) this.crossEmit('messages');
      else if (e.key === KEYS.presence) this.crossEmit('presence');
      else if (e.key === KEYS.dms) this.crossEmit('dms');
      else if (e.key === KEYS.games) this.crossEmit('games');
      else if (e.key === KEYS.poll) this.crossEmit('poll');
    });
  }

  private crossEmit(kind: ChangeKind) {
    this.externalChange.add(kind);
    this.emit(kind);
  }

  private emit(kind: ChangeKind) {
    this.listeners[kind].forEach((l) => l());
  }

  private broadcast(kind: ChangeKind) {
    if (this.channel) {
      try {
        this.channel.postMessage(kind);
      } catch {
        /* ignore */
      }
    }
  }

  subscribe(kind: ChangeKind, listener: Listener): () => void {
    this.listeners[kind].add(listener);
    return () => this.listeners[kind].delete(listener);
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private write<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  private remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  // ---- Backend connection ------------------------------------------------

  /** Hydrate from Postgres and start mirroring changes. Safe to call more than once. */
  connect() {
    if (!supabase || this.connected) return;
    this.connected = true;
    void this.hydrate();
    this.subscribeRemote();
  }

  private async hydrate() {
    if (!supabase) return;
    const [profiles, messages, dms, presence, games, polls] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(MAX_MESSAGES),
      supabase.from('dms').select('*').order('created_at', { ascending: true }).limit(MAX_DMS),
      supabase.from('presence').select('*'),
      supabase.from('game_rooms').select('*'),
      supabase.from('room_polls').select('*'),
    ]);

    fail('load profiles', profiles.error);
    fail('load messages', messages.error);
    fail('load dms', dms.error);
    fail('load presence', presence.error);
    fail('load game_rooms', games.error);
    fail('load room_polls', polls.error);

    if (profiles.data) this.write(KEYS.users, (profiles.data as ProfileRow[]).map(toUser));
    if (messages.data) this.write(KEYS.messages, (messages.data as MessageRow[]).map(toMessage));
    if (dms.data) this.write(KEYS.dms, (dms.data as DmRow[]).map(toDM));
    if (presence.data) {
      const map: Record<string, PresenceRecord> = {};
      (presence.data as PresenceRow[]).forEach((r) => (map[r.user_id] = toPresence(r)));
      this.write(KEYS.presence, map);
    }
    if (games.data) {
      const map: Record<string, GameRoom> = {};
      (games.data as DocumentRow[]).forEach((r) => (map[r.id] = r.data as GameRoom));
      this.write(KEYS.games, map);
    }
    if (polls.data) {
      const rows = (polls.data as DocumentRow[]).map((r) => r.data as RoomPoll);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      if (rows[0]) this.write(KEYS.poll, rows[0]);
    }

    (['users', 'messages', 'dms', 'presence', 'games', 'poll'] as ChangeKind[]).forEach((k) =>
      this.emit(k)
    );
  }

  private subscribeRemote() {
    if (!supabase) return;
    const client = supabase;
    const on = (
      table: string,
      handler: (eventType: string, row: Record<string, unknown>) => void
    ) => {
      client
        .channel(`${CHANNEL}:${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          (payload: { eventType: string; new: unknown; old: unknown }) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<
              string,
              unknown
            >;
            if (row) handler(payload.eventType, row);
          }
        )
        .subscribe();
    };

    on('profiles', (evt, row) => this.remoteProfile(evt, row as unknown as ProfileRow));
    on('messages', (evt, row) => this.remoteMessage(evt, row as unknown as MessageRow));
    on('dms', (evt, row) => this.remoteDm(evt, row as unknown as DmRow));
    on('presence', (evt, row) => this.remotePresence(evt, row as unknown as PresenceRow));
    on('game_rooms', (evt, row) => this.remoteGame(evt, row as unknown as DocumentRow));
    on('room_polls', (evt, row) => this.remotePoll(evt, row as unknown as DocumentRow));
  }

  private remoteProfile(evt: string, row: ProfileRow) {
    if (evt === 'DELETE') return;
    const users = this.getUsers();
    const next = toUser(row);
    const idx = users.findIndex((u) => u.id === next.id);
    if (idx >= 0) users[idx] = { ...users[idx], ...next };
    else users.push(next);
    this.write(KEYS.users, users);
    this.emit('users');
  }

  private remoteMessage(evt: string, row: MessageRow) {
    const all = this.getMessages();
    if (evt === 'DELETE') {
      this.write(KEYS.messages, all.filter((m) => m.id !== row.id));
    } else {
      const next = toMessage(row);
      const idx = all.findIndex((m) => m.id === next.id);
      if (idx >= 0) all[idx] = next;
      else all.push(next);
      this.write(KEYS.messages, all.slice(-MAX_MESSAGES));
    }
    this.emit('messages');
  }

  private remoteDm(evt: string, row: DmRow) {
    const all = this.getDMs();
    if (evt === 'DELETE') {
      this.write(KEYS.dms, all.filter((d) => d.id !== row.id));
    } else {
      const next = toDM(row);
      const idx = all.findIndex((d) => d.id === next.id);
      if (idx >= 0) all[idx] = next;
      else all.push(next);
      this.write(KEYS.dms, all.slice(-MAX_DMS));
    }
    this.emit('dms');
  }

  private remotePresence(evt: string, row: PresenceRow) {
    const all = this.getPresence();
    if (evt === 'DELETE') delete all[row.user_id];
    else all[row.user_id] = toPresence(row);
    this.write(KEYS.presence, all);
    this.emit('presence');
  }

  private remoteGame(evt: string, row: DocumentRow) {
    const all = this.getGames();
    if (evt === 'DELETE') delete all[row.id];
    else all[row.id] = row.data as GameRoom;
    this.write(KEYS.games, all);
    this.emit('games');
  }

  private remotePoll(evt: string, row: DocumentRow) {
    if (evt === 'DELETE') this.remove(KEYS.poll);
    else this.write(KEYS.poll, row.data as RoomPoll);
    this.emit('poll');
  }

  // ---- Users ----
  getUsers(): User[] {
    return this.read<User[]>(KEYS.users, []);
  }

  saveUsers(users: User[]) {
    this.write(KEYS.users, users);
    this.broadcast('users');
    this.emit('users');
  }

  findUserByName(name: string): User | undefined {
    const target = name.trim().toLowerCase();
    return this.getUsers().find((u) => u.fullName.trim().toLowerCase() === target);
  }

  findUserByPhone(phone: string): User | undefined {
    return this.getUsers().find((u) => u.phone === phone);
  }

  addUser(user: User) {
    const users = this.getUsers();
    users.push(user);
    this.saveUsers(users);
  }

  /** Mirror a server-registered user (or the signed-in user) into the local cache. */
  cacheUser(user: User) {
    const users = this.getUsers();
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) users[idx] = { ...users[idx], ...user };
    else users.push(user);
    this.saveUsers(users);
  }

  updateUser(updated: User) {
    const users = this.getUsers().map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
    this.saveUsers(users);
    if (supabase) {
      supabase
        .from('profiles')
        .update({ display_name: updated.fullName, avatar: updated.avatar, bio: updated.bio })
        .eq('user_id', updated.id)
        .then(({ error }) => fail('profiles update', error));
    }
  }

  // ---- Session ----
  getSession(): string | null {
    try {
      return localStorage.getItem(KEYS.session);
    } catch {
      return null;
    }
  }

  setSession(userId: string | null) {
    try {
      if (userId) localStorage.setItem(KEYS.session, userId);
      else localStorage.removeItem(KEYS.session);
    } catch {
      /* ignore */
    }
  }

  /** The signed-in user, persisted so a reload keeps the session. */
  getMe(): User | null {
    return this.read<User | null>(KEYS.me, null);
  }

  setMe(user: User | null) {
    if (user) this.write(KEYS.me, user);
    else this.remove(KEYS.me);
  }

  // ---- Messages ----
  getMessages(): ChatMessage[] {
    return this.read<ChatMessage[]>(KEYS.messages, []);
  }

  getPublicMessages(): ChatMessage[] {
    return this.getMessages().filter((m) => m.kind === 'public').slice(-200);
  }

  getAnonymousMessages(): ChatMessage[] {
    return this.getMessages().filter((m) => m.kind === 'anonymous').slice(-200);
  }

  addMessage(msg: ChatMessage) {
    const all = this.getMessages();
    all.push(msg);
    // keep store bounded
    const trimmed = all.slice(-MAX_MESSAGES);
    this.write(KEYS.messages, trimmed);
    this.broadcast('messages');
    this.emit('messages');
    if (supabase) {
      supabase
        .from('messages')
        .insert({
          id: msg.id,
          user_id: msg.userId,
          display_name: msg.displayName,
          avatar: msg.avatar,
          text: msg.text,
          kind: msg.kind,
          created_at: new Date(msg.timestamp).toISOString(),
        })
        .then(({ error }) => fail('messages insert', error));
    }
  }

  // ---- DMs (private 1:1 chat) ----
  getDMs(): DM[] {
    return this.read<DM[]>(KEYS.dms, []);
  }

  getConversation(myId: string, otherId: string): DM[] {
    const key = conversationKey(myId, otherId);
    return this.getDMs().filter((d) => d.conversation === key).slice(-300);
  }

  getMyConversations(myId: string): DM[] {
    return this.getDMs().filter((d) => d.from === myId || d.to === myId);
  }

  addDM(dm: DM) {
    const all = this.getDMs();
    all.push(dm);
    const trimmed = all.slice(-MAX_DMS);
    this.write(KEYS.dms, trimmed);
    this.broadcast('dms');
    this.emit('dms');
    if (supabase) {
      supabase
        .from('dms')
        .insert({
          id: dm.id,
          conversation: dm.conversation,
          from_id: dm.from,
          to_id: dm.to,
          from_name: dm.fromName,
          to_name: dm.toName,
          from_avatar: dm.fromAvatar,
          text: dm.text,
          created_at: new Date(dm.timestamp).toISOString(),
        })
        .then(({ error }) => fail('dms insert', error));
    }
  }

  // ---- Presence ----
  getPresence(): Record<string, PresenceRecord> {
    return this.read<Record<string, PresenceRecord>>(KEYS.presence, {});
  }

  upsertPresence(rec: PresenceRecord) {
    const all = this.getPresence();
    all[rec.userId] = rec;
    this.write(KEYS.presence, all);
    this.broadcast('presence');
    this.emit('presence');
    if (supabase) {
      supabase
        .from('presence')
        .upsert({
          user_id: rec.userId,
          display_name: rec.fullName,
          avatar: rec.avatar,
          bio: rec.bio,
          in_room: rec.inRoom,
          last_seen: new Date(rec.lastSeen).toISOString(),
        })
        .then(({ error }) => fail('presence upsert', error));
    }
  }

  removePresence(userId: string) {
    const all = this.getPresence();
    delete all[userId];
    this.write(KEYS.presence, all);
    this.broadcast('presence');
    this.emit('presence');
    if (supabase) {
      supabase
        .from('presence')
        .delete()
        .eq('user_id', userId)
        .then(({ error }) => fail('presence delete', error));
    }
  }

  // Garbage-collect presence records older than the threshold
  reapPresence(maxAgeMs: number): PresenceRecord[] {
    const all = this.getPresence();
    const now = Date.now();
    const live: Record<string, PresenceRecord> = {};
    const removed: PresenceRecord[] = [];
    Object.values(all).forEach((rec) => {
      if (now - rec.lastSeen < maxAgeMs) live[rec.userId] = rec;
      else removed.push(rec);
    });
    if (removed.length > 0) {
      this.write(KEYS.presence, live);
      this.broadcast('presence');
      this.emit('presence');
      if (supabase) {
        supabase
          .from('presence')
          .delete()
          .in(
            'user_id',
            removed.map((r) => r.userId)
          )
          .then(({ error }) => fail('presence reap', error));
      }
    }
    return removed;
  }

  // ---- Room poll ----
  getRoomPoll(): RoomPoll | null {
    return this.read<RoomPoll | null>(KEYS.poll, null);
  }

  saveRoomPoll(poll: RoomPoll) {
    this.write(KEYS.poll, poll);
    this.broadcast('poll');
    this.emit('poll');
    if (supabase) {
      void (async () => {
        // Only the newest poll is kept, so clear older rows first.
        fail('room_polls clear', (await supabase.from('room_polls').delete().not('id', 'is', null)).error);
        fail('room_polls save', (await supabase.from('room_polls').insert({ id: poll.id, data: poll })).error);
      })();
    }
  }

  clearRoomPoll() {
    this.remove(KEYS.poll);
    this.broadcast('poll');
    this.emit('poll');
    if (supabase) {
      supabase
        .from('room_polls')
        .delete()
        .not('id', 'is', null)
        .then(({ error }) => fail('room_polls clear', error));
    }
  }

  // ---- Games ----
  getGames(): Record<string, GameRoom> {
    return this.read<Record<string, GameRoom>>(KEYS.games, {});
  }

  getGame(id: string): GameRoom | undefined {
    return this.getGames()[id];
  }

  saveGame(game: GameRoom) {
    const all = this.getGames();
    all[game.id] = game;
    this.write(KEYS.games, all);
    this.broadcast('games');
    this.emit('games');
    if (supabase) {
      supabase
        .from('game_rooms')
        .upsert({ id: game.id, data: game })
        .then(({ error }) => fail('game_rooms upsert', error));
    }
  }

  deleteGame(id: string) {
    const all = this.getGames();
    delete all[id];
    this.write(KEYS.games, all);
    this.broadcast('games');
    this.emit('games');
    if (supabase) {
      supabase
        .from('game_rooms')
        .delete()
        .eq('id', id)
        .then(({ error }) => fail('game_rooms delete', error));
    }
  }
}

export const store = new Store();
export { KEYS };

export function conversationKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}
