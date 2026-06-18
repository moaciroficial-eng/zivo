-- Adiciona colunas faltantes na whatsapp_contatos
ALTER TABLE whatsapp_contatos
  ADD COLUMN IF NOT EXISTS jid text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funil_etapa text NOT NULL DEFAULT 'desconhecido';

-- Tabela de campanhas
CREATE TABLE IF NOT EXISTS campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'interna', -- interna | externa
  produto_marca text,
  objetivo text,
  segmento_descricao text,
  copy_whatsapp text,
  copy_meta_ads text,
  roteiro text,
  link_rastreamento text UNIQUE,
  status text NOT NULL DEFAULT 'rascunho', -- rascunho | ativa | pausada | concluida
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_campanhas" ON campanhas
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Coluna campanha_id nos contatos (rastrear de onde veio o lead)
ALTER TABLE whatsapp_contatos
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES campanhas(id) ON DELETE SET NULL;

-- Tabela de leads de campanha
CREATE TABLE IF NOT EXISTS campanha_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES campanhas(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES whatsapp_contatos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  phone text NOT NULL,
  nome text,
  status text NOT NULL DEFAULT 'novo', -- novo | qualificado | convertido
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campanha_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_campanha_leads" ON campanha_leads
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
