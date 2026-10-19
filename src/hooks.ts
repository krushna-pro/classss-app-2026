import { useCallback, useEffect, useState } from 'react';
import { store } from './store';
import type { User } from './types';

export function useStoreSlice<T>(kind: 'users' | 'messages' | 'dms' | 'presence' | 'games' | 'poll', selector: () => T): T {
  const [value, setValue] = useState<T>(() => selector());

  useEffect(() => {
    const update = () => setValue(selector());
    update();
    return store.subscribe(kind, update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return value;
}

const HEARTBEAT_MS = 5000;
const PRESENCE_TTL = 18000;

export function usePresence(current: User | null, room: 'ghosts' | 'public' | 'anonymous' | 'games' | 'profile' | 'idle') {
  const [presence, setPresence] = useState(() => Object.values(store.getPresence()));

  useEffect(() => {
    if (!current) return;
    const beat = () => {
      store.upsertPresence({
        userId: current.id,
        fullName: current.fullName,
        avatar: current.avatar,
        bio: current.bio,
        lastSeen: Date.now(),
        inRoom: room,
      });
    };
    beat();
    const interval = window.setInterval(beat, HEARTBEAT_MS);
    const unsub = store.subscribe('presence', () => {
      setPresence(Object.values(store.getPresence()));
    });

    const onUnload = () => store.removePresence(current.id);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.clearInterval(interval);
      unsub();
      window.removeEventListener('beforeunload', onUnload);
      // do not remove presence on tab navigation in SPA; heartbeat will lapse
    };
  }, [current, room]);

  // Reap stale presence periodically
  useEffect(() => {
    const reaper = window.setInterval(() => {
      const removed = store.reapPresence(PRESENCE_TTL);
      if (removed.length > 0) setPresence(Object.values(store.getPresence()));
    }, PRESENCE_TTL);
    return () => window.clearInterval(reaper);
  }, []);

  return presence;
}

export function isOnline(recordLastSeen: number): boolean {
  return Date.now() - recordLastSeen < PRESENCE_TTL;
}

export function useToastBus() {
  const [toasts, setToasts] = useState<{ id: string; text: string; kind: 'info' | 'success' | 'warning' }[]>([]);
  const push = useCallback((text: string, kind: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}
