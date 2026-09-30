-- Notas fiscais (NFC-e) emitidas pela Focus NFe.
-- Uma linha por tentativa de emissão, ligada à venda.
create table if not exists notas_fiscais (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  venda_id      uuid,
  ref           text not null,               -- id único da nota do nosso lado (idempotência)
  ambiente      text not null default 'homologacao',
  status        text not null default 'processando', -- processando|autorizado|erro|cancelado
  numero        text,
  chave         text,
  url_danfe     text,
  url_xml       text,
  mensagem      text,                         -- erro/observação da SEFAZ
  raw           jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists notas_fiscais_ref_key on notas_fiscais (user_id, ref);
create index if not exists notas_fiscais_venda_idx on notas_fiscais (venda_id);

alter table notas_fiscais enable row level security;

drop policy if exists "notas do dono le" on notas_fiscais;
create policy "notas do dono le" on notas_fiscais for select
  using (auth.uid() = user_id);
