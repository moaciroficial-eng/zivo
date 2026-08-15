-- Checkout do Clube via Mercado Pago (por loja).
alter table loja_config
  add column if not exists mp_access_token text;   -- Access Token do Mercado Pago da loja

-- Pedidos do clube (pagamento online)
create table if not exists clube_pedidos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  estoque_id     uuid,
  produto_nome   text,
  tamanho        text,
  valor          numeric,
  email_membro   text,
  status         text default 'pendente',   -- pendente | pago | cancelado
  mp_preference_id text,
  mp_payment_id    text,
  criado_em      timestamptz default now()
);

alter table clube_pedidos enable row level security;
drop policy if exists "user_own_clube_pedidos" on clube_pedidos;
create policy "user_own_clube_pedidos" on clube_pedidos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
