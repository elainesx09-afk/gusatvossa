import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withCors } from './_lib/cors';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (withCors(req, res)) return;

  res.status(200).json({ ok: true, ts: new Date().toISOString() });
}
