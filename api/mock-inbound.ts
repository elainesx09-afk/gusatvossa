import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function safeJsonParse(input: any) {
  if (!input) return {};
  if (typeof input === "object") return input;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `mock_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // Token
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });

    // Body (aceita string ou object)
    const body = safeJsonParse((req as any).body);

    const workspaceId = String(body.workspace_id || body.workspaceId || "");
    const from = String(body.from || body.number || body.phone || "");
    const text = String(body.text || body.message || "");

    if (!workspaceId) return respond(res, 400, { ok: false, debugId, error: "Missing body.workspace_id" });
    if (!from) return respond(res, 400, { ok: false, debugId, error: "Missing body.from (or number/phone)" });
    if (!text) return respond(res, 400, { ok: false, debugId, error: "Missing body.text (or message)" });

    // Env Supabase
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Missing Supabase envs",
        hasSUPABASE_URL: Boolean(url),
        hasSUPABASE_SERVICE_ROLE_KEY: Boolean(key),
      });
    }

    // Import seguro do Supabase
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
      });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Detecta tabela/coluna do lead igual ao /api/leads
    const leadTables = ["lead", "leads"];
    const wsCols = ["workspace_id", "workspaceId"];

    let leadTable: string | null = null;
    let wsCol: string | null = null;
    let detectErr: any = null;

    for (const t of leadTables) {
      for (const c of wsCols) {
        const { error } = await supabase.from(t).select("*").eq(c, workspaceId).limit(1);
        if (!error) {
          leadTable = t;
          wsCol = c;
          break;
        }
        detectErr = error;
      }
      if (leadTable) break;
    }

    if (!leadTable || !wsCol) {
      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Could not detect lead table/column",
        details: { message: detectErr?.message ?? String(detectErr) },
      });
    }

    // Monta insert “mínimo” e tolerante
    const now = new Date().toISOString();
    const leadId = crypto.randomUUID();

    // Tentativas comuns de colunas
    const candidatePayloads: any[] = [
      { id: leadId, [wsCol]: workspaceId, name: `Lead Demo ${from}`, phone: from, stage: "Novo", source: "mock", created_at: now },
      { id: leadId, [wsCol]: workspaceId, name: `Lead Demo ${from}`, phone: from, created_at: now },
      { id: leadId, [wsCol]: workspaceId, name: `Lead Demo ${from}`, created_at: now },
      { [wsCol]: workspaceId, name: `Lead Demo ${from}`, phone: from, stage: "Novo", source: "mock" },
      { [wsCol]: workspaceId, name: `Lead Demo ${from}`, phone: from },
      { [wsCol]: workspaceId, name: `Lead Demo ${from}` },
      { [wsCol]: workspaceId },
    ];

    let createdLead: any = null;
    let lastLeadErr: any = null;

    for (const payload of candidatePayloads) {
      const { data, error } = await supabase.from(leadTable).insert(payload).select("*").single();
      if (!error) {
        createdLead = data;
        break;
      }
      lastLeadErr = error;
    }

    if (!createdLead) {
      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Failed to insert lead",
        leadTable,
        wsCol,
        details: {
          message: lastLeadErr?.message ?? String(lastLeadErr),
          code: lastLeadErr?.code,
          hint: lastLeadErr?.hint,
          details: lastLeadErr?.details,
        },
        note: "Isso agora te diz exatamente qual coluna obrigatória está faltando no schema real.",
      });
    }

    // (Opcional) tenta inserir mensagem — mas não derruba se falhar
    const msgTables = ["message", "messages"];
    const leadIdCols = ["lead_id", "leadId"];
    let msgResult: any = { inserted: false };

    for (const mt of msgTables) {
      for (const lc of leadIdCols) {
        const msgPayloads: any[] = [
          { id: crypto.randomUUID(), [lc]: createdLead.id, text, from, created_at: now },
          { [lc]: createdLead.id, text, from },
          { [lc]: createdLead.id, message: text, from },
          { [lc]: createdLead.id, body: text, from },
        ];

        for (const mp of msgPayloads) {
          const { data, error } = await supabase.from(mt).insert(mp).select("*").single();
          if (!error) {
            msgResult = { inserted: true, table: mt, col: lc, message: data };
            break;
          }
        }
        if (msgResult.inserted) break;
      }
      if (msgResult.inserted) break;
    }

    return respond(res, 200, {
      ok: true,
      debugId,
      lead: createdLead,
      message: msgResult,
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
