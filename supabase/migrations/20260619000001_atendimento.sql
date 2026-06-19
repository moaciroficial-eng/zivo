-- Configurações da loja para o agente de atendimento
CREATE TABLE IF NOT EXISTS loja_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  horario     text NOT NULL DEFAULT 'Manhã: 9h às 12h | Tarde: 14h às 19h',
  endereco    text,
  owner_phone text,
  info_extra  text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE loja_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_loja_config" ON loja_config
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Escalações: perguntas que o agente não soube responder e encaminhou ao dono
CREATE TABLE IF NOT EXISTS atendimento_escalacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contato_id    uuid NOT NULL REFERENCES whatsapp_contatos(id) ON DELETE CASCADE,
  pergunta      text NOT NULL,
  status        text NOT NULL DEFAULT 'pendente', -- pendente | respondida
  agente_msg    text,
  resposta_owner text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE atendimento_escalacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_escalacoes" ON atendimento_escalacoes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
