CREATE TABLE crediario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venda_id uuid REFERENCES vendas(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL DEFAULT 'Avulso',
  valor_total numeric(12,2) NOT NULL,
  valor_entrada numeric(12,2) NOT NULL DEFAULT 0,
  num_parcelas integer NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parcelas_crediario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crediario_id uuid NOT NULL REFERENCES crediario(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  valor numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  pago boolean NOT NULL DEFAULT false,
  data_pagamento date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crediario ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas_crediario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_crediario" ON crediario
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_parcelas_crediario" ON parcelas_crediario
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
