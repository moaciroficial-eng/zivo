-- Adiciona suporte a conferência de recebimento de mercadoria
-- Execute este script no SQL Editor do Supabase

alter table estoque
  add column if not exists status text not null default 'disponivel',
  add column if not exists nfe_grupo_id uuid;

-- Índice para buscar rapidamente produtos aguardando conferência
create index if not exists idx_estoque_status
  on estoque (user_id, status)
  where status = 'aguardando_recebimento';

create index if not exists idx_estoque_nfe_grupo
  on estoque (nfe_grupo_id)
  where nfe_grupo_id is not null;
