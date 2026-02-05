import type { VercelRequest, VercelResponse } from "@vercel/node";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout after ${ms}ms (${label})`)), ms);
  });
  try {
    return (await Promise.race([p, timeout])) as T;
  } finally {
    clearTimeout(t);
  }
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
  const debugId = `messages_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // auth
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });

    // env
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

    // import supabase
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // ===== GET: listar mensagens =====
    if (req.method === "GET") {
      const leadId = String(req.query.lead_id || "");
      if (!leadId) return respond(res, 400, { ok: false, debugId, error: "Missing query param lead_id" });

      const query = supabase
        .from("message")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true })
        .limit(100);

      const { data, error } = await withTimeout(query, 2500, "GET message by lead_id");
      if (error) {
        return respond(res, 500, { ok: false, debugId, error: error.message, details: error });
      }

      return respond(res, 200, { ok: true, debugId, table: "message", column: "lead_id", messages: data ?? [] });
    }

    // ===== POST: inserir mensagem =====
    if (req.method === "POST") {
      const body = safeJson((req as any).body);
      const leadId = String(body.lead_id || body.leadId || "");
      const text = String(body.text || body.message || body.body || body.content || "");
      const from = String(body.from || body.number || body.phone || "mock");

      if (!leadId) return respond(res, 400, { ok: false, debugId, error: "Missing body.lead_id" });
      if (!text) return respond(res, 400, { ok: false, debugId, error: "Missing body.text" });

      const now = new Date().toISOString();

      // tenta colunas comuns de texto (porque seu schema pode variar)
      const payloads = [
        { lead_id: leadId, text, from, created_at: now },
        { lead_id: leadId, message: text, from, created_at: now },
        { lead_id: leadId, body: text, from, created_at: now },
        { lead_id: leadId, content: text, from, created_at: now },
        { lead_id: leadId, text, from },
      ];

      let lastErr: any = null;

      for (const p of payloads) {
        const ins = supabase.from("message").insert(p).select("*").single();
        const { data, error } = await withTimeout(ins, 2500, "POST insert message");
        if (!error) return respond(res, 200, { ok: true, debugId, inserted: data });
        lastErr = error;
      }

      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Failed to insert into message",
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
    return respond(res, 500, { ok: false, debugId, error: "Unhandled exception", details: { message: e?.message ?? String(e) } });
  }
}
