-- Modo funcionária: um "modo restrito" no mesmo login da loja, protegido por PIN.
-- Guarda só o HASH do PIN do dono (pra sair do modo restrito de volta ao completo).
alter table loja_config
  add column if not exists modo_pin_hash text;
