-- Novas categorias de produto: cueca, meia, bone, acessorios.
-- Recria a check constraint com a lista completa (o nome varia entre ambientes).
alter table estoque drop constraint if exists estoque_categoria_check;
alter table estoque drop constraint if exists estoque_categoria_ch;

alter table estoque
  add constraint estoque_categoria_check
  check (categoria in (
    'camiseta', 'blusa', 'camisa', 'polo', 'regata',
    'calca', 'bermuda', 'tenis', 'chinelo',
    'cueca', 'meia', 'bone', 'acessorios', 'outros'
  ));
