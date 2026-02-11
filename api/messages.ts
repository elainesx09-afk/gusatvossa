// api/messages.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCors, tenantGuard, pickString } from './_lib/tenantGuard';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).send('');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const guard = await tenantGuard(req, res, 'messages');
  if (!guard) return;

  const leadId = pickString(req.query.lead_id);
  if (!leadId) return res.status(400).json({ ok: false, debugId: guard.debugId, error: 'missing_lead_id' });

  try {
    // 1) confirma que o lead pertence ao workspace do usuário
    const { data: lead, error: leadErr } = await guard.supabase
      .from('lead')
      .select('id, workspace_id')
      .eq('id', leadId)
      .eq('workspace_id', guard.workspaceId)
      .limit(1);

    if (leadErr) {
      return res.status(500).json({ ok: false, debugId: guard.debugId, error: 'lead_lookup_failed', details: leadErr });
    }
    if (!lead || lead.length === 0) {
      return res.status(404).json({ ok: false, debugId: guard.debugId, error: 'lead_not_found_in_workspace' });
    }

    // 2) puxa mensagens do lead
    const tablesToTry = ['message', 'messages', 'wa_message', 'whatsapp_message'];

    for (const table of tablesToTry) {
      const { data, error } = await guard.supabase
        .from(table)
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(1000);

      if (!error) {
        return res.status(200).json({
          ok: true,
          debugId: guard.debugId,
          table,
          leadId,
          messages: data ?? [],
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
        error: 'messages_query_failed',
        table,
        details: error,
      });
    }

    return res.status(200).json({
      ok: true,
      debugId: guard.debugId,
      table: null,
      leadId,
      messages: [],
      note: 'no_messages_table_found_in_candidates',
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
