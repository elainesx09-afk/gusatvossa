import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from './_lib/cors';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

// Dev-mode messages API
// GET /api/messages?workspace_id=...&lead_id=...&limit=200
// REQUIRED env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - API_TOKEN (optional shared secret)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;

  const token = process.env.API_TOKEN;
  const provided = (req.headers['x-api-token'] as string) || (req.body?.token as string);
  if (token && provided !== token) {
    return res.status(401).json({ ok: false, error: 'Invalid API token' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const workspace_id = String(req.query.workspace_id || '');
    const lead_id = String(req.query.lead_id || '');
    const limit = Math.min(Number(req.query.limit || 200), 500);

    if (!workspace_id || !lead_id) {
      return res.status(400).json({ ok: false, error: 'workspace_id and lead_id required' });
    }

    const { data, error } = await supabase
      .from('message')
      .select('id, workspace_id, lead_id, direction, message_type, text, media_url, created_at')
      .eq('workspace_id', workspace_id)
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data: data || [] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Unknown error' });
  }
}
