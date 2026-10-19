import { useState } from 'react';
import { GraduationCap, LogIn, UserPlus, Loader2, Phone } from 'lucide-react';
import { login, register, normalizePhone } from '@/auth';

export function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const digits = normalizePhone(phone);
    const res = mode === 'login' ? await login(digits, password) : await register(digits, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAuthed();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 auth-backdrop"
      style={{ backgroundImage: 'url("/images/backgrounds/download_(2).jpg")' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accent-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md card p-8 animate-fade-in shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-lg shadow-accent-700/30">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Classroom Connect &amp; Play</h1>
          <p className="mt-1 text-sm text-slate-400">Chat, stay anonymous, and play Truth &amp; Dare.</p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-lg bg-bg-base">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`btn ${mode === m ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {m === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {m === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Mobile Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="tel"
                inputMode="numeric"
                className="input pl-9 tracking-widest"
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                placeholder="10-digit mobile number"
                maxLength={10}
                autoComplete="off"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">India only — no country code needed.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger animate-fade-in">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'login' ? (
              <LogIn className="w-4 h-4" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          No OTP, no email. One number = one account. Ask your class admin if your number isn&apos;t
          approved yet.
        </p>
      </div>
    </div>
  );
}
