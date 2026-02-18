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
  const debugId = `leads_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // Auth
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

    const tableCandidates = ["lead", "leads"];
    const workspaceCols = ["workspace_id", "workspaceId"];
    const stageCols = ["stage", "pipeline_stage", "funnel_stage", "status"];

    if (req.method === "GET") {
      const workspaceId = String(req.query.workspace_id || "");
      if (!workspaceId) {
        return respond(res, 400, { ok: false, debugId, error: "Missing query param workspace_id" });
      }

      let lastErr: any = null;

      for (const table of tableCandidates) {
        for (const wsCol of workspaceCols) {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .eq(wsCol, workspaceId)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false });

          if (!error) {
            return respond(res, 200, {
              ok: true,
              debugId,
              table,
              workspaceColumn: wsCol,
              leads: data ?? [],
            });
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
          details: lastErr?.details,
        },
      });
    }

    if (req.method === "PATCH") {
      const body = safeJsonParse(req.body);
      if (!body) {
        return respond(res, 400, { ok: false, debugId, error: "Invalid JSON body" });
      }

      const workspaceId = String(body.workspace_id || body.workspaceId || "");
      const leadId = String(body.id || body.lead_id || body.leadId || "");

      if (!workspaceId || !leadId) {
        return respond(res, 400, {
          ok: false,
          debugId,
          error: "Missing required fields",
          required: ["workspace_id", "id"],
        });
      }

      // Campos que aceitamos atualizar
      const patchBase: any = {};
      const stageValue = body.stage != null ? String(body.stage) : null;

      if (body.name != null) patchBase.name = String(body.name);
      if (body.phone != null) patchBase.phone = String(body.phone);
      if (body.source != null) patchBase.source = String(body.source);
      if (body.score != null) patchBase.score = Number(body.score);
      if (body.responsible != null) patchBase.responsible = String(body.responsible);
      if (body.last_message != null) patchBase.last_message = String(body.last_message);
      if (body.last_message_at != null) patchBase.last_message_at = body.last_message_at;

      // tem que ter pelo menos 1 campo
      if (!stageValue && Object.keys(patchBase).length === 0) {
        return respond(res, 400, {
          ok: false,
          debugId,
          error: "No fields to update",
          hint: "Envie pelo menos { stage } ou algum campo como name/phone/score",
        });
      }

      let lastErr: any = null;

      for (const table of tableCandidates) {
        for (const wsCol of workspaceCols) {
          // Se tiver stage, tenta várias colunas de stage até achar a certa
          if (stageValue) {
            for (const stageCol of stageCols) {
              const updateObj = { ...patchBase, [stageCol]: stageValue };

              const { data, error } = await supabase
                .from(table)
                .update(updateObj)
                .eq("id", leadId)
                .eq(wsCol, workspaceId)
                .select("*")
                .single();

              if (!error) {
                return respond(res, 200, {
                  ok: true,
                  debugId,
                  table,
                  workspaceColumn: wsCol,
                  stageColumn: stageCol,
                  lead: data,
                });
              }

              lastErr = error;
            }
          } else {
            // Sem stage: update direto
            const { data, error } = await supabase
              .from(table)
              .update(patchBase)
              .eq("id", leadId)
              .eq(wsCol, workspaceId)
              .select("*")
              .single();

            if (!error) {
              return respond(res, 200, {
                ok: true,
                debugId,
                table,
                workspaceColumn: wsCol,
                lead: data,
              });
            }

            lastErr = error;
          }
        }
      }

      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Supabase update failed",
        details: {
          message: lastErr?.message ?? String(lastErr),
          code: lastErr?.code,
          hint: lastErr?.hint,
          details: lastErr?.details,
        },
        next: "Cole aqui debugId + details.message se ainda falhar (vai dizer a coluna certa).",
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
