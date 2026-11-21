-- Preço promocional do produto (sobrepõe preco_venda enquanto válido)
alter table estoque add column if not exists preco_promocional numeric(12,2);
alter table estoque add column if not exists promocao_valida_until date;

-- ─── ofertas ──────────────────────────────────────────────────────────────
-- Registro de cada envio de fotos (direto ou encaminhado), pra poder "copiar
-- oferta" depois e reaproveitar peças + tamanhos + preço de/por.
create table if not exists ofertas (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  contato_id       uuid        references whatsapp_contatos(id) on delete set null,
  cliente_id       uuid        references clientes(id) on delete set null,
  origem_oferta_id uuid        references ofertas(id) on delete set null,
  pecas            jsonb       not null default '[]',
  status           text        not null default 'enviada'
                     check (status in ('enviada', 'aguardando_resposta', 'cancelada')),
  template_enviado text,
  created_at       timestamptz not null default now()
);

create index if not exists ofertas_user_id_idx on ofertas(user_id);
create index if not exists ofertas_contato_id_idx on ofertas(contato_id);

alter table ofertas enable row level security;
create policy ofertas_rls on ofertas for all using (user_id = auth.uid()) with check (user_id = auth.uid());
