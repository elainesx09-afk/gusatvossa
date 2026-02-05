import type { VercelRequest, VercelResponse } from "@vercel/node";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `leads2_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // Token
  const token = String(req.headers["x-api-token"] || "");
  if (!process.env.API_TOKEN) {
    return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
  }
  if (token !== process.env.API_TOKEN) {
    return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });
  }

  // workspace_id
  const workspaceId = String(req.query.workspace_id || "");
  if (!workspaceId) {
    return respond(res, 400, { ok: false, debugId, error: "Missing query param workspace_id" });
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

  // Import seguro do Supabase (se faltar dependência, retorna JSON com erro)
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
      fix: "No repo: npm i @supabase/supabase-js && git push",
    });
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const tableCandidates = ["lead", "leads"];
    const columnCandidates = ["workspace_id", "workspaceId"];
    let lastErr: any = null;

    for (const table of tableCandidates) {
      for (const col of columnCandidates) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq(col, workspaceId)
          .limit(50);

        if (!error) {
          return respond(res, 200, { ok: true, debugId, table, column: col, leads: data ?? [] });
        }
        lastErr = error;
      }
    }

    return respond(res, 500, {
      ok: false,
      debugId,
      error: "Supabase query failed",
      details: {
        message: lastErr?.message ?? String(lastErr),
        code: lastErr?.code,
        hint: lastErr?.hint,
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
