import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, data: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function safeBody(req: VercelRequest) {
  const raw: any = (req as any).body;
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `mock_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, debugId, error: "Method not allowed" });
    }

    // auth
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return json(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return json(res, 401, { ok: false, debugId, error: "Unauthorized" });

    // env
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json(res, 500, { ok: false, debugId, error: "Missing Supabase envs" });

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const body = safeBody(req);

    const workspaceId = String(body.workspace_id || "");
    const from = String(body.from || "");
    const text = body.text == null ? null : String(body.text);
    const leadIdFromBody = String(body.lead_id || "");

    if (!workspaceId) return json(res, 400, { ok: false, debugId, error: "Missing body.workspace_id" });
    if (!from && !leadIdFromBody) return json(res, 400, { ok: false, debugId, error: "Missing body.from (or provide body.lead_id)" });
    if (!text) return json(res, 400, { ok: false, debugId, error: "Missing body.text" });

    // 1) Se já veio lead_id: só insere message (sem risco de schema do lead)
    if (leadIdFromBody) {
      const payload = {
        workspace_id: workspaceId,
        lead_id: leadIdFromBody,
        direction: "in",
        text,
      };

      const { data, error } = await supabase.from("message").insert(payload).select("*").single();
      if (error) return json(res, 500, { ok: false, debugId, step: "insert_message_only", error: error.message, details: error, payload });

      return json(res, 200, { ok: true, debugId, mode: "message_only", message: data });
    }

    // 2) Tenta criar lead (schema pode variar) — tentativas com payloads comuns
    const leadTableCandidates = ["lead", "leads"];

    const leadPayloadVariants = [
      // mínimo comum
      { workspace_id: workspaceId, phone: from },
      { workspace_id: workspaceId, wa_number: from },
      { workspace_id: workspaceId, number: from },
      { workspace_id: workspaceId, from },

      // com stage/status (caso seja obrigatório)
      { workspace_id: workspaceId, phone: from, stage: "new" },
      { workspace_id: workspaceId, phone: from, status: "new" },
      { workspace_id: workspaceId, phone: from, stage: "Novo" },
    ];

    let createdLead: any = null;
    let lastLeadErr: any = null;

    for (const table of leadTableCandidates) {
      for (const payload of leadPayloadVariants) {
        const { data, error } = await supabase.from(table).insert(payload).select("*").single();
        if (!error && data) {
          createdLead = data;
          break;
        }
        lastLeadErr = { table, payload, error };
      }
      if (createdLead) break;
    }

    if (!createdLead) {
      return json(res, 500, {
        ok: false,
        debugId,
        step: "create_lead",
        error: "Could not create lead with guessed schema. Use body.lead_id to insert message only.",
        lastLeadErr: {
          table: lastLeadErr?.table,
          payload: lastLeadErr?.payload,
          message: lastLeadErr?.error?.message,
          code: lastLeadErr?.error?.code,
          hint: lastLeadErr?.error?.hint,
          details: lastLeadErr?.error?.details,
        },
      });
    }

    // 3) Insere message vinculada ao lead criado
    const msgPayload = {
      workspace_id: workspaceId,
      lead_id: createdLead.id,
      direction: "in",
      text,
    };

    const { data: msg, error: msgErr } = await supabase.from("message").insert(msgPayload).select("*").single();
    if (msgErr) return json(res, 500, { ok: false, debugId, step: "insert_message", error: msgErr.message, details: msgErr, msgPayload });

    return json(res, 200, { ok: true, debugId, mode: "lead_and_message", lead: createdLead, message: msg });
  } catch (e: any) {
    return json(res, 500, { ok: false, debugId, error: "Unhandled exception", details: { message: e?.message ?? String(e) } });
  }
}
