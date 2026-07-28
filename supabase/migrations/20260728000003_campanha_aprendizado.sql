-- Guarda os atributos de cada campanha pra a IA APRENDER o que funciona
-- (tom agressivo vs suave, com/sem desconto, com/sem foto). Sem isso não dá
-- pra correlacionar conversão com a estratégia usada.
alter table campanhas
  add column if not exists intensidade text,     -- 'leve' | 'agressiva'
  add column if not exists desconto    text,     -- ex '20%', 'R$50' ou null
  add column if not exists com_foto    boolean default false,
  add column if not exists publico_criterio text; -- 'tamanho' | 'todos' | 'ativos' | ...
