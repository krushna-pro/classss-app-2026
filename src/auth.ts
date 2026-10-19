import { supabase } from './supabase';
import { store } from './store';
import type { User } from './types';
import { uid, hashStringToIndex } from './utils';
import { AVATAR_PRESETS, AVATAR_COLORS, ANON_NAMES } from './constants';

export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

interface ServerUser {
  id: string;
  phone: string;
  fullName: string;
  avatar: User['avatar'];
  bio: string | null;
  createdAt: string | number;
}

/** Indian mobile numbers only: drop everything but digits, keep the last 10 (no country code). */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-10);
}

export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

/** Nobody types a name any more, so give the account a friendly default they can edit in Profile. */
function defaultDisplayName(phone: string): string {
  return `Player ${phone.slice(-4)}`;
}

function fromServer(u: ServerUser): User {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    avatar: u.avatar,
    bio: u.bio ?? '',
    createdAt: typeof u.createdAt === 'number' ? u.createdAt : Date.parse(u.createdAt),
  };
}

function finish(user: User): AuthResult {
  store.cacheUser(user);
  store.setMe(user);
  store.setSession(user.id);
  return { ok: true, user };
}

export async function register(rawPhone: string, password: string): Promise<AuthResult> {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) {
    return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
  }
  if (password.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' };
  }

  if (supabase) {
    const { data, error } = await supabase.rpc('register_user', {
      p_phone: phone,
      p_password: password,
      p_display_name: defaultDisplayName(phone),
    });
    if (error) return { ok: false, error: error.message };
    const res = data as { ok: boolean; error?: string; user?: ServerUser } | null;
    if (!res?.ok || !res.user) return { ok: false, error: res?.error ?? 'Registration failed.' };
    return finish(fromServer(res.user));
  }

  // Local-only mode (no Supabase configured yet).
  if (store.findUserByPhone(phone)) {
    return { ok: false, error: 'An account already exists for this number.' };
  }
  const name = defaultDisplayName(phone);
  const user: User = {
    id: uid('user'),
    fullName: name,
    phone,
    password,
    createdAt: Date.now(),
    avatar: { type: 'preset', preset: AVATAR_PRESETS[hashStringToIndex(name, AVATAR_PRESETS.length)].id },
    bio: ANON_NAMES[hashStringToIndex(name, ANON_NAMES.length)],
  };
  store.addUser(user);
  return finish(user);
}

export async function login(rawPhone: string, password: string): Promise<AuthResult> {
  const phone = normalizePhone(rawPhone);
  if (!isValidPhone(phone)) {
    return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' };
  }

  if (supabase) {
    const { data, error } = await supabase.rpc('login_user', {
      p_phone: phone,
      p_password: password,
    });
    if (error) return { ok: false, error: error.message };
    const res = data as { ok: boolean; error?: string; user?: ServerUser } | null;
    if (!res?.ok || !res.user) return { ok: false, error: res?.error ?? 'Sign in failed.' };
    return finish(fromServer(res.user));
  }

  const found = store.findUserByPhone(phone);
  if (!found) return { ok: false, error: 'No account found for this number.' };
  if (found.password !== password) return { ok: false, error: 'Incorrect password.' };
  return finish(found);
}

export function logout() {
  store.setMe(null);
  store.setSession(null);
}

export function currentUser(): User | null {
  return store.getMe();
}

export function randomColorAvatar() {
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  return { type: 'color' as const, color };
}
