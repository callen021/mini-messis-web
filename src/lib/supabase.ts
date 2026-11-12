import { createClient } from '@supabase/supabase-js';
import { type Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** False when .env.local still holds the placeholders; the app shows a setup notice instead of failing. */
export const isSupabaseConfigured: boolean =
  typeof url === 'string' &&
  /^https?:\/\//.test(url) &&
  !url.includes('YOUR-') &&
  typeof anonKey === 'string' &&
  anonKey.length > 20 &&
  !anonKey.startsWith('YOUR-');

/**
 * Single browser client. Only the anon key is ever present in the client bundle; every table is
 * protected by RLS, so this key grants nothing on its own.
 */
export const supabase = createClient<Database>(
  isSupabaseConfigured ? (url as string) : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? (anonKey as string) : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'mm-auth',
    },
  },
);

/** Absolute URL inside this deployment (respects the Vite base path). */
export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The one sentence a screen shows for a failure; raw database text never (D90). See lib/errors. */
export { errorMessage } from './errors';
