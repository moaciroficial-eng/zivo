-- HAVER (crédito do cliente)
-- Caso típico: compra de R$179, cliente paga R$200, a loja não tem os R$21
-- de troco → os R$21 ficam "em haver" pro cliente usar na próxima compra.
-- Também serve pra devolução e ajuste manual.
--
-- Modelo: um LIVRO-RAZÃO (cada lançamento é uma linha, positivo = crédito,
-- negativo = uso). O saldo fica materializado em clientes.saldo_credito por
-- um trigger, pra lista/consulta ser rápida sem perder o histórico.

CREATE TABLE IF NOT EXISTS cliente_creditos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  -- positivo = entrou crédito (troco/devolução); negativo = cliente usou
  valor       numeric(10,2) NOT NULL,
  -- 'troco' | 'manual' | 'devolucao' | 'uso'
  tipo        text        NOT NULL DEFAULT 'manual',
  descricao   text,
  venda_id    uuid        REFERENCES vendas(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cliente_creditos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_cliente_creditos" ON cliente_creditos;
CREATE POLICY "user_cliente_creditos" ON cliente_creditos
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS cliente_creditos_cliente_idx
  ON cliente_creditos(cliente_id, created_at DESC);

-- Saldo materializado (leitura rápida na lista de clientes e na venda)
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS saldo_credito numeric(10,2) NOT NULL DEFAULT 0;

-- Recalcula o saldo do cliente a cada lançamento. Recalcula a soma inteira
-- (em vez de somar/subtrair) pra o saldo nunca divergir do histórico.
CREATE OR REPLACE FUNCTION recalcular_saldo_credito()
RETURNS TRIGGER AS $$
DECLARE
  alvo uuid := COALESCE(NEW.cliente_id, OLD.cliente_id);
BEGIN
  UPDATE clientes
  SET saldo_credito = COALESCE(
    (SELECT SUM(valor) FROM cliente_creditos WHERE cliente_id = alvo), 0
  )
  WHERE id = alvo;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_recalcular_saldo_credito ON cliente_creditos;
CREATE TRIGGER trigger_recalcular_saldo_credito
  AFTER INSERT OR UPDATE OR DELETE ON cliente_creditos
  FOR EACH ROW
  EXECUTE FUNCTION recalcular_saldo_credito();
