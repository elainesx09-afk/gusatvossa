// api/_lib/tenantGuard.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-api-token, workspace_id, x-workspace-id'
  );
}

export function pickString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  return null;
}

function getAuthToken(req: VercelRequest) {
  const auth = pickString(req.headers['authorization']);
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export type GuardResult = {
  ok: true;
  debugId: string;
  workspaceId: string;
  userId: string;
  supabase: SupabaseClient;
};

export async function tenantGuard(
  req: VercelRequest,
  res: VercelResponse,
  debugPrefix: string
): Promise<GuardResult | null> {
  const debugId = `${debugPrefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // 1) API Token (gate extra)
  const token = pickString(req.headers['x-api-token']);
  const expected =
    process.env.API_TOKEN ||
    process.env.ONEELEVEN_API_TOKEN ||
    process.env.VITE_API_TOKEN;

  if (!expected) {
    res.status(500).json({ ok: false, debugId, error: 'server_missing_api_token_env' });
    return null;
  }
  if (!token || token !== expected) {
    res.status(401).json({ ok: false, debugId, error: 'unauthorized' });
    return null;
  }

  // 2) workspace_id (query OU header)
  const workspaceId =
    pickString(req.query.workspace_id) ||
    pickString(req.headers['workspace_id']) ||
    pickString(req.headers['x-workspace-id']);

  if (!workspaceId) {
    res.status(400).json({ ok: false, debugId, error: 'missing_workspace_id' });
    return null;
  }

  // 3) Supabase admin
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({
      ok: false,
      debugId,
      error: 'server_missing_supabase_env',
      needs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
    return null;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 4) Auth do usuário (OBRIGATÓRIO pra isolamento real)
  const jwt = getAuthToken(req);
  if (!jwt) {
    res.status(401).json({ ok: false, debugId, error: 'missing_bearer_token' });
    return null;
  }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
  const userId = userData?.user?.id;

  if (userErr || !userId) {
    res.status(401).json({ ok: false, debugId, error: 'invalid_bearer_token', details: userErr ?? null });
    return null;
  }

  // 5) Membership check (NÃO tem como burlar workspace_id)
  // Requer tabela: workspace_member (workspace_id, user_id)
  const { data: membership, error: memErr } = await supabaseAdmin
    .from('workspace_member')
    .select('id, workspace_id, user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .limit(1);

  if (memErr) {
    res.status(500).json({ ok: false, debugId, error: 'workspace_member_check_failed', details: memErr });
    return null;
  }

  if (!membership || membership.length === 0) {
    res.status(403).json({ ok: false, debugId, error: 'forbidden_workspace' });
    return null;
  }

  return { ok: true, debugId, workspaceId, userId, supabase: supabaseAdmin };
}
