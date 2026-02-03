import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../_lib/cors';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin';

// Enqueue a message to be sent by n8n Worker (workflow 03)
// POST /api/outbox/enqueue
// body: { workspace_id, to_number, message_type, text, lead_id?, scheduled_at?, media_base64?, media_mime?, token? }
// REQUIRED env vars:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - API_TOKEN (optional shared secret)

type Body = {
  workspace_id: string;
  to_number: string;
  message_type?: 'text' | 'audio';
  text?: string;
  lead_id?: string;
  scheduled_at?: string;
  media_base64?: string;
  media_mime?: string;
  token?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const token = process.env.API_TOKEN;
  const provided = (req.headers['x-api-token'] as string) || (req.body?.token as string);
  if (token && provided !== token) {
    return res.status(401).json({ ok: false, error: 'Invalid API token' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = (req.body || {}) as Body;

    const workspace_id = body.workspace_id;
    const to_number = String(body.to_number || '').replace(/\D/g, '');
    const message_type = body.message_type || 'text';
    const text = body.text || '';
    const lead_id = body.lead_id || null;
    const scheduled_at = body.scheduled_at || new Date().toISOString();
    const media_base64 = body.media_base64 || null;
    const media_mime = body.media_mime || null;

    if (!workspace_id || !to_number) {
      return res.status(400).json({ ok: false, error: 'workspace_id and to_number required' });
    }

    if (message_type === 'text' && !text) {
      return res.status(400).json({ ok: false, error: 'text required for message_type=text' });
    }
    if (message_type === 'audio' && !media_base64) {
      return res.status(400).json({ ok: false, error: 'media_base64 required for message_type=audio' });
    }

    const { data, error } = await supabase
      .from('outbox')
      .insert({
        workspace_id,
        lead_id,
        to_number,
        message_type,
        text: text || null,
        media_base64,
        media_mime,
        status: 'queued',
        scheduled_at,
        attempt_count: 0,
      })
      .select('id, status')
      .single();

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, data });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Unknown error' });
  }
}
