import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `mock_smoke_${Date.now()}`;

  // token
  const token = String(req.headers["x-api-token"] || "");
  if (!process.env.API_TOKEN) return res.status(500).json({ ok: false, debugId, error: "Missing env API_TOKEN" });
  if (token !== process.env.API_TOKEN) return res.status(401).json({ ok: false, debugId, error: "Unauthorized" });

  // echo do body
  return res.status(200).json({
    ok: true,
    debugId,
    method: req.method,
    bodyType: typeof (req as any).body,
    body: (req as any).body ?? null,
  });
}
