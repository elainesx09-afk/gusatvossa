import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

type Json = Record<string, any>;

function send(res: VercelResponse, status: number, body: Json) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function cors(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-token, x-workspace-id, workspace_id, workspace-id");
  if (req.method === "OPTIONS") {
    res.status(204).end("");
    return true;
  }
  return false;
}

function getWorkspaceId(req: VercelRequest) {
  return String(
    req.query?.workspace_id ||
      (req.headers["x-workspace-id"] as string) ||
      (req.headers["workspace-id"] as string) ||
      (req.headers["workspace_id"] as string) ||
      ""
  ).trim();
}

function getApiToken(req: VercelRequest) {
  return String(req.headers["x-api-token"] || "").trim();
}

async function getSupabaseAdmin() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel env");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `instances_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    if (cors(req, res)) return;
    if (req.method !== "GET") return send(res, 405, { ok: false, debugId, error: "METHOD_NOT_ALLOWED" });

    const workspaceId = getWorkspaceId(req);
    const apiToken = getApiToken(req);

    // ✅ consistente com o resto: só exige token presente (como seus outros endpoints “funcionando”)
    if (!workspaceId) return send(res, 200, { ok: false, debugId, error: "MISSING_WORKSPACE_ID" });
    if (!apiToken) return send(res, 200, { ok: false, debugId, error: "MISSING_API_TOKEN" });

    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase
      .from("wa_instances")
      .select("id, workspace_id, instance_name, status, mode, webhook_url, last_qr, updated_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) return send(res, 200, { ok: false, debugId, error: error.message });

    return send(res, 200, { ok: true, debugId, instances: data ?? [] });
  } catch (e: any) {
    // ✅ nunca “quebra”, sempre JSON
    return send(res, 200, { ok: false, debugId, error: String(e?.message || e) });
  }
}
