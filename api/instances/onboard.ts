import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function send(res: VercelResponse, status: number, payload: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function getBaseUrl(req: VercelRequest) {
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  const host = String(req.headers["x-forwarded-host"] || req.headers["host"] || "");
  return `${proto}://${host}`;
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

async function evolutionFetch(path: string, init: RequestInit) {
  const base = process.env.EVOLUTION_BASE_URL || "";
  const apikey = process.env.EVOLUTION_APIKEY || "";
  if (!base || !apikey) {
    throw new Error("Missing EVOLUTION_BASE_URL or EVOLUTION_APIKEY");
  }

  const url = `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey,
      ...(init.headers || {}),
    },
  });

  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!r.ok) {
    const err = new Error(`Evolution HTTP ${r.status}`);
    (err as any).status = r.status;
    (err as any).body = json;
    throw err;
  }
  return json;
}

function pickQrBase64(anyResp: any): string | null {
  // Varia por versão; tentamos alguns formatos comuns
  return (
    anyResp?.qrcode?.base64 ||
    anyResp?.qrcode?.qr ||
    anyResp?.qr?.base64 ||
    anyResp?.qrCode?.base64 ||
    anyResp?.base64 ||
    null
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debugId = `onboard_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  try {
    if (req.method !== "POST") return send(res, 405, { ok: false, debugId, error: "Method not allowed" });

    // auth
    const token = String(req.headers["x-api-token"] || "");
    if (!process.env.API_TOKEN) return send(res, 500, { ok: false, debugId, error: "Missing env API_TOKEN" });
    if (token !== process.env.API_TOKEN) return send(res, 401, { ok: false, debugId, error: "Unauthorized" });

    const body = await readJson(req);
    const workspace_id = String(body?.workspace_id || "");
    let instance_name = String(body?.instance_name || "");

    if (!workspace_id) return send(res, 400, { ok: false, debugId, error: "Missing workspace_id" });

    // default instance name (determinístico)
    if (!instance_name) instance_name = `oneeleven_${workspace_id.slice(0, 8)}`;

    // supabase
    const sbUrl = process.env.SUPABASE_URL || "";
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!sbUrl || !sbKey) return send(res, 500, { ok: false, debugId, error: "Missing Supabase envs" });
    const supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } });

    const baseUrl = getBaseUrl(req);
    const webhookUrl = `${baseUrl}/api/evolution/inbound`;

    const events = ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"];
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET || "";

    // 1) cria instância (se já existir, a API pode retornar erro -> seguimos mesmo assim)
    const createPayload: any = {
      instanceName: instance_name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events,
        ...(webhookSecret
          ? { headers: { "x-oneeleven-secret": webhookSecret, "Content-Type": "application/json" } }
          : {}),
      },
    };

    let created: any = null;
    try {
      created = await evolutionFetch("/instance/create", { method: "POST", body: JSON.stringify(createPayload) });
    } catch (e: any) {
      // Se já existe, ok. Guardamos erro só pra debug.
      created = { createError: { status: e?.status, body: e?.body, message: e?.message } };
    }

    // 2) força geração do QR (connect)
    const connected = await evolutionFetch(`/instance/connect/${encodeURIComponent(instance_name)}`, { method: "GET" });

    // 3) status
    const state = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instance_name)}`, { method: "GET" });

    const qr = pickQrBase64(connected) || pickQrBase64(created);

    // 4) persist
    const { error: upsertErr } = await supabase
      .from("wa_instances")
      .upsert(
        {
          workspace_id,
          provider: "evolution",
          instance_name,
          status: String(state?.state || state?.status || "unknown"),
          webhook_url: webhookUrl,
          webhook_events: events,
          qr_base64: qr,
          last_connection_state: state,
        },
        { onConflict: "workspace_id,instance_name" }
      );

    if (upsertErr) {
      return send(res, 500, { ok: false, debugId, error: "Supabase upsert failed", details: upsertErr });
    }

    return send(res, 200, {
      ok: true,
      debugId,
      workspace_id,
      instance_name,
      webhookUrl,
      state,
      qr_base64: qr,
      note:
        "Se qr_base64 vier null, espere o evento QRCODE_UPDATED (webhook) ou chame /api/instances/qr para tentar novamente.",
    });
  } catch (e: any) {
    return send(res, 500, { ok: false, debugId, error: "Unhandled exception", details: { message: e?.message, stack: e?.stack } });
  }
}
