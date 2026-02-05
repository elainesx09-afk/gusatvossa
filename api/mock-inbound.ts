import type { VercelRequest, VercelResponse } from "@vercel/node";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function safeJson(input: any) {
  if (!input) return {};
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try { return JSON.parse(input); } catch { return {}; }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `mock_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // auth
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });

    const body = safeJson((req as any).body);

    const workspaceId = String(body.workspace_id || body.workspaceId || "");
    const from = String(body.from || body.number || body.phone || "");
    const text = String(body.text || body.message || "");

    if (!workspaceId) return respond(res, 400, { ok: false, debugId, error: "Missing body.workspace_id" });
    if (!from) return respond(res, 400, { ok: false, debugId, error: "Missing body.from (or number/phone)" });
    if (!text) return respond(res, 400, { ok: false, debugId, error: "Missing body.text (or message)" });

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return respond(res, 500, { ok: false, debugId, error: "Missing Supabase envs" });
    }

    // dynamic import supabase (não crasha no load)
    let createClient: any;
    try {
      const mod: any = await import("@supabase/supabase-js");
      createClient = mod.createClient;
    } catch (e: any) {
      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Failed to import @supabase/supabase-js",
        details: { message: e?.message ?? String(e) },
        fix: "Instale no repo: npm i @supabase/supabase-js e faça push",
      });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const now = new Date().toISOString();

    // 1) cria lead (tabela/coluna mais prováveis)
    const leadTableCandidates = ["leads", "lead"];
    const wsColCandidates = ["workspace_id", "workspaceId"];

    let createdLead: any = null;
    let lastLeadErr: any = null;

    for (const table of leadTableCandidates) {
      for (const wsCol of wsColCandidates) {
        const payloads = [
          { [wsCol]: workspaceId, name: `Lead Demo ${from}`, phone: from, stage: "Novo", source: "mock", created_at: now },
          { [wsCol]: workspaceId, name: `Lead Demo ${from}`, phone: from, created_at: now },
          { [wsCol]: workspaceId, name: `Lead Demo ${from}`, created_at: now },
          { [wsCol]: workspaceId, phone: from, created_at: now },
          { [wsCol]: workspaceId },
        ];

        for (const p of payloads) {
          const { data, error } = await supabase.from(table).insert(p).select("*").single();
          if (!error) {
            createdLead = data;
            break;
          }
          lastLeadErr = error;
        }
        if (createdLead) break;
      }
      if (createdLead) break;
    }

    if (!createdLead) {
      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Failed to insert lead",
        details: {
          message: lastLeadErr?.message ?? String(lastLeadErr),
          code: lastLeadErr?.code,
          hint: lastLeadErr?.hint,
          details: lastLeadErr?.details,
        },
      });
    }

    // 2) tenta criar message (não derruba se falhar)
    let createdMsg: any = null;
    let lastMsgErr: any = null;

    const msgTables = ["messages", "message"];
    const leadIdCols = ["lead_id", "leadId"];

    for (const mt of msgTables) {
      for (const lc of leadIdCols) {
        const payloads = [
          { [lc]: createdLead.id, text, from, created_at: now },
          { [lc]: createdLead.id, message: text, from, created_at: now },
          { [lc]: createdLead.id, body: text, from, created_at: now },
          { [lc]: createdLead.id, text, from },
        ];

        for (const mp of payloads) {
          const { data, error } = await supabase.from(mt).insert(mp).select("*").single();
          if (!error) {
            createdMsg = data;
            break;
          }
          lastMsgErr = error;
        }
        if (createdMsg) break;
      }
      if (createdMsg) break;
    }

    return respond(res, 200, {
      ok: true,
      debugId,
      lead: createdLead,
      message: createdMsg ? { ok: true, data: createdMsg } : { ok: false, error: lastMsgErr?.message ?? "Could not insert message" },
    });
  } catch (e: any) {
    return respond(res, 500, {
      ok: false,
      debugId,
      error: "Unhandled exception",
      details: { message: e?.message ?? String(e), stack: e?.stack },
    });
  }
}
