-- Execute no SQL Editor do Supabase

ALTER TABLE estoque
  ADD COLUMN IF NOT EXISTS condicional_com    TEXT,
  ADD COLUMN IF NOT EXISTS condicional_tel    TEXT,
  ADD COLUMN IF NOT EXISTS condicional_desde  TIMESTAMPTZ;
