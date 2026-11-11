-- Compra para — quem o cliente costuma comprar pra (ele mesmo, namorado(a),
-- marido, esposa, filhos, presente em geral). Coluna opcional, aditiva —
-- não mexe em dado existente. Preenchida automaticamente pelo motor de
-- oportunidades (olhando o histórico de vendas marcadas como presente) só
-- quando ainda está vazia; nunca sobrescreve um valor que o dono já setou.
alter table public.clientes add column if not exists compra_para text;
