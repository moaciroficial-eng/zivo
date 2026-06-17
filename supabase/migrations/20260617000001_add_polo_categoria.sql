alter table estoque
  drop constraint if exists estoque_categoria_check;

alter table estoque
  add constraint estoque_categoria_check
  check (categoria in ('camiseta', 'regata', 'calca', 'polo', 'tenis', 'chinelo', 'outros'));
