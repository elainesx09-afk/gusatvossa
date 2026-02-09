import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { handleOptions, setCors } from '../_lib/auth';

type Json = Record<string, any>;

function json(res: VercelResponse, status: number, body: Json) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
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

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = mustEnv('SUPABASE_URL');
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getWorkspaceApiToken(workspaceId: string) {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from('workspaces')
    .select('api_token')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) throw new Error(`Workspace lookup failed: ${error.message}`);
  return data?.api_token || null;
}

async function saveRawEvent(params: { workspaceId: string; instanceName: string; eventType: string; payload: any; }) {
  const supabase = await getSupabaseAdmin();
  const row: any = {
    workspace_id: params.workspaceId,
    instance_name: params.instanceName,
    event_type: params.eventType,
    payload: params.payload,
    created_at: new Date().toISOString(),
  };
  await supabase.from('wa_webhook_events').insert(row);
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
  const appBaseUrl = getAppBaseUrl(req);
  const url = `${appBaseUrl}/api/mock-inbound`;

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
  setCors(res);
  if (handleOptions(req, res)) return;

  const debugId = crypto.randomUUID();

  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, debugId, error: 'METHOD_NOT_ALLOWED' });

    const workspaceId = String((req.query as any)?.workspace_id || '').trim();
    const instanceName = String((req.query as any)?.instance || '').trim();
    const sig = String((req.query as any)?.sig || '').trim();

    if (!workspaceId || !instanceName) {
      return json(res, 200, { ok: true, debugId, ignored: true, reason: 'missing workspace_id/instance' });
    }

    const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim() || '';
    if (secret) {
      const expected = hmacSig(secret, workspaceId, instanceName);
      if (!sig || sig !== expected) {
        await saveRawEvent({ workspaceId, instanceName, eventType: 'INVALID_SIGNATURE', payload: req.body || null });
        return json(res, 200, { ok: true, debugId, ignored: true, reason: 'invalid signature' });
      }
    }

    const payload = req.body || {};
    const eventType = String(payload?.event || payload?.type || 'UNKNOWN');
    await saveRawEvent({ workspaceId, instanceName, eventType, payload });

    const eventUpper = eventType.toUpperCase();
    const isMessageEvent = eventUpper.includes('MESSAGES') || eventUpper.includes('MESSAGE');
    if (!isMessageEvent) {
      return json(res, 200, { ok: true, debugId, captured: true, processed: false, eventType });
    }

    const msg = extractFirstMessage(payload);
    const key = msg?.key || {};
    const remoteJid = key?.remoteJid || msg?.remoteJid || (payload?.data?.key?.remoteJid ?? null);
    const fromMe = !!(key?.fromMe ?? msg?.fromMe ?? false);
    const externalMessageId = (key?.id || msg?.id || null) ? String(key?.id || msg?.id) : null;
    const phone = normalizePhoneFromJid(remoteJid);
    const name = (payload?.data?.pushName || msg?.pushName || payload?.pushName || null)
      ? String(payload?.data?.pushName || msg?.pushName || payload?.pushName)
      : null;
    const text = extractText(msg?.message || msg?.msg || msg);

    if (fromMe) {
      return json(res, 200, { ok: true, debugId, captured: true, processed: false, reason: 'fromMe' });
    }

    const apiToken = await getWorkspaceApiToken(workspaceId);
    if (!apiToken) {
      return json(res, 200, { ok: true, debugId, captured: true, processed: false, reason: 'workspace api_token missing' });
    }

    const forwarded = await forwardToMockInbound(req, {
      workspaceId, apiToken, instanceName, phone, name, text, externalMessageId, fromMe, raw: payload,
    });

    return json(res, 200, { ok: true, debugId, captured: true, processed: true, forwarded });
  } catch (e: any) {
    return json(res, 200, { ok: true, debugId, captured: false, processed: false, error: String(e?.message || e) });
  }
}
