import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client (server-only).
// REQUIRED env vars in Vercel:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
