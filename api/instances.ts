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
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const debugId = `instances_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // ✅ MARCA: se você não ver isso na resposta, você NÃO está rodando esse código
    const marker = 'INSTANCES_V3_WA_INSTANCE_FIRST';

    // Auth
    const token = pickString(req.headers['x-api-token']);
    const expected =
      process.env.API_TOKEN ||
      process.env.ONEELEVEN_API_TOKEN ||
      process.env.VITE_API_TOKEN;

    if (!expected) {
      return res.status(500).json({ ok: false, debugId, marker, error: 'server_missing_api_token_env' });
    }
    if (!token || token !== expected) {
      return res.status(401).json({ ok: false, debugId, marker, error: 'unauthorized' });
    }

    // workspace_id: query OU header
    const workspaceId =
      pickString(req.query.workspace_id) ||
      pickString(req.headers['workspace_id']) ||
      pickString(req.headers['x-workspace-id']);

    if (!workspaceId) {
      return res.status(400).json({ ok: false, debugId, marker, error: 'missing_workspace_id' });
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
        marker,
        error: 'server_missing_supabase_env',
        needs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ✅ Força a tabela CERTA primeiro
    const tryTable = async (table: string) => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(200);

      return { data, error };
    };

    // 1) wa_instance (o Supabase literalmente sugeriu isso)
    const r1 = await tryTable('wa_instance');
    if (!r1.error) {
      return res.status(200).json({
        ok: true,
        debugId,
        marker,
        table: 'wa_instance',
        workspaceColumn: 'workspace_id',
        instances: r1.data ?? [],
      });
    }

    // Se não achou tabela, tenta fallback
    const code1 = String((r1.error as any)?.code || '');
    const msg1 = String((r1.error as any)?.message || '').toLowerCase();

    const waMissing =
      code1 === 'PGRST205' ||
      msg1.includes('could not find the table') ||
      msg1.includes('schema cache');

    if (!waMissing) {
      // erro real (permissão/coluna/rls/etc)
      return res.status(500).json({
        ok: false,
        debugId,
        marker,
        error: 'instances_query_failed',
        table: 'wa_instance',
        details: r1.error,
      });
    }

    // 2) fallback: instances
    const r2 = await tryTable('instances');
    if (!r2.error) {
      return res.status(200).json({
        ok: true,
        debugId,
        marker,
        table: 'instances',
        workspaceColumn: 'workspace_id',
        instances: r2.data ?? [],
      });
    }

    // 3) fallback: whatsapp_instance
    const r3 = await tryTable('whatsapp_instance');
    if (!r3.error) {
      return res.status(200).json({
        ok: true,
        debugId,
        marker,
        table: 'whatsapp_instance',
        workspaceColumn: 'workspace_id',
        instances: r3.data ?? [],
      });
    }

    // Se nada deu, não quebra o dashboard: devolve ok true com vazio e erros para debug
    return res.status(200).json({
      ok: true,
      debugId,
      marker,
      table: null,
      workspaceColumn: 'workspace_id',
      instances: [],
      note: 'no_instances_table_worked',
      errors: [
        { table: 'wa_instance', err: r1.error },
        { table: 'instances', err: r2.error },
        { table: 'whatsapp_instance', err: r3.error },
      ],
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
