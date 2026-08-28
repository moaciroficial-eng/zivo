-- Domínio próprio do clube (ex: clubemoca.com.br) → abre direto a vitrine da loja.
-- O proxy resolve o host pra clube_slug e faz o rewrite pra /clube/<slug>.
alter table loja_config add column if not exists clube_dominio text;

-- Busca por domínio precisa ser rápida e única (um domínio = uma loja).
create unique index if not exists loja_config_clube_dominio_key
  on loja_config (clube_dominio) where clube_dominio is not null;
