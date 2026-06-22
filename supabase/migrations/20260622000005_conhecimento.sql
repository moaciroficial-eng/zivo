CREATE TABLE IF NOT EXISTS conhecimento (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria  text NOT NULL DEFAULT 'geral',
  titulo     text NOT NULL,
  conteudo   text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  fonte      text DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conhecimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_conhecimento" ON conhecimento
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX conhecimento_user_ativo ON conhecimento(user_id, ativo);
CREATE INDEX conhecimento_categoria  ON conhecimento(user_id, categoria);
