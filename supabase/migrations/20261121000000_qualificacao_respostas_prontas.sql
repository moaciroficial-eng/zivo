-- Qualificação automática (3 perguntas) + Respostas prontas
-- Aprovado pelo dono em 2026-11-21.

-- Estado do fluxo de qualificação -- 1 linha por contato (sempre a execução mais recente)
create table if not exists whatsapp_qualificacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contato_id uuid not null references whatsapp_contatos(id) on delete cascade,
  status text not null default 'aguardando_categoria', -- aguardando_categoria | aguardando_tamanho | aguardando_preferencia | concluido | cancelado
  categoria text,
  tamanho text,
  preferencia text,
  origem text,            -- live | campanha | organico
  iniciado_at timestamptz not null default now(),
  concluido_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (contato_id)
);
alter table whatsapp_qualificacao enable row level security;
create policy "user_qualificacao" on whatsapp_qualificacao
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Destaque "Lead qualificado" na lista de conversas
alter table whatsapp_contatos add column if not exists lead_qualificado boolean not null default false;

-- Atribuição de origem (pra aparecer depois na venda) + preferência de estampa
alter table clientes add column if not exists origem_lead text;         -- live | campanha | organico
alter table clientes add column if not exists preferencia_estampa text; -- lisa | estampada | tanto_faz

-- Liga/desliga do fluxo de qualificação (toggle na tela do WhatsApp)
alter table loja_config add column if not exists qualificacao_ativa boolean not null default true;

-- Respostas prontas
create table if not exists respostas_prontas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  atalho text not null,
  texto text not null,
  botoes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table respostas_prontas enable row level security;
create policy "user_respostas_prontas" on respostas_prontas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
