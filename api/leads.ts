import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from './_lib/cors';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

// Dev-mode leads API (server-side using service role)
// GET /api/leads?workspace_id=...&stage=...
// PATCH /api/leads  body: { lead_id, stage, token }
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

  try {
    const supabase = getSupabaseAdmin();

    if (req.method === 'GET') {
      const workspace_id = String(req.query.workspace_id || '');
      const stage = req.query.stage ? String(req.query.stage) : null;
      if (!workspace_id) return res.status(400).json({ ok: false, error: 'workspace_id required' });

      let q = supabase
        .from('lead')
        .select('id, workspace_id, phone, name, stage, last_message_at, last_message_preview, created_at, updated_at')
        .eq('workspace_id', workspace_id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (stage) q = q.eq('stage', stage);

      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === 'PATCH') {
      const { lead_id, stage } = req.body || {};
      if (!lead_id || !stage) return res.status(400).json({ ok: false, error: 'lead_id and stage required' });

      const { data, error } = await supabase
        .from('lead')
        .update({ stage, updated_at: new Date().toISOString() })
        .eq('id', lead_id)
        .select('id, stage')
        .single();

      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Unknown error' });
  }
}
