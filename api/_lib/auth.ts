import type { VercelRequest } from '@vercel/node';

export function getWorkspaceId(req: VercelRequest) {
  return String(
    req.headers?.['x-workspace-id'] ||
    req.headers?.['workspace-id'] ||
    req.headers?.['workspace_id'] ||
    (req.query as any)?.workspace_id ||
    (req.query as any)?.workspaceId ||
    ''
  ).trim();
}

export function getApiToken(req: VercelRequest) {
  return String(req.headers?.['x-api-token'] || '').trim();
}

export function setCors(res: any, extraHeaders: string[] = []) {
  const base = ['Content-Type', 'x-api-token', 'x-workspace-id', 'workspace_id', 'workspace-id', ...extraHeaders];
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', base.join(', '));
}

export function handleOptions(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end('');
    return true;
  }
  return false;
}
