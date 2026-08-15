-- Clube de Oportunidades: vitrine VIP (login por email) de produtos parados
-- que o dono seleciona pra desovar com preço de oportunidade.

-- Flag + preço de oportunidade no produto
alter table estoque
  add column if not exists oportunidade boolean default false,
  add column if not exists preco_oportunidade numeric;

-- Config do clube por loja
alter table loja_config
  add column if not exists clube_ativo boolean default false,
  add column if not exists clube_slug text,             -- token secreto na URL do site
  add column if not exists clube_cadastro_aberto boolean default true;

-- Membros VIP (auto-cadastro pelo convite). Email é o login.
create table if not exists clube_membros (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,          -- loja dona do clube
  email       text not null,
  nome        text,
  telefone    text,
  cliente_id  uuid,
  criado_em   timestamptz default now()
);

-- unicidade por loja+email (case-insensitive) precisa ser ÍNDICE (expressão)
create unique index if not exists clube_membros_user_email_uidx
  on clube_membros (user_id, lower(email));

alter table clube_membros enable row level security;
drop policy if exists "user_own_clube_membros" on clube_membros;
create policy "user_own_clube_membros" on clube_membros
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Slug único por loja (gera pra quem ainda não tem)
create unique index if not exists loja_config_clube_slug_uidx on loja_config (clube_slug) where clube_slug is not null;
