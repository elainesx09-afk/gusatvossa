async function evolutionFetch(path: string, init: RequestInit) {
  const base =
    process.env.EVOLUTION_BASE_URL ||
    process.env.EVOLUTION_URL ||
    process.env.EVOLUTION_BASE ||
    "";

  const apikey =
    process.env.EVOLUTION_APIKEY ||
    process.env.EVOLUTION_API_KEY ||
    process.env.EVOLUTION_KEY ||
    "";

  if (!base || !apikey) {
    const err: any = new Error("EVOLUTION_NOT_CONFIGURED");
    err.code = "EVOLUTION_NOT_CONFIGURED";
    return { __demo__: true, reason: "Missing EVOLUTION_BASE_URL / EVOLUTION_APIKEY" };
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
