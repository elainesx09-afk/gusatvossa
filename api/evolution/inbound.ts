import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function send(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJson(req: VercelRequest) {
  if (typeof req.body === "object" && req.body) return req.body;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve());
    req.on("error", reject);
  });
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  return JSON.parse(raw);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `evo_in_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    if (req.method !== "POST") return send(res, 405, { ok: false, debugId, error: "Method not allowed" });

    // proteção por segredo (opcional)
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET || "";
    if (secret) {
      const got = String(req.headers["x-oneeleven-secret"] || "");
      if (got !== secret) return send(res, 401, { ok: false, debugId, error: "Unauthorized webhook" });
    }

    const sbUrl = process.env.SUPABASE_URL || "";
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!sbUrl || !sbKey) return send(res, 500, { ok: false, debugId, error: "Missing Supabase envs" });
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

    const payload = await readJson(req);

    // Tentativas de achar campos comuns (varia por versão)
    const event =
      payload?.event ||
      payload?.type ||
      payload?.name ||
      payload?.data?.event ||
      null;

    const instance_name =
      payload?.instanceName ||
      payload?.instance ||
      payload?.data?.instanceName ||
      payload?.data?.instance ||
      null;

    // log bruto sempre
    await supabase.from("inbound_events").insert({
      provider: "evolution",
      instance_name,
      event,
      payload,
    });

    // Se vier QR, tenta salvar na wa_instances (se achar)
    const qr =
      payload?.data?.qrcode?.base64 ||
      payload?.qrcode?.base64 ||
      payload?.data?.base64 ||
      null;

    if (qr && instance_name) {
      await supabase
        .from("wa_instances")
        .update({ qr_base64: qr })
        .eq("instance_name", instance_name);
    }

    return send(res, 200, { ok: true, debugId });
  } catch (e: any) {
    return send(res, 500, { ok: false, debugId, error: "Failed", details: { message: e?.message } });
  }
}
