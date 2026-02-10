// api/instances.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-api-token, workspace_id, x-workspace-id'
  );
}

function pickString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const debugId = `instances_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // Auth
    const token = pickString(req.headers['x-api-token']);
    const expected =
      process.env.API_TOKEN ||
      process.env.ONEELEVEN_API_TOKEN ||
      process.env.VITE_API_TOKEN;

    if (!expected) {
      return res.status(500).json({ ok: false, debugId, error: 'server_missing_api_token_env' });
    }
    if (!token || token !== expected) {
      return res.status(401).json({ ok: false, debugId, error: 'unauthorized' });
    }

    // workspace_id: aceita query OU header
    const workspaceId =
      pickString(req.query.workspace_id) ||
      pickString(req.headers['workspace_id']) ||
      pickString(req.headers['x-workspace-id']);

    if (!workspaceId) {
      return res.status(400).json({ ok: false, debugId, error: 'missing_workspace_id' });
    }

    // Supabase admin
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        ok: false,
        debugId,
        error: 'server_missing_supabase_env',
        needs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Tabelas possíveis (pra não quebrar se seu schema tiver nome diferente)
    const tablesToTry = ['instance', 'instances', 'whatsapp_instance', 'wa_instance'];

    let lastErr: any = null;

    for (const table of tablesToTry) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error) {
        return res.status(200).json({
          ok: true,
          debugId,
          table,
          workspaceColumn: 'workspace_id',
          instances: data ?? [],
        });
      }

      lastErr = error;

      // se a tabela não existe, tenta a próxima
      const msg = String(error?.message || '');
      if (
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('relation') ||
        msg.toLowerCase().includes('not found')
      ) {
        continue;
      }

      // erro real (permissão, coluna errada, etc)
      return res.status(500).json({
        ok: false,
        debugId,
        error: 'instances_query_failed',
        table,
        details: error,
      });
    }

    // nenhuma tabela encontrada
    return res.status(200).json({
      ok: true,
      debugId,
      table: null,
      workspaceColumn: 'workspace_id',
      instances: [],
      note: 'no_instances_table_found_in_candidates',
      lastError: lastErr ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      debugId,
      error: 'unhandled_exception',
      details: String(e?.message || e),
    });
  }
}
