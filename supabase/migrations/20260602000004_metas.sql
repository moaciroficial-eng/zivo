-- Execute no SQL Editor do Supabase
create table if not exists metas (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null,
  mes                 text          not null,          -- 'YYYY-MM'
  valor_meta          numeric(12,2) not null,
  plano               jsonb,                           -- plano gerado pela IA
  plano_gerado_em     timestamptz,
  plano_vendido_base  numeric(12,2),                   -- vendas no momento da geração
  created_at          timestamptz   default now(),
  unique(user_id, mes)
);

alter table metas enable row level security;

drop policy if exists "Users manage own metas" on metas;
create policy "Users manage own metas" on metas
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
