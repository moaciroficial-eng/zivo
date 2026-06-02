-- Execute no SQL Editor do Supabase

create table if not exists caixas (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null,
  data_abertura       timestamptz   not null default now(),
  troco_inicial       numeric(12,2) not null default 0,
  data_fechamento     timestamptz,
  total_vendas        numeric(12,2),
  resumo_pagamentos   jsonb,         -- { pix: x, dinheiro: y, credito: z, debito: w }
  valor_esperado      numeric(12,2), -- troco_inicial + vendas em dinheiro
  valor_contado       numeric(12,2), -- informado pelo operador
  diferenca           numeric(12,2), -- valor_contado - valor_esperado
  observacoes         text,
  status              text          not null default 'aberto',
  created_at          timestamptz   default now()
);

alter table caixas enable row level security;

create policy "Users manage own caixas" on caixas
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Vincula cada venda ao caixa em que foi registrada
alter table vendas add column if not exists caixa_id uuid references caixas(id);
