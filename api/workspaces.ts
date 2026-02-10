// api/workspaces.ts
export const config = { runtime: "nodejs" };

function jid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function json(body: any, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function getToken(req: Request) {
  return req.headers.get("x-api-token") || "";
}

export default async function handler(req: Request) {
  const debugId = jid("workspaces");
  const method = req.method || "GET";

  // CORS básico
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type, x-api-token",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const token = getToken(req);
  const apiToken = process.env.API_TOKEN || "";

  if (!apiToken || token !== apiToken) {
    return json({ ok: false, debugId, error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id") || "";

  // Supabase Admin (helper já existe no seu projeto)
  let supabase: any;
  try {
    const mod = await import("./_lib/supabaseAdmin.js");
    supabase = mod?.supabaseAdmin || mod?.default || mod?.supabase || null;
  } catch (e: any) {
    return json({ ok: false, debugId, error: "supabase_admin_import_failed", details: String(e?.message || e) }, 500);
  }

  if (!supabase) {
    return json({ ok: false, debugId, error: "supabase_admin_missing" }, 500);
  }

  try {
    if (method === "GET") {
      let q = supabase.from("workspaces").select("*").order("created_at", { ascending: false });
      if (workspaceId) q = q.eq("id", workspaceId);

      const { data, error } = await q;
      if (error) return json({ ok: false, debugId, error: error.message }, 400);

      return json({ ok: true, debugId, workspaces: data || [] });
    }

    if (method === "POST") {
      const body = await readJson(req);
      const name = String(body?.name || "").trim();
      const niche = String(body?.niche || "").trim();
      const timezone = String(body?.timezone || "America/Sao_Paulo").trim();

      if (!name) return json({ ok: false, debugId, error: "missing_name" }, 400);

      const payload: any = { name, niche: niche || null, timezone };

      const { data, error } = await supabase.from("workspaces").insert(payload).select("*").single();
      if (error) return json({ ok: false, debugId, error: error.message }, 400);

      return json({ ok: true, debugId, workspace: data });
    }

    return json({ ok: false, debugId, error: "method_not_allowed" }, 405);
  } catch (e: any) {
    return json({ ok: false, debugId, error: "workspaces_failed", details: String(e?.message || e) }, 500);
  }
}
