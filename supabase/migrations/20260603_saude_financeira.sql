-- Execute no SQL Editor do Supabase
alter table metas
  add column if not exists dividas_atuais         numeric(12,2),
  add column if not exists despesas_fixas_mensais  numeric(12,2),
  add column if not exists capital_de_giro         numeric(12,2);
