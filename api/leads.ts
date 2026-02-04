import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = leads_${Date.now()}_${Math.random().toString(16).slice(2)};

  try {
    // Auth por token
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

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Tenta tabelas comuns: lead/leads
    const tableCandidates = ["lead", "leads"];
    const columnCandidates = ["workspace_id", "workspaceId"];

    let lastErr: any = null;

    for (const table of tableCandidates) {
      for (const col of columnCandidates) {
        const q = supabase
          .from(table)
          .select("*")
          .eq(col, workspaceId)
          .order("created_at", { ascending: false });

        const { data, error } = await q;

        if (!error) {
          return respond(res, 200, {
            ok: true,
            debugId,
            table,
            column: col,
            leads: data ?? [],
          });
        }

        lastErr = error;
        // se erro for "relation/table doesn't exist", pula pra próxima tabela
        // se erro for "column doesn't exist", pula pra próxima coluna
        // (não precisa if específico; a gente só tenta tudo)
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
        details: lastErr?.details,
      },
      next: "Me mande esse debugId + details.message que eu te digo o nome exato da tabela/coluna no seu schema.",
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
