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
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-api-token, x-workspace-id, workspace_id, workspace-id'
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end('');
    return true;
  }
  return false;
}

function getWorkspaceId(req: VercelRequest) {
  return String(
    req.query?.workspace_id ||
      (req.headers['x-workspace-id'] as string) ||
      (req.headers['workspace-id'] as string) ||
      (req.headers['workspace_id'] as string) ||
      ''
  ).trim();
}

function getApiToken(req: VercelRequest) {
  return String(req.headers['x-api-token'] || '').trim();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `onboard_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  try {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return send(res, 405, { ok: false, debugId, error: 'METHOD_NOT_ALLOWED' });

    const workspaceId = getWorkspaceId(req);
    const apiToken = getApiToken(req);
    const body = (req.body || {}) as any;
    const instanceName = String(body.instanceName || body.instance_name || body.instance || '').trim();

    if (!workspaceId) return send(res, 200, { ok: false, debugId, error: 'MISSING_WORKSPACE_ID', hint: 'use ?workspace_id=...' });
    if (!apiToken) return send(res, 200, { ok: false, debugId, error: 'MISSING_API_TOKEN', hint: 'use header x-api-token' });
    if (!instanceName) return send(res, 200, { ok: false, debugId, error: 'MISSING_INSTANCE_NAME' });

    const appBaseUrl = getAppBaseUrl(req);
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim() || '';
    const sig = webhookSecret ? hmacSig(webhookSecret, workspaceId, instanceName) : '';

    // ✅ CHAVE: embed do api_token na URL pra inbound não depender do Supabase agora
    const webhookUrl =
      `${appBaseUrl}/api/evolution/inbound?workspace_id=${encodeURIComponent(workspaceId)}` +
      `&instance=${encodeURIComponent(instanceName)}` +
      `&api_token=${encodeURIComponent(apiToken)}` +
      (sig ? `&sig=${sig}` : '');

    // Evolution não paga => DEMO sempre OK
    const hasEvolution = !!(process.env.EVOLUTION_BASE_URL && process.env.EVOLUTION_API_KEY);
    if (!hasEvolution) {
      return send(res, 200, { ok: true, debugId, mode: 'demo', instanceName, webhookUrl });
    }

    // LIVE vai entrar depois do pagamento
    return send(res, 200, { ok: true, debugId, mode: 'live', instanceName, webhookUrl });
  } catch (e: any) {
    return send(res, 200, { ok: false, debugId, error: 'ONBOARD_CRASH', message: String(e?.message || e) });
  }
}
