-- Remove o agendamento ANTIGO de pós-venda.
-- O agradecimento agora é enviado NA HORA por /api/pos-venda (window-aware:
-- quente = texto, frio = template). O gatilho abaixo criava uma mensagem
-- agendada redundante 5 min após cada venda (texto livre, que falhava pra
-- cliente frio e, com o cron ligado, mandaria agradecimento duplicado).
drop trigger if exists trigger_agendar_pos_venda on vendas;
drop function if exists agendar_pos_venda();

-- Drena os agendamentos pos_venda que ficaram pendentes (nunca dispararam;
-- o cron não processa mais esse tipo). Não mexe nos lembretes de campanha.
delete from mensagens_agendadas where tipo = 'pos_venda' and enviada = false;
