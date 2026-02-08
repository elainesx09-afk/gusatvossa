import type { VercelRequest, VercelResponse } from "@vercel/node";

function send(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function evolutionFetch(path: string) {
  const base = process.env.EVOLUTION_BASE_URL || "";
  const apikey = process.env.EVOLUTION_APIKEY || "";
  if (!base || !apikey) throw new Error("Missing EVOLUTION_BASE_URL or EVOLUTION_APIKEY");

  const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  const r = await fetch(url, { headers: { apikey } });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`Evolution HTTP ${r.status}: ${text}`);
  return json;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `status_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    if (req.method !== "GET") return send(res, 405, { ok: false, debugId, error: "Method not allowed" });

    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return send(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return send(res, 401, { ok: false, debugId, error: "Unauthorized" });

    const instance_name = String(req.query.instance_name || "");
    if (!instance_name) return send(res, 400, { ok: false, debugId, error: "Missing query param instance_name" });

    const state = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instance_name)}`);
    return send(res, 200, { ok: true, debugId, instance_name, state });
  } catch (e: any) {
    return send(res, 500, { ok: false, debugId, error: "Failed", details: { message: e?.message } });
  }
}
