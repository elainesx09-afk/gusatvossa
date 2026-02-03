import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from '../_lib/cors';

// Calls n8n onboarding workflow (set webhook in Evolution and upsert wa_instance)
// REQUIRED env vars in Vercel:
// - N8N_ONBOARD_URL  (the Production webhook URL of workflow 04)
// - ONBOARD_TOKEN    (shared secret to prevent random calls)
// - DEFAULT_WEBHOOK_URL (optional default inbound webhook URL)

type Body = {
  workspace_id: string;
  instance_key: string;
  webhook_url?: string;
  events?: string[];
  token?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const body = (req.body || {}) as Body;
    const { workspace_id, instance_key } = body;
    const webhook_url = body.webhook_url || process.env.DEFAULT_WEBHOOK_URL;
    const events = body.events || [
      'QRCODE_UPDATED',
      'CONNECTION_UPDATE',
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
    ];

    const expected = process.env.ONBOARD_TOKEN;
    if (expected && body.token !== expected) {
      return res.status(401).json({ ok: false, error: 'Invalid token' });
    }

    if (!workspace_id || !instance_key || !webhook_url) {
      return res.status(400).json({ ok: false, error: 'workspace_id, instance_key, webhook_url are required' });
    }

    const url = process.env.N8N_ONBOARD_URL;
    if (!url) return res.status(500).json({ ok: false, error: 'Missing N8N_ONBOARD_URL' });

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id, instance_key, webhook_url, events }),
    });

    const text = await r.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: 'n8n onboarding failed', status: r.status, details: json });
    }

    return res.status(200).json({ ok: true, result: json });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Unknown error' });
  }
}
