-- Suporte à renovação automática de tokens das contas sociais.

-- A rota de publicação carrega todas as contas do usuário de uma vez, e a de
-- validação filtra por plataforma: um índice composto cobre os dois acessos.
create index if not exists social_accounts_user_platform_idx
  on public.social_accounts (user_id, platform);

-- `expires_at` guarda o epoch em milissegundos do vencimento do access token
-- (≈1h no Google, ≈60 dias no token longo da Meta). Quando nulo, o token é
-- tratado como sem validade conhecida e não é renovado preventivamente.
comment on column public.social_accounts.expires_at is
  'Epoch em milissegundos do vencimento do access_token; nulo = validade desconhecida.';

-- O histórico é sempre consultado pelo dono, do mais recente para o mais antigo.
create index if not exists publications_user_created_idx
  on public.publications (user_id, created_at desc);
