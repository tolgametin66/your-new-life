import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surface a clear, actionable error rather than a cryptic runtime crash later.
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase env vars. Create a .env file in your project root with:\n' +
    '  VITE_SUPABASE_URL=https://xxxxx.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=eyJ...\n' +
    'Then restart the dev server.',
  );
}

export const supabase = createClient(url || '', anonKey || '', {
  auth: {
    persistSession: true,        // keep the user signed in across page reloads
    autoRefreshToken: true,      // silently refresh the JWT before it expires
    detectSessionInUrl: true,    // handle email-confirmation callbacks
  },
});
