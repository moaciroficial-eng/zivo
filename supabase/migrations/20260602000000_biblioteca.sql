-- Biblioteca digital de fotos de produtos
create table if not exists biblioteca_fotos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  url           text not null,
  storage_path  text not null,
  modelo        text not null,
  marca         text,
  estoque_ids   uuid[] default '{}',
  created_at    timestamptz default now()
);

alter table biblioteca_fotos enable row level security;

drop policy if exists "users own biblioteca_fotos" on biblioteca_fotos;
create policy "users own biblioteca_fotos"
  on biblioteca_fotos for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists biblioteca_fotos_user_idx on biblioteca_fotos(user_id);
create index if not exists biblioteca_fotos_modelo_idx on biblioteca_fotos(user_id, modelo);
