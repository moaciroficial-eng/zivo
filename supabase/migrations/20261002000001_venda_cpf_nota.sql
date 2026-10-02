-- CPF do cliente pra sair no cupom fiscal (quando ele pede "CPF na nota").
-- Opcional por venda; sem ele o cupom sai como "consumidor não identificado".
alter table public.vendas add column if not exists cpf_nota text;
