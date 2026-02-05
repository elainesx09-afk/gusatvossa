import type { VercelRequest, VercelResponse } from "@vercel/node";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// timeout helper
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout after ${ms}ms (${label})`)), ms);
  });
  try {
    return await Promise.race([p, timeout]) as T;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `messages_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // auth
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });

    const leadId = String(req.query.lead_id || "");
    if (!leadId) return respond(res, 400, { ok: false, debugId, error: "Missing query param lead_id" });

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

    // import supabase (dynamic)
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

    // tentativa única por vez, com LIMIT e timeout curto
    const attempts: Array<{ table: string; col: string }> = [
      { table: "messages", col: "lead_id" },
      { table: "messages", col: "leadId" },
      { table: "message", col: "lead_id" },
      { table: "message", col: "leadId" },
    ];

    let lastErr: any = null;

    for (const a of attempts) {
      const query = supabase
        .from(a.table)
        .select("*")
        .eq(a.col, leadId)
        .order("created_at", { ascending: true })
        .limit(50);

      const { data, error } = await withTimeout(query, 2500, `${a.table}.${a.col}`);

      if (!error) {
        return respond(res, 200, {
          ok: true,
          debugId,
          table: a.table,
          column: a.col,
          messages: data ?? [],
        });
      }

      lastErr = error;
      // se for erro “tabela não existe” ou “coluna não existe”, tenta próxima
      // se for outro erro, também tenta próxima, mas vamos guardar o último
    }

    return respond(res, 500, {
      ok: false,
      debugId,
      error: "Supabase query failed (all candidates)",
      details: {
        message: lastErr?.message ?? String(lastErr),
        code: lastErr?.code,
        hint: lastErr?.hint,
        details: lastErr?.details,
      },
    });
  } catch (e: any) {
    return respond(res, 500, {
      ok: false,
      debugId,
      error: "Unhandled exception",
      details: { message: e?.message ?? String(e) },
    });
  }
}
