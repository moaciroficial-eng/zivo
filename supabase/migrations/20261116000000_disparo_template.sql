-- Disparo de template em massa (fora da janela de 24h) + opt-out de WhatsApp.

ALTER TABLE whatsapp_contatos ADD COLUMN IF NOT EXISTS nao_receber boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS disparo_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  variaveis_extra jsonb,
  filtro jsonb,
  total_destinatarios int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho', -- rascunho | agendado | enviando | concluido
  agendado_para timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE disparo_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_disparo_templates" ON disparo_templates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS disparo_template_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id uuid NOT NULL REFERENCES disparo_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  contato_id uuid REFERENCES whatsapp_contatos(id) ON DELETE SET NULL,
  phone text NOT NULL,
  nome text,
  variaveis jsonb,
  status text NOT NULL DEFAULT 'pendente', -- pendente | enviado | entregue | lido | falhou
  motivo_falha text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disparo_template_envios_message_id_idx ON disparo_template_envios (message_id);
CREATE INDEX IF NOT EXISTS disparo_template_envios_disparo_id_idx ON disparo_template_envios (disparo_id);

ALTER TABLE disparo_template_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_disparo_template_envios" ON disparo_template_envios
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
