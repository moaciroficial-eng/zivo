-- Tarefas criadas pelo Gerente IA
CREATE TABLE IF NOT EXISTS agente_tarefas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  instrucao   text NOT NULL,       -- comando original do supervisor
  tipo        text NOT NULL DEFAULT 'personalizado',
  status      text NOT NULL DEFAULT 'ativa',  -- ativa | pausada | concluida
  total       int NOT NULL DEFAULT 0,
  concluidos  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agente_tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_tarefas" ON agente_tarefas
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Estado da conversa automatizada por contato
CREATE TABLE IF NOT EXISTS agente_conversa_estado (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tarefa_id         uuid NOT NULL REFERENCES agente_tarefas(id) ON DELETE CASCADE,
  contato_id        uuid NOT NULL REFERENCES whatsapp_contatos(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'iniciando', -- iniciando | aguardando | concluido | erro
  dados_coletados   jsonb NOT NULL DEFAULT '{}',
  historico         jsonb NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tarefa_id, contato_id)
);
ALTER TABLE agente_conversa_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_conversa_estado" ON agente_conversa_estado
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Chat do supervisor com o Gerente IA
CREATE TABLE IF NOT EXISTS gerente_mensagens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel      text NOT NULL,  -- 'supervisor' | 'gerente'
  conteudo   text NOT NULL,
  tarefa_id  uuid REFERENCES agente_tarefas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE gerente_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_gerente_msgs" ON gerente_mensagens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
