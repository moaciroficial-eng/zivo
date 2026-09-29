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

-- Oficina da CENTRAL: nenhuma loja lê os erros. Sem policy de SELECT + RLS on
-- = clientes não acessam nada via API. Só o service-role (canal do fundador,
-- /admin/erros) lê, e ele ignora RLS. Escrita também é só via service-role.
drop policy if exists "erros do dono" on app_erros;
