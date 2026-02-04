import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, data: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = leads_${Date.now()}_${Math.random().toString(16).slice(2)};

  try {
    // 1) Auth simples por token
    const token = (req.headers["x-api-token"] as string) || "";
    if (!process.env.API_TOKEN) {
      return json(res, 500, {
        ok: false,
        debugId,
        error: "Missing env API_TOKEN in server",
      });
    }
    if (token !== process.env.API_TOKEN) {
      return json(res, 401, { ok: false, debugId, error: "Unauthorized" });
    }

    // 2) Validar workspace_id
    const workspaceId = String(req.query.workspace_id || "");
    if (!workspaceId) {
      return json(res, 400, {
        ok: false,
        debugId,
        error: "Missing query param: workspace_id",
      });
    }

    // 3) Validar envs do Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return json(res, 500, {
        ok: false,
        debugId,
        error: "Missing Supabase envs",
        hasSUPABASE_URL: Boolean(supabaseUrl),
        hasSUPABASE_SERVICE_ROLE_KEY: Boolean(supabaseKey),
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // 4) Fallback: tenta tabelas comuns (lead/leads)
    const tableCandidates = ["lead", "leads"];
    let lastError: any = null;

    for (const table of tableCandidates) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (!error) {
        return json(res, 200, { ok: true, debugId, table, leads: data ?? [] });
      }

      // se a coluna workspace_id não existir, tenta workspaceId (fallback)
      if (String(error.message || "").includes("workspace_id")) {
        const alt = await supabase
          .from(table)
          .select("*")
          .eq("workspaceId", workspaceId)
          .order("created_at", { ascending: false });

        if (!alt.error) {
          return json(res, 200, {
            ok: true,
            debugId,
            table,
            usedColumn: "workspaceId",
            leads: alt.data ?? [],
          });
        }
        lastError = alt.error;
      } else {
        lastError = error;
      }
    }

    // 5) Se falhou tudo, retorna erro “legível”
    return json(res, 500, {
      ok: false,
      debugId,
      error: "Supabase query failed",
      details: {
        message: lastError?.message ?? String(lastError),
        hint: lastError?.hint,
        code: lastError?.code,
        details: lastError?.details,
      },
      likelyCauses: [
        "Tabela lead/leads não existe no schema",
        "Coluna workspace_id (ou workspaceId) não existe na tabela",
        "RLS/permissions (menos provável usando service role)",
        "Env SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY errado",
      ],
    });
  } catch (e: any) {
    return json(res, 500, {
      ok: false,
      debugId,
      error: "Unhandled exception",
      details: { message: e?.message ?? String(e), stack: e?.stack },
    });
  }
}
// leads.ts content placeholder
