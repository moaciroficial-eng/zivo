-- Captura de erros do app (Sentry caseiro): quando algo quebra no servidor,
-- registra aqui pra o dono ter visibilidade — sem serviço externo nem custo.
create table if not exists app_erros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  rota        text,
  mensagem    text,
  stack       text,
  contexto    jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists app_erros_criado_idx on app_erros (criado_em desc);
create index if not exists app_erros_user_idx on app_erros (user_id);

alter table app_erros enable row level security;

-- Só o dono lê os próprios erros (e os de sistema, sem user). Escrita é via
-- service-role (o logErro roda no servidor), que ignora RLS.
drop policy if exists "erros do dono" on app_erros;
create policy "erros do dono" on app_erros for select
  using (auth.uid() = user_id or user_id is null);
