-- ── Módulo fiscal (NFC-e) — Fase 1: configuração ────────────────────────────
-- Guarda os dados fiscais da loja pra emitir cupom fiscal (NFC-e) na venda.
-- Emissão em si é a Fase 2 (via gateway, ex.: Nuvem Fiscal).

alter table loja_config
  add column if not exists fiscal_ativo          boolean default false,
  add column if not exists fiscal_cnpj           text,
  add column if not exists fiscal_razao_social   text,
  add column if not exists fiscal_ie             text,
  add column if not exists fiscal_regime         text default 'simples',   -- simples | presumido | real
  add column if not exists fiscal_csc            text,   -- Código de Segurança do Contribuinte (NFC-e)
  add column if not exists fiscal_csc_id         text,   -- id/token do CSC (idToken)
  add column if not exists fiscal_ambiente       text default 'homologacao', -- homologacao | producao
  add column if not exists fiscal_cep            text,
  add column if not exists fiscal_logradouro     text,
  add column if not exists fiscal_numero         text,
  add column if not exists fiscal_bairro         text,
  add column if not exists fiscal_municipio      text,
  add column if not exists fiscal_uf             text,
  add column if not exists fiscal_cod_municipio  text,   -- código IBGE do município (7 díg.)
  add column if not exists fiscal_cert_path      text,   -- caminho do .pfx no bucket privado
  add column if not exists fiscal_cert_senha     text,   -- senha do certificado (segredo)
  add column if not exists fiscal_cert_validade  date;   -- validade do certificado (aviso)

-- Bucket PRIVADO pro certificado digital (.pfx). Nunca público.
insert into storage.buckets (id, name, public)
values ('certificados', 'certificados', false)
on conflict (id) do nothing;

-- Só o dono acessa o próprio certificado (path começa com o user_id).
-- O service-role (emissão no servidor) ignora RLS e lê normalmente.
drop policy if exists "cert dono le" on storage.objects;
create policy "cert dono le" on storage.objects for select
  using (bucket_id = 'certificados' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cert dono grava" on storage.objects;
create policy "cert dono grava" on storage.objects for insert
  with check (bucket_id = 'certificados' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cert dono atualiza" on storage.objects;
create policy "cert dono atualiza" on storage.objects for update
  using (bucket_id = 'certificados' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cert dono apaga" on storage.objects;
create policy "cert dono apaga" on storage.objects for delete
  using (bucket_id = 'certificados' and (storage.foldername(name))[1] = auth.uid()::text);
