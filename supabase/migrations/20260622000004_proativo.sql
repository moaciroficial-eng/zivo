-- Adiciona controle do agente proativo no loja_config
ALTER TABLE loja_config
  ADD COLUMN IF NOT EXISTS proativo_ultimo_run timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proativo_ativo boolean DEFAULT true;
