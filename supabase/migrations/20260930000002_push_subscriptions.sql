-- Inscrições de notificação push (PWA) — uma por dispositivo/navegador do dono.
-- O envio é feito pelo service-role (webhook), que ignora RLS; o dono só
-- gerencia as próprias inscrições pelo app.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  criado_em   timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push own select" on public.push_subscriptions;
drop policy if exists "push own insert" on public.push_subscriptions;
drop policy if exists "push own update" on public.push_subscriptions;
drop policy if exists "push own delete" on public.push_subscriptions;

create policy "push own select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push own insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push own update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push own delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
