-- WhatsApp oficial da Meta (Cloud API) por loja.
-- Cada loja escolhe o provedor: 'zapi' (legado) ou 'meta' (oficial).
-- Colunas nullable — loja sem credencial própria cai no env global.

alter table loja_config
  -- 'zapi' | 'meta' — qual gateway a loja usa pra enviar/receber
  add column if not exists whatsapp_provider   text not null default 'zapi',
  -- Credenciais da Meta Cloud API
  add column if not exists meta_phone_number_id text,
  add column if not exists meta_access_token    text,
  add column if not exists meta_waba_id         text;

-- Índice pra o webhook da Meta resolver a loja pelo phone_number_id
-- que chega no payload (a Meta diz qual número recebeu a mensagem).
create index if not exists loja_config_meta_phone_idx
  on loja_config (meta_phone_number_id) where meta_phone_number_id is not null;
