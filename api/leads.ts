import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const token = String(req.headers["x-api-token"] || "");
  if (!process.env.API_TOKEN) {
    return res.status(500).json({ ok: false, error: "Missing env API_TOKEN" });
  }
  if (token !== process.env.API_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return res.status(200).json({
    ok: true,
    route: "/api/leads",
    workspace_id: String(req.query.workspace_id || ""),
    env: {
      hasSUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      hasSUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAPI_TOKEN: Boolean(process.env.API_TOKEN),
    },
  });
}
