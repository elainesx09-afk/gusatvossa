// api/leads.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCors, tenantGuard } from './_lib/tenantGuard';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const guard = await tenantGuard(req, res, 'leads');
  if (!guard) return;

  try {
    const tablesToTry = ['lead', 'leads'];

    for (const table of tablesToTry) {
      const { data, error } = await guard.supabase
        .from(table)
        .select('*')
        .eq('workspace_id', guard.workspaceId)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (!error) {
        return res.status(200).json({
          ok: true,
          debugId: guard.debugId,
          table,
          workspaceColumn: 'workspace_id',
          leads: data ?? [],
        });
      }

      const msg = String(error?.message || '').toLowerCase();
      const isMissingTable =
        msg.includes('could not find the table') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('not found');

      if (isMissingTable) continue;

      return res.status(500).json({
        ok: false,
        debugId: guard.debugId,
        error: 'leads_query_failed',
        table,
        details: error,
      });
    }

    return res.status(200).json({
      ok: true,
      debugId: guard.debugId,
      table: null,
      workspaceColumn: 'workspace_id',
      leads: [],
      note: 'no_leads_table_found_in_candidates',
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
