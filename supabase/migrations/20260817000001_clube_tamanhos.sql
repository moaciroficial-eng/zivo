-- Tamanhos que entram na oferta do Clube por produto.
-- NULL = todos os tamanhos em estoque são oferecidos (comportamento padrão).
-- Lista explícita = só esses tamanhos aparecem na vitrine pro cliente.
alter table estoque add column if not exists clube_tamanhos text[];
