import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';

type Json = Record<string, any>;

function json(res: VercelResponse, status: number, body: Json) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function enableCors(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-token, workspace_id');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end('');
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

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function hmacSig(secret: string, workspaceId: string, instanceName: string) {
  return crypto.createHmac('sha256', secret).update(`${workspaceId}:${instanceName}`).digest('hex');
}

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = mustEnv('SUPABASE_URL');
  const key = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function assertWorkspaceAuth(workspaceId: string, apiToken: string) {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('api_token', apiToken)
    .maybeSingle();

  if (error) throw new Error(`Auth query failed: ${error.message}`);
  return !!data?.id;
}

async function upsertWaInstance(params: {
  workspaceId: string;
  instanceName: string;
  mode: 'demo' | 'live';
  status: string;
  webhookUrl?: string;
  lastQr?: any;
  lastPairingCode?: string | null;
}) {
  const supabase = await getSupabaseAdmin();
  const row: any = {
    workspace_id: params.workspaceId,
    instance_name: params.instanceName,
    mode: params.mode,
    status: params.status,
    webhook_url: params.webhookUrl ?? null,
    last_qr: params.lastQr ?? null,
    last_pairing_code: params.lastPairingCode ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('wa_instances')
    .upsert(row, { onConflict: 'workspace_id,instance_name' });

  if (!upsertErr) return;

  const { error: insertErr } = await supabase.from('wa_instances').insert(row);
  if (insertErr) throw new Error(`wa_instances write failed: ${insertErr.message}`);
}

async function evolutionFetch(baseUrl: string, apiKey: string, path: string, init?: RequestInit) {
  const url = `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers: Record<string, string> = {
    apikey: apiKey,
    'Content-Type': 'application/json',
    ...(init?.headers as any),
  };
  const resp = await fetch(url, { ...init, headers });
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!resp.ok) {
    const msg = typeof data?.message === 'string' ? data.message : `HTTP ${resp.status}`;
    throw new Error(`Evolution error on ${path}: ${msg}`);
  }
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = crypto.randomUUID();

  try {
    if (enableCors(req, res)) return;

    if (req.method !== 'POST') return json(res, 405, { ok: false, debugId, error: 'METHOD_NOT_ALLOWED' });

    const workspaceId = (req.headers['workspace_id'] as string) || '';
    const apiToken = (req.headers['x-api-token'] as string) || '';
    if (!workspaceId || !apiToken) return json(res, 401, { ok: false, debugId, error: 'MISSING_AUTH_HEADERS' });

    const authed = await assertWorkspaceAuth(workspaceId, apiToken);
    if (!authed) return json(res, 403, { ok: false, debugId, error: 'INVALID_API_TOKEN' });

    const body = (req.body || {}) as any;
    const instanceName = String(body.instanceName || body.instance_name || body.instance || '').trim();
    if (!instanceName) return json(res, 400, { ok: false, debugId, error: 'MISSING_INSTANCE_NAME' });

    const hasEvolution = !!(process.env.EVOLUTION_BASE_URL && process.env.EVOLUTION_API_KEY);
    const appBaseUrl = getAppBaseUrl(req);

    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim() || '';
    const sig = webhookSecret ? hmacSig(webhookSecret, workspaceId, instanceName) : '';
    const webhookUrl =
      `${appBaseUrl}/api/evolution/inbound?workspace_id=${encodeURIComponent(workspaceId)}` +
      `&instance=${encodeURIComponent(instanceName)}` +
      (sig ? `&sig=${sig}` : '');

    if (!hasEvolution) {
      await upsertWaInstance({ workspaceId, instanceName, mode: 'demo', status: 'demo', webhookUrl });
      return json(res, 200, { ok: true, debugId, mode: 'demo', instanceName, webhookUrl });
    }

    const baseUrl = mustEnv('EVOLUTION_BASE_URL');
    const apiKey = mustEnv('EVOLUTION_API_KEY');

    let createResp: any = null;
    try {
      createResp = await evolutionFetch(baseUrl, apiKey, '/instance/create', {
        method: 'POST',
        body: JSON.stringify({ instanceName }),
      });
    } catch (e: any) {
      createResp = { warning: String(e?.message || e) };
    }

    const events = Array.isArray(body.events) && body.events.length
      ? body.events
      : ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE'];

    const setWebhookResp = await evolutionFetch(
      baseUrl,
      apiKey,
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      { method: 'POST', body: JSON.stringify({ url: webhookUrl, enabled: true, events }) }
    );

    const connectResp = await evolutionFetch(
      baseUrl,
      apiKey,
      `/instance/connect/${encodeURIComponent(instanceName)}`,
      { method: 'GET' }
    );

    const qrTextOrCode = connectResp?.code || connectResp?.qr || connectResp?.qrcode || null;
    const pairingCode = connectResp?.pairingCode || null;

    await upsertWaInstance({
      workspaceId,
      instanceName,
      mode: 'live',
      status: 'created',
      webhookUrl,
      lastQr: qrTextOrCode,
      lastPairingCode: pairingCode,
    });

    return json(res, 200, {
      ok: true,
      debugId,
      mode: 'live',
      instanceName,
      webhookUrl,
      evolution: { create: createResp, webhook: setWebhookResp, connect: connectResp },
      qr: { qrTextOrCode, pairingCode },
    });
  } catch (e: any) {
    return json(res, 500, { ok: false, debugId, error: 'INTERNAL', message: String(e?.message || e) });
  }
}
