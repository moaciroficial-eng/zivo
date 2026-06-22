-- Metas mensais da loja
CREATE TABLE IF NOT EXISTS metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano int NOT NULL,
  meta_faturamento numeric(12,2),
  meta_vendas int,
  meta_clientes_novos int,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mes, ano)
);

-- Relatórios semanais gerados pelo analítico
CREATE TABLE IF NOT EXISTS relatorios_semanais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  semana_fim date NOT NULL,
  relatorio text NOT NULL,
  dados jsonb,
  enviado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Alertas do estoquista
CREATE TABLE IF NOT EXISTS alertas_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  estoque_id uuid REFERENCES estoque(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'critico',
  mensagem text NOT NULL,
  resolvido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios_semanais ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_metas" ON metas FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_own_relatorios" ON relatorios_semanais FOR ALL USING (user_id = auth.uid());
CREATE POLICY "user_own_alertas" ON alertas_estoque FOR ALL USING (user_id = auth.uid());
