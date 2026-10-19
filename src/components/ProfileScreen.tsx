import { useState } from 'react';
import { UserCircle, Shuffle, Save, LogOut, Check } from 'lucide-react';
import { store } from '@/store';
import { randomColorAvatar } from '@/auth';
import { ANON_NAMES, AVATAR_PRESETS, AVATAR_COLORS } from '@/constants';
import type { AvatarConfig, User } from '@/types';
import { Avatar } from './ui';
import { hashStringToIndex } from '@/utils';

export function ProfileScreen({
  me,
  onUpdate,
  onLogout,
  onToast,
}: {
  me: User;
  onUpdate: (u: User) => void;
  onLogout: () => void;
  onToast: (text: string, kind?: 'info' | 'success' | 'warning') => void;
}) {
  const [avatar, setAvatar] = useState<AvatarConfig>(me.avatar);
  const [bio, setBio] = useState(me.bio);
  const [name, setName] = useState(me.fullName);
  const anonName = ANON_NAMES[hashStringToIndex(me.id, ANON_NAMES.length)];

  const save = () => {
    const updated: User = { ...me, fullName: name.trim() || me.fullName, avatar, bio: bio.trim() || anonName };
    store.updateUser(updated);
    onUpdate(updated);
    onToast('Profile updated.', 'success');
  };

  return (
    <div className="h-full overflow-y-auto">
      <header className="px-5 py-4 border-b border-bg-border flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-violet-600 flex items-center justify-center">
          <UserCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Your Profile</h2>
          <p className="text-xs text-slate-500">Customize your anonymous identity.</p>
        </div>
      </header>

      <div className="p-5 max-w-2xl mx-auto space-y-6">
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-1">Real Account</h3>
          <p className="text-xs text-slate-500 mb-4">Shown only in the Public Chat Room.</p>
          <div className="flex items-center gap-4">
            <Avatar av={{ type: 'color', color: '#3b95f6' }} name={name} size={56} ring />
            <div className="flex-1">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                placeholder="Your display name"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Mobile {me.phone ? `····${me.phone.slice(-4)}` : '—'} · Joined{' '}
                {new Date(me.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-200">Anonymous Identity</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">ANON</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">Used in the Anonymous Chat Room and anonymous games.</p>

          <div className="flex items-center gap-4 mb-5">
            <Avatar av={avatar} name={anonName} size={64} ring />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{anonName}</p>
              <p className="text-xs text-slate-400">{bio || anonName}</p>
            </div>
            <button
              onClick={() => setAvatar(randomColorAvatar())}
              className="btn-outline text-xs"
              title="Random color avatar"
            >
              <Shuffle className="w-3.5 h-3.5" /> Random
            </button>
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-2">Choose Avatar</label>
          <div className="grid grid-cols-8 gap-2 mb-4">
            {AVATAR_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setAvatar({ type: 'preset', preset: p.id })}
                className={`relative aspect-square rounded-lg bg-gradient-to-br ${p.bg} flex items-center justify-center text-xl transition-transform hover:scale-105 ${
                  avatar.type === 'preset' && avatar.preset === p.id ? 'ring-2 ring-accent-500' : ''
                }`}
              >
                {p.emoji}
                {avatar.type === 'preset' && avatar.preset === p.id && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-2">Or pick a color</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAvatar({ type: 'color', color: c })}
                className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                  avatar.type === 'color' && avatar.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bg-panel' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>

          <label className="block text-xs font-medium text-slate-400 mb-1.5">Anonymous Bio</label>
          <textarea
            className="input min-h-[80px] resize-none"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={120}
            placeholder="A short, fun anonymous bio…"
          />
          <p className="mt-1 text-[11px] text-slate-500">{bio.length}/120</p>
        </section>

        <div className="flex gap-2">
          <button onClick={save} className="btn-primary flex-1"><Save className="w-4 h-4" /> Save Changes</button>
          <button onClick={onLogout} className="btn-outline"><LogOut className="w-4 h-4" /> Sign Out</button>
        </div>
      </div>
    </div>
  );
}
