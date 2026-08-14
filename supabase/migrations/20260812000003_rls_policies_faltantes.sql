-- alertas_estoque e relatorios_semanais estavam com RLS ligado mas SEM política
-- (a política da migration antiga não persistiu). Recria pra manter isolamento
-- por loja e não bloquear leitura legítima via cliente logado.
drop policy if exists "user_own_alertas" on alertas_estoque;
create policy "user_own_alertas" on alertas_estoque
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "user_own_relatorios" on relatorios_semanais;
create policy "user_own_relatorios" on relatorios_semanais
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
