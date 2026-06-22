-- Adiciona colunas de perfil de marca ao contato_insights
ALTER TABLE contato_insights
  ADD COLUMN IF NOT EXISTS marcas_favoritas  jsonb    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS marca_principal   text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fidelidade_marca  text     DEFAULT 'sem_historico';
