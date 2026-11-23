-- Qualificação automática (3 perguntas) + Respostas prontas
-- Aprovado pelo dono em 2026-11-21.

-- Estado do fluxo de qualificação -- 1 linha por contato (sempre a execução mais recente)
create table if not exists whatsapp_qualificacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contato_id uuid not null references whatsapp_contatos(id) on delete cascade,
  status text not null default 'aguardando_categoria', -- aguardando_categoria | aguardando_tamanho | aguardando_preferencia | concluido | cancelado
  categoria text,
  tamanho text,
  preferencia text,
  origem text,            -- live | campanha | organico
  iniciado_at timestamptz not null default now(),
  concluido_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (contato_id)
);
alter table whatsapp_qualificacao enable row level security;
create policy "user_qualificacao" on whatsapp_qualificacao
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Destaque "Lead qualificado" na lista de conversas
alter table whatsapp_contatos add column if not exists lead_qualificado boolean not null default false;

-- Atribuição de origem (pra aparecer depois na venda) + preferência de estampa
alter table clientes add column if not exists origem_lead text;         -- live | campanha | organico
alter table clientes add column if not exists preferencia_estampa text; -- lisa | estampada | tanto_faz

-- Liga/desliga do fluxo de qualificação (toggle na tela do WhatsApp)
alter table loja_config add column if not exists qualificacao_ativa boolean not null default true;

-- Respostas prontas
create table if not exists respostas_prontas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  atalho text not null,
  texto text not null,
  botoes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table respostas_prontas enable row level security;
create policy "user_respostas_prontas" on respostas_prontas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Seeds editáveis -- NUNCA inventamos chave Pix/endereço/prazo reais, só
-- placeholders entre [colchetes] pra o dono editar na tela antes de usar.
insert into respostas_prontas (user_id, titulo, atalho, texto)
select u.id, v.titulo, v.atalho, v.texto
from auth.users u
cross join (values
  ('Chave Pix', 'pix', 'Nossa chave Pix é [cole sua chave aqui]. Pode me mandar o comprovante por aqui que eu confirmo! 🙏'),
  ('Endereço e horário', 'horario', 'A gente atende [cole seu horário aqui] no endereço (local): [cole seu endereço aqui].'),
  ('Como funciona a condicional', 'condicional', 'Oi {nome}! Na condicional você leva a peça, experimenta em casa e tem [defina os dias] pra decidir -- sem compromisso 😊'),
  ('Troca', 'troca', 'Pra troca é só trazer a peça com a etiqueta e a nota em até [defina os dias] da compra 🙏'),
  ('Entrega em LEM/região', 'entrega', 'Entregamos em LEM e região! Valor: [defina aqui]. Prazo: [defina aqui].'),
  ('Parcelamento', 'parcelamento', 'Parcelamos em até [defina Nx] no cartão 💳 Se quiser, me chama que já te passo o link de pagamento!'),
  ('Vou separar pra você', 'separar', 'Vou separar essa peça pra você, {nome}! 🙏'),
  ('Agradecimento pós-compra', 'obrigado', 'Muito obrigada pela compra, {nome}! Foi um prazer te atender 💛 Qualquer coisa, pode chamar.')
) as v(titulo, atalho, texto)
where not exists (
  select 1 from respostas_prontas r where r.user_id = u.id and r.atalho = v.atalho
);
