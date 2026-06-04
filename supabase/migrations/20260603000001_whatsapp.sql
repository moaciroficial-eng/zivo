-- Execute no SQL Editor do Supabase

create table if not exists whatsapp_contatos (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null references auth.users(id) on delete cascade,
  phone               text          not null,
  nome                text,
  foto_url            text,
  ultima_mensagem     text,
  ultima_mensagem_at  timestamptz,
  nao_lidas           int           not null default 0,
  created_at          timestamptz   not null default now(),
  unique(user_id, phone)
);

create table if not exists whatsapp_mensagens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null,
  contato_id  uuid        not null references whatsapp_contatos(id) on delete cascade,
  message_id  text        unique,
  direcao     text        not null check (direcao in ('recebida', 'enviada')),
  tipo        text        not null default 'texto',
  conteudo    text,
  status      text        not null default 'enviada',
  timestamp   timestamptz not null default now(),
  raw         jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists whatsapp_mensagens_contato_ts
  on whatsapp_mensagens(contato_id, timestamp desc);

create index if not exists whatsapp_contatos_user_ts
  on whatsapp_contatos(user_id, ultima_mensagem_at desc nulls last);

-- RLS
alter table whatsapp_contatos  enable row level security;
alter table whatsapp_mensagens enable row level security;

drop policy if exists "Users own contatos" on whatsapp_contatos;
create policy "Users own contatos" on whatsapp_contatos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users own mensagens" on whatsapp_mensagens;
create policy "Users own mensagens" on whatsapp_mensagens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table whatsapp_contatos;
alter publication supabase_realtime add table whatsapp_mensagens;
