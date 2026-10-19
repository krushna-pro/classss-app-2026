import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Users, MessageCircle, Eye, EyeOff } from 'lucide-react';
import { store } from '@/store';
import { useStoreSlice, usePresence, isOnline } from '@/hooks';
import { uid, formatTime, hashStringToIndex } from '@/utils';
import { ANON_NAMES } from '@/constants';
import type { ChatMessage, User } from '@/types';
import { Avatar, OnlineDot, EmptyState } from './ui';

function ChatList({ messages, me, anonymous }: { messages: ChatMessage[]; me: User; anonymous: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircle className="w-10 h-10" />}
        title={anonymous ? 'No anonymous messages yet' : 'No messages yet'}
        hint={anonymous ? 'Drop an anonymous thought below.' : 'Say hi to your classmates!'}
      />
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.map((m) => {
        const mine = m.userId === me.id;
        return (
          <div key={m.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''} animate-fade-in`}>
            <Avatar av={m.avatar} name={m.displayName} size={36} />
            <div className={`max-w-[78%] ${mine ? 'items-end text-right' : ''} flex flex-col`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-slate-300">
                  {anonymous ? m.displayName : m.displayName}
                </span>
                <span className="text-[10px] text-slate-500">{formatTime(m.timestamp)}</span>
              </div>
              <div
                className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                  mine ? 'bg-accent-600 text-white rounded-tr-sm' : 'bg-bg-card text-slate-100 rounded-tl-sm'
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function PresencePanel({
  presence,
  me,
  anonymous,
}: {
  presence: ReturnType<typeof usePresence>;
  me: User;
  anonymous: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...presence].sort((a, b) => {
        const ao = isOnline(a.lastSeen) ? 0 : 1;
        const bo = isOnline(b.lastSeen) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.fullName.localeCompare(b.fullName);
      }),
    [presence]
  );

  const onlineCount = presence.filter((p) => isOnline(p.lastSeen)).length;

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-l border-bg-border bg-bg-panel">
      <div className="px-4 py-3 border-b border-bg-border flex items-center gap-2">
        <Users className="w-4 h-4 text-accent-400" />
        <h3 className="text-sm font-semibold text-slate-200">
          {anonymous ? 'Anonymous Lounge' : 'In the Room'}
        </h3>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-success/15 text-success">{onlineCount} online</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {sorted.map((p) => {
          const online = isOnline(p.lastSeen);
          const anonName = ANON_NAMES[hashStringToIndex(p.userId, ANON_NAMES.length)];
          const shownName = anonymous ? anonName : p.fullName;
          return (
            <div
              key={p.userId}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${p.userId === me.id ? 'bg-accent-600/10' : 'hover:bg-bg-hover'}`}
            >
              <div className="relative">
                <Avatar av={anonymous ? { type: 'color', color: '#3b95f6' } : p.avatar} name={shownName} size={32} />
                <span className="absolute -bottom-0.5 -right-0.5">
                  <OnlineDot online={online} size={9} />
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">
                  {shownName}
                  {p.userId === me.id && <span className="ml-1 text-[10px] text-accent-400">(you)</span>}
                </p>
                {anonymous && <p className="truncate text-[10px] text-slate-500">{p.bio || 'Anonymous'}</p>}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-xs text-slate-500 px-2">Nobody here yet.</p>}
      </div>
    </aside>
  );
}

export function ChatRoom({
  me,
  kind,
  onToast,
}: {
  me: User;
  kind: 'public' | 'anonymous';
  onToast: (text: string, kind?: 'info' | 'success' | 'warning') => void;
}) {
  const anonymous = kind === 'anonymous';
  const allMsgs = useStoreSlice('messages', () => store.getMessages());
  const presence = usePresence(me, anonymous ? 'anonymous' : 'public');
  const [text, setText] = useState('');
  const [revealName, setRevealName] = useState(false);

  const messages = useMemo(
    () => allMsgs.filter((m) => m.kind === kind).slice(-200),
    [allMsgs, kind]
  );

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const anonName = ANON_NAMES[hashStringToIndex(me.id, ANON_NAMES.length)];
    const msg: ChatMessage = {
      id: uid('msg'),
      userId: me.id,
      displayName: anonymous ? anonName : me.fullName,
      avatar: anonymous ? { type: 'color', color: '#3b95f6' } : me.avatar,
      text: trimmed,
      timestamp: Date.now(),
      kind,
    };
    store.addMessage(msg);
    setText('');
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <header className="px-5 py-3 border-b border-bg-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-600/20 flex items-center justify-center">
            {anonymous ? <EyeOff className="w-5 h-5 text-accent-400" /> : <MessageCircle className="w-5 h-5 text-accent-400" />}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {anonymous ? 'Anonymous Chat Room' : 'Public Chat Room'}
            </h2>
            <p className="text-xs text-slate-500">
              {anonymous ? 'Your real name stays hidden. Be kind.' : 'Real names. Live and online.'}
            </p>
          </div>
          {anonymous && (
            <button
              onClick={() => {
                setRevealName((v) => !v);
                onToast(revealName ? 'Real names hidden again.' : 'Reminder: you are still anonymous to others.', 'info');
              }}
              className="ml-auto btn-outline text-xs"
            >
              <Eye className="w-3.5 h-3.5" /> {revealName ? 'Hide' : 'You are anonymous'}
            </button>
          )}
        </header>

        <ChatList messages={messages} me={me} anonymous={anonymous} />

        <form onSubmit={send} className="border-t border-bg-border p-3 flex gap-2 bg-bg-panel">
          <input
            className="input flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={anonymous ? 'Send an anonymous message…' : 'Type a message…'}
            maxLength={500}
          />
          <button type="submit" className="btn-primary" disabled={!text.trim()}>
            <Send className="w-4 h-4" /> Send
          </button>
        </form>
      </div>

      <PresencePanel presence={presence} me={me} anonymous={anonymous} />
    </div>
  );
}
