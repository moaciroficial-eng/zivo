-- Anotações livres do dono sobre o negócio (como está o mês, o que pegou, ideias).
-- A IA (consultora de campanhas / gerador de campanha) lê isso como contexto
-- pra bolar estratégia — principalmente quando o mês vem fraco.
alter table loja_config add column if not exists anotacoes_dono text;
