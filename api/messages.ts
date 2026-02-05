import type { VercelRequest, VercelResponse } from "@vercel/node";

function respond(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `messages_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    // token
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return respond(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return respond(res, 401, { ok: false, debugId, error: "Unauthorized" });

    // lead_id
    const leadId = String((req.query.lead_id || req.query.leadId || "") as any);
    if (!leadId) return respond(res, 400, { ok: false, debugId, error: "Missing query param lead_id" });

    // env
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return respond(res, 500, {
        ok: false,
        debugId,
        error: "Missing Supabase envs",
        hasSUP
