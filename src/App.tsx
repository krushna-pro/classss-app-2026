import { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, MessageCircle, EyeOff, Gamepad2, UserCircle, LogOut, Ghost } from 'lucide-react';
import { currentUser, logout as doLogout } from '@/auth';
import { store } from '@/store';
import { useStoreSlice, useToastBus } from '@/hooks';
import { isOnline } from '@/hooks';
import { usePresence } from '@/hooks';
import type { Tab, User } from '@/types';
import { AuthScreen } from '@/components/AuthScreen';
import { ChatRoom } from '@/components/ChatRoom';
import { GamesSection } from '@/components/GamesSection';
import { ProfileScreen } from '@/components/ProfileScreen';
import { GhostsScreen } from '@/components/GhostsScreen';
import { Toasts, Avatar, OnlineDot } from '@/components/ui';

const ROOM_BACKGROUNDS: Record<Tab, string> = {
  ghosts: '/images/backgrounds/download_(2).jpg',
  public: '/images/backgrounds/Elegant_Halloween_Decor_Ideas_for_a_Polished,_Spook-Toned_Home.jpg',
  anonymous: '/images/backgrounds/21_Unfinished_Basement_Ideas.jpg',
  games: '/images/backgrounds/Elegant_Halloween_Decor_Ideas_for_a_Polished,_Spook-Toned_Home.jpg',
  profile: '/images/backgrounds/download_(2).jpg',
};

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'ghosts', label: 'Ghosts', icon: <Ghost className="w-4 h-4" /> },
  { id: 'public', label: 'Public Chat', icon: <MessageCircle className="w-4 h-4" /> },
  { id: 'anonymous', label: 'Anonymous Chat', icon: <EyeOff className="w-4 h-4" /> },
  { id: 'games', label: 'Truth & Dare', icon: <Gamepad2 className="w-4 h-4" /> },
  { id: 'profile', label: 'Profile', icon: <UserCircle className="w-4 h-4" /> },
];

function App() {
  const [user, setUser] = useState<User | null>(() => currentUser());
  const [tab, setTab] = useState<Tab>('ghosts');
  const { toasts, push, dismiss } = useToastBus();

  // Keep the local user object in sync with store updates (profile edits from this or another device)
  const users = useStoreSlice('users', () => store.getUsers());
  useEffect(() => {
    if (!user) return;
    const fresh = users.find((u) => u.id === user.id);
    if (!fresh) return;
    if (
      fresh.avatar !== user.avatar ||
      fresh.bio !== user.bio ||
      fresh.fullName !== user.fullName
    ) {
      const merged = { ...user, ...fresh, phone: fresh.phone ?? user.phone };
      store.setMe(merged);
      setUser(merged);
    }
  }, [users, user]);

  const presence = usePresence(user, user ? tab : 'idle');
  const onlineCount = useMemo(() => presence.filter((p) => isOnline(p.lastSeen)).length, [presence]);
  const dms = useStoreSlice('dms', () => store.getDMs());

  // Notify on incoming DM from another user
  const seenDmIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    dms.forEach((d) => {
      if (d.to === user.id && !seenDmIds.current.has(d.id)) {
        seenDmIds.current.add(d.id);
        if (d.timestamp > Date.now() - 2000) {
          push(`${d.fromName} sent you a private message`, 'info');
        }
      }
    });
  }, [dms, user, push]);

  if (!user) {
    return (
      <>
        <AuthScreen onAuthed={() => setUser(currentUser())} />
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const handleLogout = () => {
    store.removePresence(user.id);
    doLogout();
    setUser(null);
    push('Signed out. See you in class!', 'info');
  };

  return (
    <div
      className={`h-screen flex flex-col app-shell app-shell-${tab}`}
      style={{ backgroundImage: `url("${ROOM_BACKGROUNDS[tab]}")` }}
    >
      <header className="border-b border-white/10 app-header backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-2 px-3 sm:px-5 h-14">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-white leading-tight">Classroom Connect</p>
              <p className="text-[10px] text-slate-500 leading-tight">&amp; Play</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`tab whitespace-nowrap ${tab === t.id ? 'tab-active' : ''}`}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
                {tab === t.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-accent-500" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 ml-auto pl-2">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
              <OnlineDot online size={8} />
              {onlineCount} online
            </div>
            <div className="flex items-center gap-2">
              <Avatar av={user.avatar} name={user.fullName} size={32} />
              <div className="hidden lg:block leading-tight">
                <p className="text-xs font-medium text-slate-200">{user.fullName}</p>
                <p className="text-[10px] text-slate-500">online</p>
              </div>
              <button onClick={handleLogout} className="btn-ghost text-xs" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main
        className={`flex-1 overflow-hidden room-stage room-stage-${tab}`}
      >
        {tab === 'ghosts' && <GhostsScreen me={user} onToast={push} onNavigate={setTab} />}
        {tab === 'public' && <ChatRoom me={user} kind="public" onToast={push} />}
        {tab === 'anonymous' && <ChatRoom me={user} kind="anonymous" onToast={push} />}
        {tab === 'games' && <GamesSection me={user} onToast={push} />}
        {tab === 'profile' && (
          <ProfileScreen me={user} onUpdate={setUser} onLogout={handleLogout} onToast={push} />
        )}
      </main>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default App;
