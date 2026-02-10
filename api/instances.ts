import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  return String(process.env[name] || "");
}

function supabaseAdmin() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function assertWorkspaceAuth(req: any, workspaceId: string) {
  const token = String(req.headers["x-api-token"] || "");
  if (!token) throw new Error("Missing x-api-token header");

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("workspaces")
    .select("id, api_token")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.api_token) throw new Error("Workspace api_token not found");
  if (data.api_token !== token) throw new Error("Invalid x-api-token for workspace");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "OPTIONS") return res.status(200).json({ ok: true });

    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const workspaceId = String(req.query.workspace_id || req.headers["workspace_id"] || "");
    if (!workspaceId) return res.status(400).json({ ok: false, error: "Missing workspace_id" });

    await assertWorkspaceAuth(req, workspaceId);

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("wa_instances")
      .select("id, workspace_id, instance_name, status, mode, phone, last_qrcode, last_seen_at, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({ ok: true, instances: data || [] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "instances_failed", details: { message: String(e?.message || e) } });
  }
}
