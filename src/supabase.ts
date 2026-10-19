import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/**
 * True when .env has both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 * When false, the app runs in local-only mode (localStorage + BroadcastChannel),
 * which is what you get while developing before the backend is wired up.
 */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;
