-- Nome amigável do produto — "nome falado", gerado por IA uma vez e
-- cacheado aqui pra nunca precisar gerar de novo. Usado nas mensagens
-- de oportunidade (Painel, /ia, plano diário) no lugar do nome cru do
-- cadastro. Coluna opcional, aditiva — não mexe em dado existente.
alter table public.estoque add column if not exists nome_amigavel text;
