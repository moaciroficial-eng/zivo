-- Forma de pagamento na venda
alter table vendas add column if not exists forma_pagamento text;

-- Código de barras no estoque (para o scanner)
alter table estoque add column if not exists codigo_barras text;
create index if not exists estoque_codigo_barras_idx on estoque(codigo_barras) where codigo_barras is not null;
