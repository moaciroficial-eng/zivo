-- Tamanhos EXTRAS por marca (além do padrão da categoria).
-- Ex.: TXC usa 2XG/3XG, Damyller usa EGG. Preenchido pelo dono ("+")
-- e auto-aprendido ao importar NF-e com tamanho ainda não conhecido.
alter table marcas
  add column if not exists tamanhos text[];
