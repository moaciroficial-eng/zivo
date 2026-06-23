-- Tabela de mensagens agendadas (pós-venda, aniversário, etc.)
CREATE TABLE IF NOT EXISTS mensagens_agendadas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        text        NOT NULL DEFAULT 'pos_venda',
  cliente_id  uuid        REFERENCES clientes(id) ON DELETE SET NULL,
  venda_id    uuid        REFERENCES vendas(id) ON DELETE CASCADE,
  enviar_em   timestamptz NOT NULL,
  enviada     boolean     NOT NULL DEFAULT false,
  enviada_em  timestamptz,
  erro        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mensagens_agendadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_mensagens_agendadas" ON mensagens_agendadas
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX mensagens_agendadas_pendentes
  ON mensagens_agendadas(user_id, enviar_em)
  WHERE enviada = false;

-- Trigger: agenda mensagem 5 minutos após cada venda com cliente vinculado
CREATE OR REPLACE FUNCTION agendar_pos_venda()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL THEN
    INSERT INTO mensagens_agendadas (user_id, tipo, cliente_id, venda_id, enviar_em)
    VALUES (NEW.user_id, 'pos_venda', NEW.cliente_id, NEW.id, NOW() + INTERVAL '5 minutes');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_agendar_pos_venda ON vendas;
CREATE TRIGGER trigger_agendar_pos_venda
  AFTER INSERT ON vendas
  FOR EACH ROW
  EXECUTE FUNCTION agendar_pos_venda();
