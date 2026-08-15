-- Personalização do clube + combos (produto isca condicionado)
alter table loja_config
  add column if not exists logo_url text,               -- logo da loja no site do clube
  add column if not exists clube_como_comprar text;     -- texto "como comprar" no rodapé

alter table estoque
  add column if not exists combo boolean default false,      -- é combo/isca?
  add column if not exists combo_texto text;                 -- condição (ex.: "levando uma camiseta")
