import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function safeJsonParse(body: any) {
  if (!body) return null;
  if (typeof body === "object") return body; // Vercel já parseou
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `messages_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // Auth por token
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) {
      return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    }
    if (token !== process.env.API_TOKEN) {
      return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });
    }

    // Supabase env
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

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Candidate tables (robusto)
    const tableCandidates = ["message", "messages"];

    if (req.method === "GET") {
      const leadId = String(req.query.lead_id || "");
      if (!leadId) {
        return respond(res, 400, { ok: false, debugId, error: "Missing query param lead_id" });
      }

      let lastErr: any = null;

      for (const table of tableCandidates) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: true });

        if (!error) {
          return respond(res, 200, { ok: true, debugId, table, messages: data ?? [] });
        }
        lastErr = error;
      }

      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Supabase query failed",
        details: {
          message: lastErr?.message ?? String(lastErr),
          code: lastErr?.code,
          hint: lastErr?.hint,
          details: lastErr?.details,
        },
      });
    }

    if (req.method === "POST") {
      const body = safeJsonParse(req.body);
      if (!body) {
        return respond(res, 400, { ok: false, debugId, error: "Invalid JSON body" });
      }

      // Schema mínimo (compatível com o que você mostrou)
      const workspace_id = String(body.workspace_id || "");
      const lead_id = String(body.lead_id || "");
      const direction = String(body.direction || "out"); // "in" | "out"
      const message_type = String(body.message_type || "text");
      const text = body.text != null ? String(body.text) : null;
      const media_url = body.media_url != null ? String(body.media_url) : null;
      const media_base64 = body.media_base64 != null ? String(body.media_base64) : null;
      const provider_message_id = body.provider_message_id != null ? String(body.provider_message_id) : null;

      if (!workspace_id || !lead_id || !direction || !message_type) {
        return respond(res, 400, {
          ok: false,
          debugId,
          error: "Missing required fields",
          required: ["workspace_id", "lead_id", "direction", "message_type"],
        });
      }

      const payload = {
        workspace_id,
        lead_id,
        direction,
        message_type,
        text,
        media_url,
        media_base64,
        provider_message_id,
      };

      let lastErr: any = null;

      for (const table of tableCandidates) {
        const { data, error } = await supabase.from(table).insert(payload).select("*").single();
        if (!error) {
          return respond(res, 200, { ok: true, debugId, table, message: data });
        }
        lastErr = error;
      }

      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Supabase insert failed",
        details: {
          message: lastErr?.message ?? String(lastErr),
          code: lastErr?.code,
          hint: lastErr?.hint,
          details: lastErr?.details,
        },
      });
    }

    return respond(res, 405, { ok: false, debugId, error: "Method not allowed" });
  } catch (e: any) {
    return respond(res, 500, {
      ok: false,
      debugId,
      error: "Unhandled exception",
      details: { message: e?.message ?? String(e), stack: e?.stack },
    });
  }
}
