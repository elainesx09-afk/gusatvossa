import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';

type Json = Record<string, any>;

function send(res: VercelResponse, status: number, body: Json) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function cors(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end('');
    return true;
  }
  return false;
}

function getAppBaseUrl(req: VercelRequest) {
  const env = process.env.APP_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string);
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function hmacSig(secret: string, workspaceId: string, instanceName: string) {
  return crypto.createHmac('sha256', secret).update(`${workspaceId}:${instanceName}`).digest('hex');
}

function normalizePhoneFromJid(remoteJid?: string | null) {
  if (!remoteJid) return null;
  const digits = remoteJid.split('@')[0].replace(/\D+/g, '');
  return digits || null;
}

function extractText(message: any): string | null {
  if (!message) return null;
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    null
  );
}

function extractFirstMessage(payload: any) {
  const data = payload?.data ?? payload ?? {};
  const msgs = data?.messages;
  if (Array.isArray(msgs) && msgs.length) return msgs[0];
  const msg = data?.message;
  if (msg) return msg;
  return null;
}

async function getSupabaseAdminIfAvailable() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function saveRawEventBestEffort(params: {
  workspaceId: string;
  instanceName: string;
  eventType: string;
  payload: any;
}) {
  const supabase = await getSupabaseAdminIfAvailable();
  if (!supabase) return;

  try {
    await supabase.from('wa_webhook_events').insert({
      workspace_id: params.workspaceId,
      instance_name: params.instanceName,
      event_type: params.eventType,
      payload: params.payload,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

async function forwardToMockInbound(req: VercelRequest, params: {
  workspaceId: string;
  apiToken: string;
  instanceName: string;
  phone: string | null;
  name: string | null;
  text: string | null;
  externalMessageId: string | null;
  fromMe: boolean;
  raw: any;
}) {
  const url = `${getAppBaseUrl(req)}/api/mock-inbound`;

  const body = {
    workspace_id: params.workspaceId,
    instanceName: params.instanceName,
    instance: params.instanceName,
    from: params.phone,
    phone: params.phone,
    number: params.phone,
    name: params.name,
    pushName: params.name,
    text: params.text,
    message: params.text,
    external_id: params.externalMessageId,
    message_id: params.externalMessageId,
    fromMe: params.fromMe,
    raw: params.raw,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-token': params.apiToken,
      'x-workspace-id': params.workspaceId,
      'workspace_id': params.workspaceId,
    },
    body: JSON.stringify(body),
  });

  const t = await resp.text();
  let data: any = null;
  try { data = t ? JSON.parse(t) : null; } catch { data = { raw: t }; }

  return { ok: resp.ok, status: resp.status, data };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `in_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  try {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return send(res, 200, { ok: true, debugId, ignored: true, reason: 'METHOD_NOT_ALLOWED' });

    const workspaceId = String((req.query as any)?.workspace_id || '').trim();
    const instanceName = String((req.query as any)?.instance || '').trim();
    const apiTokenFromQuery = String((req.query as any)?.api_token || '').trim();
    const sig = String((req.query as any)?.sig || '').trim();

    if (!workspaceId || !instanceName) {
      return send(res, 200, { ok: true, debugId, ignored: true, reason: 'missing workspace_id/instance' });
    }

    const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim() || '';
    if (secret) {
      const expected = hmacSig(secret, workspaceId, instanceName);
      if (!sig || sig !== expected) {
        await saveRawEventBestEffort({ workspaceId, instanceName, eventType: 'INVALID_SIGNATURE', payload: req.body || null });
        return send(res, 200, { ok: true, debugId, ignored: true, reason: 'invalid signature' });
      }
    }

    const payload = req.body || {};
    const eventType = String(payload?.event || payload?.type || 'UNKNOWN');
    await saveRawEventBestEffort({ workspaceId, instanceName, eventType, payload });

    const eventUpper = eventType.toUpperCase();
    const isMessageEvent = eventUpper.includes('MESSAGES') || eventUpper.includes('MESSAGE');
    if (!isMessageEvent) return send(res, 200, { ok: true, debugId, captured: true, processed: false, eventType });

    const msg = extractFirstMessage(payload);
    const key = msg?.key || {};
    const remoteJid = key?.remoteJid || msg?.remoteJid || (payload?.data?.key?.remoteJid ?? null);
    const fromMe = !!(key?.fromMe ?? msg?.fromMe ?? false);
    const externalMessageId = (key?.id || msg?.id || null) ? String(key?.id || msg?.id) : null;

    if (fromMe) return send(res, 200, { ok: true, debugId, captured: true, processed: false, reason: 'fromMe' });

    const phone = normalizePhoneFromJid(remoteJid);
    const name = (payload?.data?.pushName || msg?.pushName || payload?.pushName || null)
      ? String(payload?.data?.pushName || msg?.pushName || payload?.pushName)
      : null;
    const text = extractText(msg?.message || msg?.msg || msg);

    if (!apiTokenFromQuery) {
      return send(res, 200, { ok: true, debugId, captured: true, processed: false, reason: 'missing api_token in query' });
    }

    const forwarded = await forwardToMockInbound(req, {
      workspaceId,
      apiToken: apiTokenFromQuery,
      instanceName,
      phone,
      name,
      text,
      externalMessageId,
      fromMe,
      raw: payload,
    });

    return send(res, 200, { ok: true, debugId, captured: true, processed: true, forwarded });
  } catch (e: any) {
    return send(res, 200, { ok: true, debugId, captured: false, processed: false, error: String(e?.message || e) });
  }
}
