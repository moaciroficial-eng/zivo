-- Funil da qualificação precisa distinguir "concluiu e recebeu fotos" de
-- "concluiu mas não achou estoque" (ficou só no "vou conferir e já te mando").
-- Aprovado pelo dono em 2026-11-23.
alter table whatsapp_qualificacao add column if not exists fotos_enviadas boolean not null default false;
