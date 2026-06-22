-- Recria tabela metas com schema correto (mes int + ano int + meta_faturamento)
-- A versão antiga tinha mes text ('YYYY-MM') e valor_meta — incompatível com os agentes

DROP TABLE IF EXISTS metas CASCADE;

CREATE TABLE metas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes                 int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano                 int  NOT NULL,
  meta_faturamento    numeric(12,2),
  meta_vendas         int,
  meta_clientes_novos int,
  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mes, ano)
);

ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_metas" ON metas
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
