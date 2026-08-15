-- Carrinho: o pedido do clube passa a guardar VÁRIOS itens
alter table clube_pedidos
  add column if not exists itens jsonb;   -- [{estoque_id, nome, tamanho, valor}]
