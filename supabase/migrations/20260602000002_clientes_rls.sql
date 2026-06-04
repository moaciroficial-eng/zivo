-- Execute no SQL Editor do Supabase caso a tabela clientes ainda não tenha RLS
alter table clientes enable row level security;

drop policy if exists "Users manage own clientes" on clientes;

create policy "Users manage own clientes" on clientes
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
