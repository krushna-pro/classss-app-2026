import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Gamepad2, Plus, Users, Eye, LogOut, Play, CircleStop,
  RefreshCw, Send, Sparkles, Check, AlertCircle, Crown, DoorOpen,
} from 'lucide-react';
import { store } from '@/store';
import { useStoreSlice, usePresence, isOnline } from '@/hooks';
import { uid, formatTime, pickRandom, hashStringToIndex } from '@/utils';
import { ANON_NAMES, TRUTH_PROMPTS, DARE_PROMPTS } from '@/constants';
import type { GameMode, GameRoom, GamePlayer, User, TurnPhase } from '@/types';
import { Avatar, Modal, EmptyState, Spinner } from './ui';

function displayNameFor(user: User, mode: GameMode): string {
  if (mode === 'anonymous') return ANON_NAMES[hashStringToIndex(user.id, ANON_NAMES.length)];
  return user.fullName;
}

function anonAvatar(userId: string) {
  const colors = ['#3b95f6', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#fb7185', '#22d3ee', '#84cc16'];
  return { type: 'color' as const, color: colors[hashStringToIndex(userId, colors.length)] };
}

function playerFromUser(user: User, mode: GameMode, role: 'player' | 'spectator'): GamePlayer {
  return {
    userId: user.id,
    fullName: user.fullName,
    displayName: displayNameFor(user, mode),
    avatar: mode === 'anonymous' ? anonAvatar(user.id) : user.avatar,
    role,
    joinedAt: Date.now(),
  };
}

export function GamesSection({
  me,
  onToast,
}: {
  me: User;
  onToast: (text: string, kind?: 'info' | 'success' | 'warning') => void;
}) {
  const gamesMap = useStoreSlice('games', () => store.getGames());
  const presence = usePresence(me, 'games');
  const [openCreate, setOpenCreate] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');

  const games = useMemo(() => Object.values(gamesMap).sort((a, b) => b.createdAt - a.createdAt), [gamesMap]);
  const activeRoom = activeRoomId ? gamesMap[activeRoomId] : null;

  // Clean up empty finished rooms owned by current user
  useEffect(() => {
    games.forEach((g) => {
      if (g.status === 'finished' && Object.keys(g.players).length === 0) {
        store.deleteGame(g.id);
      }
    });
  }, [games]);

  const createRoom = (name: string, mode: GameMode, invites: string[]) => {
    const room: GameRoom = {
      id: uid('room'),
      name: name.trim() || 'New Game Room',
      mode,
      hostId: me.id,
      hostName: me.fullName,
      status: 'lobby',
      createdAt: Date.now(),
      players: { [me.id]: playerFromUser(me, mode, 'player') },
      invites,
      currentTurn: null,
      turnHistory: [],
      chat: [],
    };
    store.saveGame(room);
    setActiveRoomId(room.id);
    setOpenCreate(false);
    setInviteName('');
    onToast(`Game room "${room.name}" created.`, 'success');
  };

  const joinRoom = (room: GameRoom, role: 'player' | 'spectator') => {
    if (room.players[me.id]) {
      setActiveRoomId(room.id);
      return;
    }
    const updated: GameRoom = {
      ...room,
      players: { ...room.players, [me.id]: playerFromUser(me, room.mode, role) },
    };
    store.saveGame(updated);
    setActiveRoomId(room.id);
    onToast(`${role === 'spectator' ? 'Spectating' : 'Joined'} "${room.name}".`, role === 'spectator' ? 'info' : 'success');
  };

  const leaveRoom = (room: GameRoom) => {
    const updated: GameRoom = { ...room, players: { ...room.players } };
    delete updated.players[me.id];
    if (Object.keys(updated.players).length === 0) {
      store.deleteGame(room.id);
    } else if (updated.hostId === me.id) {
      const next = Object.values(updated.players).find((p) => p.role === 'player') ?? Object.values(updated.players)[0];
      updated.hostId = next.userId;
      updated.hostName = next.fullName;
    }
    store.saveGame(updated);
    setActiveRoomId(null);
    onToast(`Left "${room.name}".`, 'info');
  };

  if (activeRoom) {
    return <GameRoomView room={activeRoom} me={me} onLeave={() => leaveRoom(activeRoom)} onToast={onToast} />;
  }

  const knownNames = presence
    .filter((p) => p.userId !== me.id && isOnline(p.lastSeen))
    .map((p) => p.fullName);

  return (
    <div className="h-full overflow-y-auto">
      <header className="px-5 py-4 border-b border-bg-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-emerald-500 flex items-center justify-center shadow-lg">
          <Gamepad2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-white">Truth &amp; Dare Games</h2>
          <p className="text-xs text-slate-500">Create a room, spin the wheel, and play with your class.</p>
        </div>
        <button onClick={() => setOpenCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Create Room
        </button>
      </header>

      <div className="p-5">
        {games.length === 0 ? (
          <EmptyState
            icon={<Gamepad2 className="w-12 h-12" />}
            title="No game rooms yet"
            hint="Create the first room and invite classmates to play."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => {
              const playerList = Object.values(g.players);
              const players = playerList.filter((p) => p.role === 'player');
              const spectators = playerList.filter((p) => p.role === 'spectator');
              const isInvited = g.invites.includes(me.fullName);
              const inRoom = !!g.players[me.id];
              return (
                <div key={g.id} className="card p-4 flex flex-col animate-fade-in hover:border-accent-500/40 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-white">{g.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Host: {g.mode === 'anonymous' ? 'Anonymous Host' : g.hostName}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        g.mode === 'anonymous' ? 'bg-violet-500/20 text-violet-300' : 'bg-accent-600/20 text-accent-300'
                      }`}
                    >
                      {g.mode === 'anonymous' ? 'ANON' : 'PUBLIC'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {players.length} playing</span>
                    <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {spectators.length} watching</span>
                    <span className={`px-1.5 py-0.5 rounded ${g.status === 'playing' ? 'bg-success/20 text-success' : 'bg-slate-600/30 text-slate-300'}`}>
                      {g.status}
                    </span>
                  </div>
                  <div className="mt-3 flex -space-x-2">
                    {players.slice(0, 5).map((p) => (
                      <Avatar key={p.userId} av={p.avatar} name={p.displayName} size={28} ring />
                    ))}
                    {players.length > 5 && (
                      <div className="w-7 h-7 rounded-full bg-bg-card border-2 border-bg-panel flex items-center justify-center text-[10px] text-slate-400">
                        +{players.length - 5}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    {inRoom ? (
                      <button onClick={() => setActiveRoomId(g.id)} className="btn-primary flex-1 text-xs">
                        <DoorOpen className="w-3.5 h-3.5" /> Enter
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => joinRoom(g, 'player')}
                          className="btn-primary flex-1 text-xs"
                          disabled={g.status === 'finished' || players.length >= 12}
                        >
                          <Plus className="w-3.5 h-3.5" /> Join
                        </button>
                        <button onClick={() => joinRoom(g, 'spectator')} className="btn-outline text-xs">
                          <Eye className="w-3.5 h-3.5" /> Watch
                        </button>
                      </>
                    )}
                  </div>
                  {!inRoom && isInvited && (
                    <p className="mt-2 text-[11px] text-accent-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> You were invited to this room.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateRoomModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreate={createRoom}
        knownNames={knownNames}
        inviteName={inviteName}
        setInviteName={setInviteName}
      />
    </div>
  );
}

function CreateRoomModal({
  open,
  onClose,
  onCreate,
  knownNames,
  inviteName,
  setInviteName,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, mode: GameMode, invites: string[]) => void;
  knownNames: string[];
  inviteName: string;
  setInviteName: (s: string) => void;
}) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<GameMode>('public');
  const [invites, setInvites] = useState<string[]>([]);

  const addInvite = () => {
    const n = inviteName.trim();
    if (n && !invites.includes(n)) setInvites((prev) => [...prev, n]);
    setInviteName('');
  };

  const suggestions = knownNames.filter((n) => !invites.includes(n) && n.toLowerCase().includes(inviteName.toLowerCase())).slice(0, 5);

  return (
    <Modal open={open} onClose={onClose} title="Create Game Room" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Room Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday Fun" maxLength={40} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('public')}
              className={`btn ${mode === 'public' ? 'bg-accent-600 text-white' : 'bg-bg-card text-slate-300'}`}
            >
              <Users className="w-4 h-4" /> Real Names
            </button>
            <button
              onClick={() => setMode('anonymous')}
              className={`btn ${mode === 'anonymous' ? 'bg-violet-600 text-white' : 'bg-bg-card text-slate-300'}`}
            >
              <Sparkles className="w-4 h-4" /> Anonymous
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            Invite Classmates (optional — leave empty to let anyone join)
          </label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addInvite();
                }
              }}
              placeholder="Type a full name…"
              list="known-names"
            />
            <datalist id="known-names">
              {suggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button onClick={addInvite} className="btn-outline"><Plus className="w-4 h-4" /></button>
          </div>
          {invites.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {invites.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 rounded-full bg-bg-card px-2.5 py-1 text-xs text-slate-300">
                  {n}
                  <button onClick={() => setInvites((p) => p.filter((x) => x !== n))} className="text-slate-500 hover:text-danger">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={() => onCreate(name, mode, invites)} className="btn-primary flex-1">
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GameRoomView({
  room,
  me,
  onLeave,
  onToast,
}: {
  room: GameRoom;
  me: User;
  onLeave: () => void;
  onToast: (text: string, kind?: 'info' | 'success' | 'warning') => void;
}) {
  const [chatText, setChatText] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const players = Object.values(room.players).filter((p) => p.role === 'player');
  const spectators = Object.values(room.players).filter((p) => p.role === 'spectator');
  const meInRoom = room.players[me.id];
  const isHost = room.hostId === me.id;
  const isSpectator = meInRoom?.role === 'spectator';
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.chat.length]);

  const currentTurn = room.currentTurn;
  const myTurn = currentTurn?.pickedUserId === me.id && currentTurn.phase !== 'done' && currentTurn.phase !== 'spinning';

  const updateRoom = (patch: Partial<GameRoom>) => {
    store.saveGame({ ...room, ...patch });
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatText.trim();
    if (!trimmed) return;
    updateRoom({
      chat: [
        ...room.chat.slice(-100),
        {
          id: uid('gmsg'),
          userId: me.id,
          displayName: meInRoom?.displayName ?? me.fullName,
          avatar: meInRoom?.avatar ?? me.avatar,
          text: trimmed,
          timestamp: Date.now(),
        },
      ],
    });
    setChatText('');
  };

  const startGame = () => {
    if (players.length < 2) {
      onToast('Need at least 2 players to start.', 'warning');
      return;
    }
    updateRoom({ status: 'playing' });
    onToast('Game started! Spin the wheel.', 'success');
  };

  const spin = () => {
    if (spinning || room.status !== 'playing' || !isHost) return;
    if (players.length < 2) {
      onToast('Need at least 2 players to spin.', 'warning');
      return;
    }
    setSpinning(true);
    setShowPrompt(false);
    updateRoom({ currentTurn: { ...emptyTurn(), pickedUserId: '', pickedDisplayName: '', pickedAvatar: me.avatar, promptText: '', promptKind: 'truth', phase: 'spinning', startedAt: Date.now() } });

    const targetIndex = Math.floor(Math.random() * players.length);
    const segAngle = 360 / players.length;
    const targetRotation = 360 * 6 + (360 - (targetIndex * segAngle + segAngle / 2)) + (Math.random() * segAngle * 0.4 - segAngle * 0.2);
    setRotation((prev) => prev + targetRotation);

    window.setTimeout(() => {
      const picked = players[targetIndex];
      setSpinning(false);
      updateRoom({
        currentTurn: {
          pickedUserId: picked.userId,
          pickedDisplayName: picked.displayName,
          pickedAvatar: picked.avatar,
          promptText: '',
          promptKind: 'truth',
          phase: 'awaiting_choice',
          startedAt: Date.now(),
        },
      });
      onToast(`${picked.displayName} was chosen!`, 'info');
    }, 4300);
  };

  const choose = (kind: 'truth' | 'dare') => {
    if (!currentTurn || currentTurn.phase !== 'awaiting_choice') return;
    const canChoose = currentTurn.pickedUserId === me.id || isHost;
    if (!canChoose) return;
    const prompt = kind === 'truth' ? pickRandom(TRUTH_PROMPTS) : pickRandom(DARE_PROMPTS);
    updateRoom({
      currentTurn: { ...currentTurn, promptKind: kind, promptText: prompt, phase: kind as TurnPhase, startedAt: Date.now() },
    });
    setShowPrompt(true);
  };

  const reroll = () => {
    if (!currentTurn) return;
    const prompt = pickRandom(currentTurn.promptKind === 'truth' ? TRUTH_PROMPTS : DARE_PROMPTS);
    updateRoom({ currentTurn: { ...currentTurn, promptText: prompt } });
  };

  const completeTurn = (note?: string) => {
    if (!currentTurn) return;
    const canComplete = currentTurn.pickedUserId === me.id || isHost;
    if (!canComplete) return;
    updateRoom({
      currentTurn: { ...currentTurn, phase: 'done', completedBy: me.id, completionNote: note },
      turnHistory: [
        ...room.turnHistory.slice(-50),
        {
          text: `${currentTurn.pickedDisplayName} — ${currentTurn.promptKind.toUpperCase()}: ${currentTurn.promptText}`,
          by: me.id,
          at: Date.now(),
        },
      ],
    });
    setShowPrompt(false);
    onToast('Turn complete! Spin again for the next player.', 'success');
  };

  const endGame = () => {
    updateRoom({ status: 'finished', currentTurn: null });
    onToast('Game ended.', 'info');
  };

  return (
    <div className="h-full flex flex-col">
      <header className="px-5 py-3 border-b border-bg-border flex items-center gap-3">
        <button onClick={onLeave} className="btn-ghost text-xs"><LogOut className="w-4 h-4" /> Leave</button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{room.name}</h2>
          <p className="text-xs text-slate-500">
            Host: {room.mode === 'anonymous' ? 'Anonymous' : room.hostName} · {room.status}
          </p>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ${
            room.mode === 'anonymous' ? 'bg-violet-500/20 text-violet-300' : 'bg-accent-600/20 text-accent-300'
          }`}
        >
          {room.mode === 'anonymous' ? 'ANONYMOUS' : 'PUBLIC'}
        </span>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_280px] overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col items-center">
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                <Crown className="w-4 h-4 text-warning" />
                {room.status === 'lobby' ? 'Waiting to start…' : room.status === 'finished' ? 'Game finished.' : 'Spin to pick a player'}
              </div>
              <Spinner size={240} rotation={rotation} spinning={spinning} />
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {players.map((p, i) => (
                  <div key={p.userId} className="flex items-center gap-2 rounded-full bg-bg-card px-3 py-1.5">
                    <span className="text-xs text-slate-500">#{i + 1}</span>
                    <Avatar av={p.avatar} name={p.displayName} size={24} />
                    <span className="text-xs font-medium text-slate-200">{p.displayName}</span>
                    {currentTurn?.pickedUserId === p.userId && currentTurn.phase !== 'done' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning">PICKED</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {room.status === 'lobby' && isHost && (
                  <button onClick={startGame} className="btn-primary"><Play className="w-4 h-4" /> Start Game</button>
                )}
                {room.status === 'playing' && isHost && !spinning && (
                  <button onClick={spin} className="btn-primary"><RefreshCw className="w-4 h-4" /> Spin Wheel</button>
                )}
                {room.status === 'playing' && isHost && (
                  <button onClick={endGame} className="btn-outline"><CircleStop className="w-4 h-4" /> End Game</button>
                )}
                {isSpectator && (
                  <span className="text-xs text-slate-500 flex items-center gap-1"><Eye className="w-4 h-4" /> Spectator mode — watch and chat.</span>
                )}
              </div>

              {currentTurn && currentTurn.phase !== 'spinning' && currentTurn.phase !== 'idle' && (
                <div className="mt-6 w-full max-w-md card p-4 animate-scale-in">
                  <div className="flex items-center gap-3">
                    <Avatar av={currentTurn.pickedAvatar} name={currentTurn.pickedDisplayName} size={40} ring />
                    <div>
                      <p className="text-sm font-semibold text-white">{currentTurn.pickedDisplayName}</p>
                      <p className="text-xs text-slate-500">
                        {currentTurn.phase === 'awaiting_choice' ? 'Choose Truth or Dare' : `${currentTurn.promptKind.toUpperCase()} drawn`}
                      </p>
                    </div>
                  </div>

                  {currentTurn.phase === 'awaiting_choice' && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => choose('truth')}
                        className="btn bg-accent-600/90 text-white hover:bg-accent-500"
                        disabled={!isHost && currentTurn.pickedUserId !== me.id}
                      >
                        <Check className="w-4 h-4" /> Truth
                      </button>
                      <button
                        onClick={() => choose('dare')}
                        className="btn bg-rose-600/90 text-white hover:bg-rose-500"
                        disabled={!isHost && currentTurn.pickedUserId !== me.id}
                      >
                        <Sparkles className="w-4 h-4" /> Dare
                      </button>
                    </div>
                  )}

                  {(currentTurn.phase === 'truth' || currentTurn.phase === 'dare') && (
                    <div className="mt-4">
                      <div
                        className={`rounded-lg p-3 text-sm leading-relaxed ${
                          currentTurn.promptKind === 'truth' ? 'bg-accent-600/15 text-accent-100' : 'bg-rose-600/15 text-rose-100'
                        }`}
                      >
                        {currentTurn.promptText}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={reroll} className="btn-outline text-xs" disabled={!isHost && currentTurn.pickedUserId !== me.id}>
                          <RefreshCw className="w-3.5 h-3.5" /> New Card
                        </button>
                        <button
                          onClick={() => completeTurn('done')}
                          className="btn-primary text-xs"
                          disabled={!isHost && currentTurn.pickedUserId !== me.id}
                        >
                          <Check className="w-3.5 h-3.5" /> Mark Done
                        </button>
                      </div>
                    </div>
                  )}

                  {currentTurn.phase === 'done' && (
                    <p className="mt-3 text-sm text-success flex items-center gap-1">
                      <Check className="w-4 h-4" /> Turn completed — spin again!
                    </p>
                  )}
                </div>
              )}

              {room.turnHistory.length > 0 && (
                <div className="mt-8 w-full max-w-md">
                  <h4 className="text-xs font-semibold text-slate-400 mb-2">Recent turns</h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {room.turnHistory.slice(-6).reverse().map((h, i) => (
                      <div key={i} className="text-xs text-slate-400 rounded-lg bg-bg-card px-3 py-2">
                        <span className="text-slate-500">{formatTime(h.at)}</span> · {h.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={sendChat} className="border-t border-bg-border p-3 flex gap-2 bg-bg-panel">
            <input
              className="input flex-1"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Game chat…"
              maxLength={300}
            />
            <button type="submit" className="btn-primary" disabled={!chatText.trim()}><Send className="w-4 h-4" /></button>
          </form>
        </div>

        <aside className="hidden lg:flex flex-col border-l border-bg-border bg-bg-panel overflow-hidden">
          <div className="px-4 py-3 border-b border-bg-border">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Users className="w-4 h-4 text-accent-400" /> Players</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {players.map((p) => (
              <div key={p.userId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${p.userId === me.id ? 'bg-accent-600/10' : 'hover:bg-bg-hover'}`}>
                <Avatar av={p.avatar} name={p.displayName} size={28} />
                <span className="text-sm text-slate-200 truncate">{p.displayName}</span>
                {p.userId === room.hostId && <Crown className="w-3.5 h-3.5 text-warning ml-auto" />}
              </div>
            ))}
            {spectators.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-wide text-slate-500 mt-3 px-2">Spectators</p>
                {spectators.map((p) => (
                  <div key={p.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-hover">
                    <Avatar av={p.avatar} name={p.displayName} size={24} />
                    <span className="text-xs text-slate-400 truncate">{p.displayName}</span>
                    <Eye className="w-3 h-3 text-slate-500 ml-auto" />
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="border-t border-bg-border p-3 max-h-44 overflow-hidden flex flex-col">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Live chat</p>
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {room.chat.slice(-30).map((c) => (
                <div key={c.id} className="text-xs">
                  <span className="text-slate-500">{formatTime(c.timestamp)} </span>
                  <span className="text-slate-300 font-medium">{c.displayName}: </span>
                  <span className="text-slate-400">{c.text}</span>
                </div>
              ))}
              {room.chat.length === 0 && <p className="text-xs text-slate-600">No chat yet.</p>}
              <div ref={chatEnd} />
            </div>
          </div>
        </aside>
      </div>

      <Modal open={showPrompt && myTurn} onClose={() => setShowPrompt(false)} title="Your turn!">
        {currentTurn && (currentTurn.phase === 'truth' || currentTurn.phase === 'dare') && (
          <div>
            <div className={`rounded-lg p-4 text-base leading-relaxed ${currentTurn.promptKind === 'truth' ? 'bg-accent-600/20 text-accent-100' : 'bg-rose-600/20 text-rose-100'}`}>
              {currentTurn.promptText}
            </div>
            <p className="mt-3 text-xs text-slate-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> Be safe and have fun. Mark done when you've answered.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={reroll} className="btn-outline flex-1"><RefreshCw className="w-4 h-4" /> New Card</button>
              <button onClick={() => completeTurn('done')} className="btn-primary flex-1"><Check className="w-4 h-4" /> Done</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function emptyTurn() {
  return {
    pickedUserId: '',
    pickedDisplayName: '',
    pickedAvatar: { type: 'color' as const, color: '#3b95f6' },
    promptText: '',
    promptKind: 'truth' as const,
    phase: 'idle' as TurnPhase,
    startedAt: 0,
  };
}
