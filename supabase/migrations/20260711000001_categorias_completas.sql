-- A UI oferece 10 categorias, mas a check constraint do estoque ficou numa
-- versão antiga sem 'camisa', 'blusa' e 'bermuda' — salvar produto nessas
-- categorias falhava com "violates check constraint".
-- (Em produção a constraint aparece como "estoque_categoria_ch";
--  nas migrations antigas como "estoque_categoria_check" — derruba as duas.)

alter table estoque drop constraint if exists estoque_categoria_check;
alter table estoque drop constraint if exists estoque_categoria_ch;

alter table estoque
  add constraint estoque_categoria_check
  check (categoria in (
    'camiseta', 'blusa', 'camisa', 'polo', 'regata',
    'calca', 'bermuda', 'tenis', 'chinelo', 'outros'
  ));
