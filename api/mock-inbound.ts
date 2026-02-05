// 2) insere message no schema REAL: table=message col=lead_id
const now = new Date().toISOString();

const msgPayloads: any[] = [
  { lead_id: createdLead.id, text, from, created_at: now },
  { lead_id: createdLead.id, message: text, from, created_at: now },
  { lead_id: createdLead.id, body: text, from, created_at: now },
  { lead_id: createdLead.id, text, from },
];

let createdMsg: any = null;
let lastMsgErr: any = null;

for (const mp of msgPayloads) {
  const { data, error } = await supabase.from("message").insert(mp).select("*").single();
  if (!error) {
    createdMsg = data;
    break;
  }
  lastMsgErr = error;
}

// retorna ok mesmo se message falhar, mas com motivo
return respond(res, 200, {
  ok: true,
  debugId,
  lead: createdLead,
  message: createdMsg
    ? { ok: true, data: createdMsg }
    : { ok: false, error: lastMsgErr?.message ?? "Could not insert message into table 'message'" },
});
