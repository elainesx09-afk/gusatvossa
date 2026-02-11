// api/instances.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCors, tenantGuard } from './_lib/tenantGuard';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const guard = await tenantGuard(req, res, 'instances');
  if (!guard) return;

  try {
    // Prioriza wa_instance (hint do Supabase)
    const tablesToTry = ['wa_instance', 'whatsapp_instance', 'instances', 'instance', 'wa_instances'];

    for (const table of tablesToTry) {
      const { data, error } = await guard.supabase
        .from(table)
        .select('*')
        .eq('workspace_id', guard.workspaceId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error) {
        return res.status(200).json({
          ok: true,
          debugId: guard.debugId,
          table,
          workspaceColumn: 'workspace_id',
          instances: data ?? [],
        });
      }

      const msg = String(error?.message || '').toLowerCase();

      // "table not found" variants (inclui schema cache)
      const isMissingTable =
        msg.includes('could not find the table') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('not found');

      if (isMissingTable) continue;

      // erro real
      return res.status(500).json({
        ok: false,
        debugId: guard.debugId,
        error: 'instances_query_failed',
        table,
        details: error,
      });
    }

    return res.status(200).json({
      ok: true,
      debugId: guard.debugId,
      table: null,
      workspaceColumn: 'workspace_id',
      instances: [],
      note: 'no_instances_table_found_in_candidates',
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      debugId: guard.debugId,
      error: 'unhandled_exception',
      details: String(e?.message || e),
    });
  }
}
