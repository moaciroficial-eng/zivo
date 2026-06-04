-- Initial schema: creates all base tables for the Zivo project.
-- All subsequent migrations (20260601+) alter these tables via ADD COLUMN IF NOT EXISTS,
-- so this file must sort before them (filename 20260530 < 20260601).

create extension if not exists "pgcrypto";

-- ─── clientes ────────────────────────────────────────────────────────────────
create table if not exists clientes (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  nome             text        not null,
  telefone         text,
  email            text,
  tamanho_camiseta text,
  tamanho_calca    text,
  tamanho_tenis    text,
  data_nascimento  text,
  dia_pagamento    integer,
  observacoes      text,
  created_at       timestamptz not null default now()
);

-- ─── marcas ──────────────────────────────────────────────────────────────────
create table if not exists marcas (
  id         uuid          primary key default gen_random_uuid(),
  user_id    uuid          references auth.users(id) on delete cascade,
  nome       text          not null,
  markup     numeric(10,2) not null,
  created_at timestamptz   not null default now()
);

-- ─── estoque ─────────────────────────────────────────────────────────────────
-- Note: status, nfe_grupo_id, codigo_barras, condicional_* columns are added
-- in later migrations (20260601_conferencia, 20260602_vendas_pagamento_desconto,
-- 20260602_condicional).
create table if not exists estoque (
  id             uuid          primary key default gen_random_uuid(),
  user_id        uuid          not null references auth.users(id) on delete cascade,
  nome           text          not null,
  marca          text,
  codigo_produto text,
  cor            text,
  categoria      text          not null default 'outros'
                   check (categoria in ('camiseta', 'regata', 'calca', 'tenis', 'outros')),
  tamanhos       jsonb         not null default '[]',
  preco_custo    numeric(12,2),
  preco_venda    numeric(12,2),
  ncm            text,
  cfop           text,
  icms           text,
  pis            text,
  cofins         text,
  cest           text,
  created_at     timestamptz   not null default now()
);

-- ─── vendas ──────────────────────────────────────────────────────────────────
-- Note: forma_pagamento is added in 20260602_vendas_pagamento_desconto.
-- Note: caixa_id is added in 20260602_caixas.
create table if not exists vendas (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references auth.users(id) on delete cascade,
  cliente_id   uuid          references clientes(id) on delete set null,
  cliente_nome text          not null default 'Avulso',
  valor        numeric(12,2) not null,
  data_venda   text          not null,
  produtos     jsonb         not null default '[]',
  created_at   timestamptz   not null default now()
);

-- ─── eventos ─────────────────────────────────────────────────────────────────
create table if not exists eventos (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  nome       text        not null,
  data       text        not null,
  descricao  text,
  created_at timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- clientes RLS is re-applied in 20260602_clientes_rls.sql (drop+recreate), so it
-- is safe to enable it here too.
alter table clientes enable row level security;
alter table marcas   enable row level security;
alter table estoque  enable row level security;
alter table vendas   enable row level security;
alter table eventos  enable row level security;

drop policy if exists "Users manage own clientes" on clientes;
create policy "Users manage own clientes" on clientes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own marcas" on marcas;
create policy "Users manage own marcas" on marcas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own estoque" on estoque;
create policy "Users manage own estoque" on estoque
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own vendas" on vendas;
create policy "Users manage own vendas" on vendas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own eventos" on eventos;
create policy "Users manage own eventos" on eventos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
