-- Multi-tenant: cada loja tem sua própria configuração de WhatsApp.
-- Colunas nullable — loja sem credencial própria cai no env global (Moca),
-- então nada quebra na loja original.

alter table loja_config
  add column if not exists zapi_instance_id  text,
  add column if not exists zapi_token         text,
  add column if not exists zapi_client_token  text,
  -- liga/desliga o processamento automático da loja (crons, proativo)
  add column if not exists processamento_ativo boolean not null default true;

-- Índice pra os crons varrerem só as lojas ativas rapidamente
create index if not exists loja_config_ativas_idx
  on loja_config (user_id) where processamento_ativo = true;
