// ===== POST: inserir mensagem =====
if (req.method === "POST") {
  const body = safeJson((req as any).body);

  const workspaceId = String(body.workspace_id || "");
  const leadId = String(body.lead_id || "");
  const direction = String(body.direction || "in"); // in | out
  const text = String(body.text || "");

  if (!workspaceId) return respond(res, 400, { ok: false, debugId, error: "Missing body.workspace_id" });
  if (!leadId) return respond(res, 400, { ok: false, debugId, error: "Missing body.lead_id" });
  if (!direction) return respond(res, 400, { ok: false, debugId, error: "Missing body.direction" });

  const payload = {
    workspace_id: workspaceId,
    lead_id: leadId,
    direction,
    text: text || null,
    // message_type e created_at ficam no default
  };

  const ins = supabase.from("message").insert(payload).select("*").single();
  const { data, error } = await withTimeout(ins, 2500, "POST insert message");

  if (error) {
    return respond(res, 500, { ok: false, debugId, error: error.message, details: error });
  }

  return respond(res, 200, { ok: true, debugId, inserted: data });
}
