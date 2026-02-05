const msgPayload = {
  workspace_id: workspaceId,
  lead_id: createdLead.id,
  direction: "in",
  text,
  // message_type default 'text'
  // created_at default now()
};

const { data: msg, error: msgErr } = await supabase
  .from("message")
  .insert(msgPayload)
  .select("*")
  .single();

return respond(res, 200, {
  ok: true,
  debugId,
  lead: createdLead,
  message: msgErr ? { ok: false, error: msgErr.message } : { ok: true, data: msg },
});
