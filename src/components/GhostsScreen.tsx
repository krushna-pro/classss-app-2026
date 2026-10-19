import { useEffect, useMemo, useRef, useState } from 'react';
import { Ghost, Send, X, ArrowLeft, Sparkles, Tv } from 'lucide-react';
import { store, conversationKey } from '@/store';
import { useStoreSlice, usePresence, isOnline } from '@/hooks';
import { uid, formatTime, hashStringToIndex } from '@/utils';
import { ANON_NAMES } from '@/constants';
import type { DM, PollRoom, PresenceRecord, RoomPoll, Tab, User } from '@/types';
import { Avatar, EmptyState } from './ui';

const GHOST_AURAS = [
  '#a78bfa', '#38bdf8', '#34d399', '#fb7185', '#fbbf24',
  '#e879f9', '#84cc16', '#22d3ee', '#f97316', '#60a5fa',
];

export function GhostsScreen({
  me,
  onToast,
  onNavigate,
}: {
  me: User;
  onToast: (text: string, kind?: 'info' | 'success' | 'warning') => void;
  onNavigate: (tab: Tab) => void;
}) {
  const presence = usePresence(me, 'ghosts');
  const allDMs = useStoreSlice('dms', () => store.getDMs());
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const roomPoll = useStoreSlice<RoomPoll | null>('poll', () => store.getRoomPoll());

  const online = useMemo(
    () => presence.filter((p) => p.userId !== me.id && isOnline(p.lastSeen)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [presence, me.id]
  );

  const myConversations = useMemo(() => allDMs.filter((d) => d.from === me.id || d.to === me.id), [allDMs, me.id]);
  const unreadByPeer = useMemo(() => {
    const map: Record<string, number> = {};
    myConversations.forEach((d) => {
      if (d.to === me.id) {
        map[d.from] = (map[d.from] ?? 0) + 1;
      }
    });
    return map;
  }, [myConversations, me.id]);

  // Auto-open most recent unread DM's peer once
  useEffect(() => {
    if (activePeerId) return;
    const latest = myConversations.filter((d) => d.to === me.id).slice(-1)[0];
    if (latest) setActivePeerId(latest.from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myConversations.length]);

  const peer = activePeerId ? presence.find((p) => p.userId === activePeerId) : null;

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-bg-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Ghost className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-white">Ghost Arena</h2>
            <p className="text-xs text-slate-500">{online.length} classmates wandering the void — tap one to whisper privately.</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-success/15 text-success">{online.length} online</span>
        </header>

        <GhostArena
          me={me}
          ghosts={online}
          unreadByPeer={unreadByPeer}
          roomPoll={roomPoll}
          onPick={(id, name) => {
            setActivePeerId(id);
            onToast(`Opening chat with ${name}`, 'info');
          }}
          onPropose={(room: PollRoom) => {
            store.saveRoomPoll({
              id: uid('poll'),
              room,
              hostId: me.id,
              hostName: me.fullName,
              createdAt: Date.now(),
              votes: { [me.id]: 'accept' },
            });
            onToast('Room poll started for everyone online.', 'success');
          }}
          onVote={(vote: 'accept' | 'reject') => {
            if (!roomPoll) return;
            store.saveRoomPoll({ ...roomPoll, votes: { ...roomPoll.votes, [me.id]: vote } });
            if (vote === 'accept') onNavigate(roomPoll.room);
          }}
        />
      </div>

      {peer && (
        <DMPanel
          me={me}
          peerId={peer.userId}
          peerName={peer.fullName}
          peerAvatar={peer.avatar}
          onClose={() => setActivePeerId(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

interface ArenaGhost {
  p: PresenceRecord;
  anonName: string;
  aura: string;
  // initial placement
  x: number; // percentage 0-100
  y: number;
  size: number;
  // drift vector (percent per second)
  vx: number;
  vy: number;
  // bob phase
  bobAmp: number;
  bobSpeed: number;
  phase: number;
}

function GhostArena({
  me,
  ghosts,
  unreadByPeer,
  roomPoll,
  onPick,
  onPropose,
  onVote,
}: {
  me: User;
  ghosts: PresenceRecord[];
  unreadByPeer: Record<string, number>;
  roomPoll: RoomPoll | null;
  onPick: (id: string, name: string) => void;
  onPropose: (room: PollRoom) => void;
  onVote: (vote: 'accept' | 'reject') => void;
}) {
  const arenaRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  // Stable per-ghost state
  const ghostStateRef = useRef<Map<string, ArenaGhost>>(new Map());


  // Sync ghost state with presence list
  useEffect(() => {
    const map = ghostStateRef.current;
    const seen = new Set<string>();
    ghosts.forEach((p, i) => {
      seen.add(p.userId);
      if (!map.has(p.userId)) {
        const seedNum = hashStringToIndex(p.userId, 100000);
        const angle = (seedNum % 360) * (Math.PI / 180);
        const speed = 1.2 + (seedNum % 100) / 100; // 1.2 - 2.2
        map.set(p.userId, {
          p,
          anonName: ANON_NAMES[hashStringToIndex(p.userId, ANON_NAMES.length)],
          aura: GHOST_AURAS[hashStringToIndex(p.userId, GHOST_AURAS.length)],
          x: 10 + (seedNum % 80),
          y: 12 + ((seedNum * 7) % 76),
          size: 64 + (seedNum % 24),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          bobAmp: 3 + (seedNum % 5),
          bobSpeed: 0.001 + (seedNum % 50) / 10000,
          phase: (seedNum % 628) / 100,
        });
      } else {
        const g = map.get(p.userId)!;
        g.p = p;
      }
    });
    // remove ghosts that went offline
    Array.from(map.keys()).forEach((id) => {
      if (!seen.has(id)) map.delete(id);
    });
  }, [ghosts]);

  // Animation loop
  useEffect(() => {
    const loop = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
      lastTsRef.current = ts;
      const map = ghostStateRef.current;
      const margin = 6;
      map.forEach((g) => {
        if (hoveredId === g.p.userId) return; // pause drift while hovered
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        if (g.x < margin) { g.x = margin; g.vx = Math.abs(g.vx); }
        if (g.x > 100 - margin) { g.x = 100 - margin; g.vx = -Math.abs(g.vx); }
        if (g.y < margin) { g.y = margin; g.vy = Math.abs(g.vy); }
        if (g.y > 100 - margin) { g.y = 100 - margin; g.vy = -Math.abs(g.vy); }
      });
      setTick((t) => (t + 1) % 1000000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
  }, [hoveredId]);

  if (ghosts.length === 0) {
    return (
      <div className="flex-1 overflow-hidden arena-bg">
        <div className="h-full flex items-center justify-center">
          <EmptyState
            icon={<Ghost className="w-12 h-12" />}
            title="The arena is empty"
            hint="When classmates come online, their ghosts will drift through the void."
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={arenaRef} className="flex-1 overflow-hidden arena-bg relative">
      {/* distant stars */}
      <div className="arena-stars" />
      <div className="arena-stars arena-stars-2" />
      {/* vignette */}
      <div className="absolute inset-0 pointer-events-none arena-vignette" />

      <ArenaTelevision ghosts={ghosts} roomPoll={roomPoll} onPropose={onPropose} />
      {roomPoll && roomPoll.hostId !== me.id && !roomPoll.votes[me.id] && (
        <PollInvite poll={roomPoll} onVote={onVote} />
      )}
      {roomPoll && roomPoll.votes[me.id] === 'reject' && (
        <div className="arena-poll-dismissed">You passed on this room poll.</div>
      )}

      {Array.from(ghostStateRef.current.values()).map((g) => {
        const unread = unreadByPeer[g.p.userId] ?? 0;
        const bob = Math.sin((tick * 16) * g.bobSpeed + g.phase) * g.bobAmp;
        const isHovered = hoveredId === g.p.userId;
        const scale = isHovered ? 1.12 : 1;
        return (
          <button
            key={g.p.userId}
            onClick={() => onPick(g.p.userId, g.p.fullName)}
            onMouseEnter={() => setHoveredId(g.p.userId)}
            onMouseLeave={() => setHoveredId(null)}
            className="absolute arena-ghost focus:outline-none"
            style={{
              left: `${g.x}%`,
              top: `${g.y}%`,
              transform: `translate(-50%, -50%) translateY(${bob}px) scale(${scale})`,
              transition: 'transform 0.18s ease-out',
            }}
            title={`Chat with ${g.p.fullName}`}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative" style={{ width: g.size, height: g.size }}>
                {/* aura */}
                <div
                  className="absolute inset-0 rounded-full blur-2xl opacity-60"
                  style={{ background: g.aura }}
                />
                <div
                  className="absolute inset-[-4px] rounded-full blur-md opacity-40 animate-pulse-ring"
                  style={{ background: g.aura }}
                />
                {/* ghost body */}
                <div
                  className="relative w-full h-full rounded-full flex items-center justify-center backdrop-blur-sm border"
                  style={{
                    background: `radial-gradient(circle at 50% 35%, ${g.aura}33, rgba(17,26,46,0.85) 70%)`,
                    borderColor: `${g.aura}66`,
                    boxShadow: `0 0 24px ${g.aura}55, inset 0 0 12px ${g.aura}22`,
                  }}
                >
                  <Ghost
                    className="transition-colors"
                    style={{ width: g.size * 0.5, height: g.size * 0.5, color: isHovered ? g.aura : '#e2e8f0' }}
                  />
                </div>
                {/* online dot */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success border-2"
                  style={{ borderColor: 'rgba(17,26,46,0.9)' }}
                />
                {/* unread badge */}
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {unread}
                  </span>
                )}
              </div>
              {/* floating label */}
              <div
                className={`px-2.5 py-1 rounded-lg backdrop-blur-md border transition-all duration-200 ${
                  isHovered ? 'bg-bg-card/90 border-bg-border scale-105' : 'bg-bg-panel/60 border-transparent'
                }`}
                style={{ boxShadow: isHovered ? `0 4px 20px ${g.aura}44` : 'none' }}
              >
                <p className="text-xs font-semibold text-white whitespace-nowrap max-w-[150px] truncate">{g.p.fullName}</p>
                <p className="text-[10px] text-slate-400 whitespace-nowrap max-w-[150px] truncate">"{g.anonName}"</p>
              </div>
              {isHovered && (
                <span className="text-[10px] text-slate-300 flex items-center gap-1 animate-fade-in bg-bg-card/80 px-2 py-0.5 rounded-full border border-bg-border">
                  <Sparkles className="w-3 h-3" style={{ color: g.aura }} /> Whisper
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ArenaTelevision({
  ghosts,
  roomPoll,
  onPropose,
}: {
  ghosts: PresenceRecord[];
  roomPoll: RoomPoll | null;
  onPropose: (room: PollRoom) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (ghosts.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % ghosts.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [ghosts.length]);

  const [chooserOpen, setChooserOpen] = useState(false);
  const activeName = ghosts.length > 0 ? ghosts[activeIndex % ghosts.length].fullName : 'Waiting for classmates';
  const tickerNames = ghosts.map((ghost) => ghost.fullName).join('   •   ');
  const roomLabels: Record<PollRoom, string> = { public: 'Public Chat', anonymous: 'Anonymous Chat', games: 'Truth & Dare' };

  return (
    <div className="arena-tv" aria-label="Arena arrivals screen">
      <div className="arena-tv-antenna arena-tv-antenna-left" />
      <div className="arena-tv-antenna arena-tv-antenna-right" />
      <div className="arena-tv-shell">
        <div className="arena-tv-topline">
          <span className="flex items-center gap-1.5"><Tv className="w-3.5 h-3.5" /> ARENA BROADCAST</span>
          <span className="arena-tv-live"><i /> LIVE</span>
        </div>
        <div className="arena-tv-screen">
          <div className="arena-tv-scanlines" />
          <div className="arena-tv-content">
            <span className="arena-tv-kicker">NOW FLOATING IN</span>
            <strong key={activeName} className="arena-tv-name">{activeName}</strong>
            <span className="arena-tv-count">{ghosts.length} / 33 online</span>
          </div>
        </div>
        <div className="arena-tv-ticker"><span>{tickerNames || 'No classmates online yet'}</span></div>
        <button className="arena-tv-poll-button" onClick={() => setChooserOpen((open) => !open)}>
          {roomPoll ? `POLL LIVE · ${roomLabels[roomPoll.room]}` : 'START A ROOM POLL'}
        </button>
        {chooserOpen && !roomPoll && (
          <div className="arena-tv-chooser">
            <span>Invite everyone to</span>
            {(Object.entries(roomLabels) as [PollRoom, string][]).map(([room, label]) => (
              <button key={room} onClick={() => { onPropose(room); setChooserOpen(false); }}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PollInvite({ poll, onVote }: { poll: RoomPoll; onVote: (vote: 'accept' | 'reject') => void }) {
  const labels: Record<PollRoom, string> = { public: 'Public Chat', anonymous: 'Anonymous Chat', games: 'Truth & Dare' };
  return (
    <div className="arena-poll-invite animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="arena-poll-icon"><Tv className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-300">Room poll from {poll.hostName}</p>
          <p className="mt-1 text-sm font-semibold text-white">Join {labels[poll.room]}?</p>
          <p className="mt-1 text-[11px] text-slate-400">Accept to move there automatically, or reject to stay in the arena.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-xs" onClick={() => onVote('accept')}>Accept & enter</button>
        <button className="btn btn-outline text-xs" onClick={() => onVote('reject')}>Reject</button>
      </div>
    </div>
  );
}

function DMPanel({
  me,
  peerId,
  peerName,
  peerAvatar,
  onClose,
  onToast,
}: {
  me: User;
  peerId: string;
  peerName: string;
  peerAvatar: import('@/types').AvatarConfig;
  onClose: () => void;
  onToast: (text: string, kind?: 'info' | 'success' | 'warning') => void;
}) {
  const key = conversationKey(me.id, peerId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const convo = useStoreSlice('dms', () => store.getConversation(me.id, peerId));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convo.length]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const dm: DM = {
      id: uid('dm'),
      conversation: key,
      from: me.id,
      to: peerId,
      fromName: me.fullName,
      toName: peerName,
      fromAvatar: me.avatar,
      text: trimmed,
      timestamp: Date.now(),
    };
    store.addDM(dm);
    setText('');
    onToast(`Message sent to ${peerName}`, 'success');
  };

  return (
    <aside className="w-full max-w-sm flex flex-col border-l border-bg-border bg-bg-panel animate-slide-in">
      <header className="px-4 py-3 border-b border-bg-border flex items-center gap-3">
        <button onClick={onClose} className="btn-ghost p-1.5" title="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar av={peerAvatar} name={peerName} size={36} ring />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{peerName}</p>
          <p className="text-[11px] text-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> online · private chat
          </p>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5" title="Close">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {convo.length === 0 ? (
          <EmptyState
            icon={<Ghost className="w-8 h-8" />}
            title="Say hello to start the private chat"
            hint="Only you and this classmate can see these messages."
          />
        ) : (
          convo.map((d) => {
            const mine = d.from === me.id;
            return (
              <div key={d.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                      mine ? 'bg-violet-600 text-white rounded-tr-sm' : 'bg-bg-card text-slate-100 rounded-tl-sm'
                    }`}
                  >
                    {d.text}
                  </div>
                  <span className="mt-0.5 text-[10px] text-slate-500">{formatTime(d.timestamp)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="border-t border-bg-border p-3 flex gap-2">
        <input
          className="input flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Message ${peerName}…`}
          maxLength={400}
        />
        <button type="submit" className="btn bg-violet-600 text-white hover:bg-violet-500" disabled={!text.trim()}>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}
