-- Bucket de fotos da biblioteca + políticas de storage.
-- O bucket foi criado manualmente no painel (sem migration), então as
-- políticas de upload/leitura podiam estar faltando — foto não salvava.

-- 1. Garante o bucket 'biblioteca' e que ele é PÚBLICO (a URL da foto abre)
insert into storage.buckets (id, name, public)
values ('biblioteca', 'biblioteca', true)
on conflict (id) do update set public = true;

-- 2. Políticas em storage.objects para o bucket 'biblioteca'
--    Leitura pública (a foto aparece pra qualquer um com a URL);
--    escrita/edição/remoção só para usuário logado.
drop policy if exists "biblioteca leitura publica" on storage.objects;
create policy "biblioteca leitura publica" on storage.objects
  for select to public
  using (bucket_id = 'biblioteca');

drop policy if exists "biblioteca upload logado" on storage.objects;
create policy "biblioteca upload logado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'biblioteca');

drop policy if exists "biblioteca update logado" on storage.objects;
create policy "biblioteca update logado" on storage.objects
  for update to authenticated
  using (bucket_id = 'biblioteca');

drop policy if exists "biblioteca delete logado" on storage.objects;
create policy "biblioteca delete logado" on storage.objects
  for delete to authenticated
  using (bucket_id = 'biblioteca');
