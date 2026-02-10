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

function isMissingTableError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();

  // PostgREST: table not found in schema cache
  if (code === 'PGRST205') return true;

  // Common message patterns
  if (msg.includes("could not find the table")) return true;
  if (msg.includes("schema cache")) return true;
  if (msg.includes("does not exist")) return true;
  if (msg.includes("relation")) return true;
  if (msg.includes("not found")) return true;

  return false;
}

function isMissingColumnError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();

  // PostgREST sometimes uses these for bad requests / missing columns
  if (code === 'PGRST204') return true;

  if (msg.includes('column')) return true;
  if (msg.includes('does not exist')) return true;

  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

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

    // workspace_id: query OU header
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

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ✅ Coloca wa_instance primeiro (o seu Supabase já sugeriu isso)
    const tablesToTry = ['wa_instance', 'whatsapp_instance', 'instances', 'instance'];

    // tenta workspace columns possíveis (pra não quebrar se o schema variar)
    const workspaceColsToTry = ['workspace_id', 'workspaceId', 'workspace'];

    let lastErr: any = null;

    for (const table of tablesToTry) {
      // 1) testa a tabela existir (seleção simples)
      // Se nem existir, PostgREST costuma dar PGRST205
      for (const col of workspaceColsToTry) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq(col as any, workspaceId)
          .order('created_at', { ascending: false })
          .limit(200);

        if (!error) {
          return res.status(200).json({
            ok: true,
            debugId,
            table,
            workspaceColumn: col,
            instances: data ?? [],
          });
        }

        lastErr = error;

        // tabela não existe -> tenta próxima tabela
        if (isMissingTableError(error)) break;

        // coluna errada -> tenta próxima coluna
        if (isMissingColumnError(error)) continue;

        // erro real (permissão, RLS, etc)
        return res.status(500).json({
          ok: false,
          debugId,
          error: 'instances_query_failed',
          table,
          details: error,
        });
      }

      // se saiu do loop de colunas por "missing table", continua para próxima tabela
      if (lastErr && isMissingTableError(lastErr)) continue;
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
