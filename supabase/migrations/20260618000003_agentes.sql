-- ============================================================
-- AGENTES DE IA
-- Cada agente tem um setor e opera de forma independente
-- ============================================================

CREATE TABLE IF NOT EXISTS agentes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo      text NOT NULL, -- dados | funil | campanhas | cobranca | relacionamento
  nome      text NOT NULL,
  descricao text,
  ativo     boolean NOT NULL DEFAULT true,
  ultima_execucao timestamptz,
  total_execucoes int NOT NULL DEFAULT 0,
  config    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_agentes" ON agentes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS agentes_user_tipo_idx ON agentes (user_id, tipo);

-- ============================================================
-- INSIGHTS POR CONTATO
-- O Agente de Dados popula isso a cada análise
-- ============================================================

CREATE TABLE IF NOT EXISTS contato_insights (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contato_id  uuid NOT NULL REFERENCES whatsapp_contatos(id) ON DELETE CASCADE,
  cliente_id  uuid REFERENCES clientes(id) ON DELETE SET NULL,

  -- Perfil extraído pela IA
  marcas_interesse  text[],   -- ex: ['Aramis', 'Reserva']
  tamanhos          text[],   -- ex: ['M', '42']
  ocasioes          text[],   -- ex: ['trabalho', 'casual']
  perfil_compra     text,     -- impulsivo | planejado | promocao | presente
  temperatura       text,     -- frio | morno | quente
  resumo            text,     -- resumo em linguagem natural do perfil

  -- Histórico de análises
  ultima_analise    timestamptz,
  mensagens_analisadas int NOT NULL DEFAULT 0,
  raw               jsonb NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contato_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_contato_insights" ON contato_insights
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS contato_insights_contato_idx ON contato_insights (contato_id);

-- ============================================================
-- LOG DE EXECUÇÕES DOS AGENTES
-- Rastreia o que cada agente fez e quando
-- ============================================================

CREATE TABLE IF NOT EXISTS agente_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agente_id  uuid NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES whatsapp_contatos(id) ON DELETE SET NULL,
  acao       text NOT NULL,  -- o que o agente fez
  resultado  jsonb,          -- output estruturado
  erro       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agente_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_agente_logs" ON agente_logs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
