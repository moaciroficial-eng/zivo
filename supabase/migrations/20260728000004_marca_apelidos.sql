-- Apelidos da marca: emitentes de nota que mapeiam pra uma marca já existente.
-- Ex: a nota da Aramis vem como "VCI VANGUARD" — em vez de virar marca nova
-- e rachar os dados, o dono diz uma vez que "VCI VANGUARD" = Aramis e fica salvo.
alter table marcas
  add column if not exists apelidos text[] not null default '{}';
