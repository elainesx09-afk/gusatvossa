// /api/instances.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function json(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getToken(req: VercelRequest) {
  const t = req.headers["x-api-token"];
  return Array.isArray(t) ? t[0] : (t ?? "");
}

function getWorkspaceId(req: VercelRequest) {
  const q = (req.query?.workspace_id ?? "") as string | string[];
  if (Array.isArray(q)) return q[0] || "";
  // fallback: aceitar header também
  const h = req.headers["workspace_id"];
  return (Array.isArray(h) ? h[0] : (h ?? "")) as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // preflight (mesmo domínio, mas não custa)
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const token = String(getToken(req) || "");
    const expected = String(process.env.API_TOKEN || "");

    if (!expected) {
      json(res, 500, { ok: false, error: "server_misconfig", details: "API_TOKEN não está configurado na Vercel." });
      return;
    }

    if (!token || token !== expected) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const workspaceId = String(getWorkspaceId(req) || "");
    if (!workspaceId) {
      json(res, 400, { ok: false, error: "missing_workspace_id" });
      return;
    }

    const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "");
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

    if (!supabaseUrl || !serviceKey) {
      json(res, 500, {
        ok: false,
        error: "server_misconfig",
        details: "SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY não estão configurados na Vercel.",
      });
      return;
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // SELECT * = evita quebrar por coluna inexistente
    const { data, error } = await supabase
      .from("wa_instances")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false, nullsFirst: false });

    if (error) {
      json(res, 500, { ok: false, error: "instances_failed", details: error });
      return;
    }

    json(res, 200, { ok: true, instances: data ?? [] });
  } catch (e: any) {
    json(res, 500, { ok: false, error: "instances_failed", details: String(e?.message || e) });
  }
}
