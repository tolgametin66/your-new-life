import { supabase } from './supabase';

/* Storage layer. Two-tier:
    1. localStorage — instant cache so the app paints immediately on load,
       keyed by user id (each account gets its own cache).
    2. Supabase (Postgres JSONB) — canonical source of truth, real-time
       subscriptions notify other devices of changes within ~1s.

   Shape on disk and over the wire is identical:
    { aspects: [], kpis: [], entries: [], notes: {} }
*/

const STORAGE_KEY_PREFIX = 'your-new-life-os:';
const TABLE = 'user_data';

const localKey = (userId) => `${STORAGE_KEY_PREFIX}${userId}`;

const EMPTY = { aspects: [], kpis: [], entries: [], notes: {} };

const safeJSON = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

// --- Local cache helpers ---------------------------------------------------

export function loadLocalCache(userId) {
  try {
    if (typeof window === 'undefined' || !window.localStorage || !userId) return null;
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw) return null;
    const parsed = safeJSON(raw);
    return normalize(parsed);
  } catch { return null; }
}

export function saveLocalCache(userId, data) {
  try {
    if (typeof window === 'undefined' || !window.localStorage || !userId) return;
    window.localStorage.setItem(localKey(userId), JSON.stringify(data));
  } catch { /* quota or disabled — ignore */ }
}

// --- Cloud (Supabase) ------------------------------------------------------

/** Fetch the user's data row. If it doesn't exist yet (first login), creates
 *  an empty one so subsequent updates and subscriptions have a row to target. */
export async function loadCloudData(userId) {
  if (!userId) return { ...EMPTY };

  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[storage] loadCloudData error:', error.message);
    return { ...EMPTY };
  }

  if (!data) {
    // First-time user: create the row with empty defaults.
    const seeded = { ...EMPTY };
    await supabase.from(TABLE).insert({ user_id: userId, data: seeded });
    return seeded;
  }

  return normalize(data.data);
}

/** Upsert the entire snapshot. Atomic — either it lands cleanly or it doesn't.
 *  Real-time subscribers on other devices will receive the new row payload. */
export async function saveCloudData(userId, data) {
  if (!userId) return;
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data }, { onConflict: 'user_id' });
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[storage] saveCloudData error:', error.message);
  }
}

/** Subscribe to live updates for THIS user's row. Returns an unsubscribe fn.
 *  The callback receives the full new data object whenever it changes. */
export function subscribeToCloudData(userId, onChange) {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`user_data:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',                // INSERT | UPDATE | DELETE
        schema: 'public',
        table: TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // INSERT and UPDATE expose the new row; DELETE leaves new empty.
        const next = payload.new?.data;
        if (next) onChange(normalize(next));
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// --- Shape guard -----------------------------------------------------------

/** Ensure all four top-level fields exist with the expected shapes, regardless
 *  of where the data came from (older snapshot, partial doc, network glitch). */
function normalize(d) {
  if (!d || typeof d !== 'object') return { ...EMPTY };
  return {
    aspects: Array.isArray(d.aspects) ? d.aspects : [],
    kpis:    Array.isArray(d.kpis)    ? d.kpis    : [],
    entries: Array.isArray(d.entries) ? d.entries : [],
    notes:   d.notes && typeof d.notes === 'object' && !Array.isArray(d.notes) ? d.notes : {},
  };
}
