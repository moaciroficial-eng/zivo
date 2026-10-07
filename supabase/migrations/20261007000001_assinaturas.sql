-- Assinatura de cada loja (SaaS). Uma por dono. Começa em teste grátis;
-- vira "ativa" quando o pagamento recorrente é aprovado no gateway, e
-- "inadimplente" quando falha. O bloqueio só é aplicado se BILLING_ENFORCE
-- estiver ligado (pra não travar ninguém antes de a cobrança existir).

create table if not exists public.assinaturas (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  plano               text,                 -- essencial | pro | null
  status              text not null default 'trial',  -- trial | ativa | inadimplente | cancelada
  trial_ate           timestamptz not null default (now() + interval '14 days'),
  gateway             text,                 -- mercadopago | ...
  gateway_sub_id      text,                 -- id da assinatura (preapproval) no gateway
  proximo_vencimento  timestamptz,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

alter table public.assinaturas enable row level security;

drop policy if exists "assinatura own select" on public.assinaturas;
drop policy if exists "assinatura own insert" on public.assinaturas;
drop policy if exists "assinatura own update" on public.assinaturas;

create policy "assinatura own select" on public.assinaturas
  for select using (auth.uid() = user_id);
create policy "assinatura own insert" on public.assinaturas
  for insert with check (auth.uid() = user_id);
create policy "assinatura own update" on public.assinaturas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
