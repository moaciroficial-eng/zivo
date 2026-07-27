-- Campanha SEM foto: quando o cliente responder, o atendimento envia
-- automaticamente as fotos do(s) produto(s) da campanha (da biblioteca).
-- Guardamos as URLs pendentes no contato; o atendimento manda e limpa.
alter table whatsapp_contatos
  add column if not exists fotos_pendentes jsonb not null default '[]'::jsonb;
