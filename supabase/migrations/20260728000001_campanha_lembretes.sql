-- Lembretes agendados de campanha (cadência: -3 dias, -1 dia, no dia...).
-- Reaproveita mensagens_agendadas; adiciona o que falta pra guardar a copy
-- e ligar na campanha. tipo = 'campanha_lembrete'.
alter table mensagens_agendadas
  add column if not exists campanha_id uuid references campanhas(id) on delete cascade,
  add column if not exists conteudo   text,
  add column if not exists foto_url   text;
