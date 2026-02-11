import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-token, workspace_id, x-workspace-id"
  );
}

function pickString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string" && v[0].trim()) return v[0].trim();
  return null;
}

function bearerToken(req: VercelRequest) {
  const raw = pickString(req.headers["authorization"]);
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).send("");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const debugId = `workspaces_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    const token = pickString(req.headers["x-api-token"]);
    const expected = process.env.API_TOKEN || process.env.ONEELEVEN_API_TOKEN || process.env.VITE_API_TOKEN;

    if (!expected) return res.status(500).json({ ok: false, debugId, error: "server_missing_api_token_env" });
    if (!token || token !== expected) return res.status(401).json({ ok: false, debugId, error: "unauthorized" });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        ok: false,
        debugId,
        error: "server_missing_supabase_env",
        needs: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const jwt = bearerToken(req);
    if (!jwt) return res.status(401).json({ ok: false, debugId, error: "missing_bearer_token" });

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return res.status(401).json({ ok: false, debugId, error: "invalid_token" });

    const userId = userData.user.id;

    // pega memberships
    const { data: memberships, error: memErr } = await supabase
      .from("workspace_member")
      .select("workspace_id, role")
      .eq("user_id", userId);

    if (memErr) {
      return res.status(500).json({ ok: false, debugId, error: "membership_query_failed", details: memErr });
    }

    let workspaceIds = (memberships ?? []).map((m: any) => String(m.workspace_id));

    // se não tiver nenhum, cria 1
    if (workspaceIds.length === 0) {
      const { data: ws, error: wsErr } = await supabase
        .from("workspace")
        .insert({ name: "Meu Workspace", created_by: userId })
        .select("*")
        .single();

      if (wsErr || !ws?.id) {
        return res.status(500).json({ ok: false, debugId, error: "workspace_autocreate_failed", details: wsErr });
      }

      const { error: linkErr } = await supabase
        .from("workspace_member")
        .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });

      if (linkErr) {
        return res.status(500).json({ ok: false, debugId, error: "workspace_member_link_failed", details: linkErr });
      }

      workspaceIds = [String(ws.id)];
    }

    const { data: workspaces, error: wsListErr } = await supabase
      .from("workspace")
      .select("id,name,created_at")
      .in("id", workspaceIds)
      .order("created_at", { ascending: false });

    if (wsListErr) {
      return res.status(500).json({ ok: false, debugId, error: "workspace_list_failed", details: wsListErr });
    }

    return res.status(200).json({ ok: true, debugId, workspaces: workspaces ?? [] });
  } catch (e: any) {
    return res.status(500).json({ ok: false, debugId, error: "unhandled_exception", details: String(e?.message || e) });
  }
}
