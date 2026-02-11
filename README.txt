ONE ELEVEN — Patch Multi-tenant (Backend)

O que isso faz?
- Trava o backend para que cada usuário só consiga ver dados do workspace dele.
- Impede “hack” de workspace_id via query/header (ex: /api/leads?workspace_id=outro).
- Corrige o endpoint /api/instances para priorizar a tabela wa_instance (hint do Supabase).

Arquivos incluídos:
1) api/_lib/tenantGuard.ts
   - Funções reutilizáveis: CORS + auth + workspace_id + validação de membership.
   - Exige Authorization: Bearer <SUPABASE_ACCESS_TOKEN>.
   - Faz check na tabela workspace_member (workspace_id, user_id).
2) api/instances.ts
   - Lista instâncias do WhatsApp filtradas por workspace_id do usuário.
   - Tenta várias tabelas e começa por wa_instance.
3) api/leads.ts
   - Lista leads filtrados por workspace_id do usuário.
4) api/messages.ts
   - Lista mensagens por lead_id, mas primeiro valida que o lead pertence ao workspace do usuário.

IMPORTANTE (requisito):
- No Supabase, crie e alimente a tabela workspace_member:
  - workspace_id (uuid)
  - user_id (uuid)
Sem isso, o guard vai retornar forbidden_workspace.

Como aplicar:
- Extraia este zip na raiz do seu repo (mesma raiz onde existe a pasta /api).
- Faça commit e push.
- Garanta que as env vars na Vercel existem:
  - API_TOKEN (ou ONEELEVEN_API_TOKEN)
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
