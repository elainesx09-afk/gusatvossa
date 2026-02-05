import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, data: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `messages_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // auth
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return json(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return json(res, 401, { ok: false, debugId, error: "Unauthorized" });

    // env
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return json(res, 500, { ok: false, debugId, error: "Missing Supabase envs" });

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // GET /api/messages?lead_id=...
    if (req.method === "GET") {
      const leadId = String(req.query.lead_id || "");
      if (!leadId) return json(res, 400, { ok: false, debugId, error: "Missing query param lead_id" });

      const { data, error } = await supabase
        .from("message")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) return json(res, 500, { ok: false, debugId, error: error.message, details: error });
      return json(res, 200, { ok: true, debugId, table: "message", column: "lead_id", messages: data ?? [] });
    }

    // POST /api/messages  body: workspace_id, lead_id, direction, text
    if (req.method === "POST") {
      // Vercel normalmente já entrega req.body como objeto. Se vier string, parse.
      const raw: any = (req as any).body;
      const body = typeof raw === "string" ? JSON.parse(raw) : (raw || {});

      const workspaceId = String(body.workspace_id || "");
      const leadId = String(body.lead_id || "");
      const direction = String(body.direction || "");
      const text = body.text == null ? null : String(body.text);

      if (!workspaceId) return json(res, 400, { ok: false, debugId, error: "Missing body.workspace_id" });
      if (!leadId) return json(res, 400, { ok: false, debugId, error: "Missing body.lead_id" });
      if (!direction) return json(res, 400, { ok: false, debugId, error: "Missing body.direction" });

      const payload = {
        workspace_id: workspaceId,
        lead_id: leadId,
        direction,
        text,
        // message_type default 'text'
        // created_at default now()
      };

      const { data, error } = await supabase.from("message").insert(payload).select("*").single();

      if (error) return json(res, 500, { ok: false, debugId, error: error.message, details: error, payload });
      return json(res, 200, { ok: true, debugId, inserted: data });
    }

    return json(res, 405, { ok: false, debugId, error: "Method not allowed" });
  } catch (e: any) {
    return json(res, 500, { ok: false, debugId, error: "Unhandled exception", details: { message: e?.message ?? String(e) } });
  }
}
