-- Log das oportunidades geradas pelo motor (snapshot diário) — base do
-- APRENDIZADO: cruzando com as vendas reais, o motor descobre QUAL tipo de
-- oportunidade converte mais NESTA loja e reponderao o score sozinho.

create table if not exists public.oportunidades_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  cliente_id  uuid,
  produto_id  uuid,
  marca       text,
  tipo        text,          -- fa_marca | reativacao | girar_desconto | novidade | match
  score       int,
  criado_em   timestamptz not null default now()
);

create index if not exists oportunidades_log_user_idx on public.oportunidades_log (user_id, criado_em);

alter table public.oportunidades_log enable row level security;

drop policy if exists "oplog own select" on public.oportunidades_log;
drop policy if exists "oplog own insert" on public.oportunidades_log;
drop policy if exists "oplog own delete" on public.oportunidades_log;

create policy "oplog own select" on public.oportunidades_log
  for select using (auth.uid() = user_id);
create policy "oplog own insert" on public.oportunidades_log
  for insert with check (auth.uid() = user_id);
create policy "oplog own delete" on public.oportunidades_log
  for delete using (auth.uid() = user_id);
