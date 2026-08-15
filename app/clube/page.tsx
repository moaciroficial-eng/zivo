import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ClubeClient from './ClubeClient'

export const metadata: Metadata = { title: 'Clube de Oportunidades — Zivo' }

function gerarSlug(): string {
  return Array.from({ length: 10 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('')
}

export default async function ClubePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: cfg } = await supabase
    .from('loja_config')
    .select('nome_loja, clube_ativo, clube_slug, clube_cadastro_aberto, logo_url, clube_como_comprar, mp_access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  // Garante um slug secreto pra loja
  let slug = cfg?.clube_slug ?? null
  if (!slug) {
    slug = gerarSlug()
    await supabase.from('loja_config').upsert({ user_id: user.id, clube_slug: slug }, { onConflict: 'user_id' })
  }

  const [{ data: produtos }, { data: fotos }, { data: membrosLista }, { data: vendasClube }] = await Promise.all([
    supabase.from('estoque')
      .select('id, nome, marca, cor, preco_venda, preco_custo, tamanhos, data_entrada, oportunidade, preco_oportunidade, combo, combo_texto, status')
      .eq('user_id', user.id).not('status', 'eq', 'vendido').order('data_entrada', { ascending: true }),
    supabase.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', user.id),
    supabase.from('clube_membros').select('id, nome, email, telefone, criado_em').eq('user_id', user.id).order('criado_em', { ascending: false }),
    supabase.from('clube_pedidos').select('id, produto_nome, valor, email_membro, criado_em').eq('user_id', user.id).eq('status', 'pago').order('criado_em', { ascending: false }).limit(50),
  ])

  const fotoMap: Record<string, string> = {}
  for (const f of (fotos ?? []) as { url: string; estoque_ids: string[] | null }[]) {
    for (const id of (f.estoque_ids ?? [])) if (!fotoMap[id]) fotoMap[id] = f.url
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://zivo-navy.vercel.app'

  return (
    <ClubeClient
      user={{ id: user.id, email: user.email ?? '' }}
      nomeLoja={cfg?.nome_loja ?? 'sua loja'}
      clubeAtivo={cfg?.clube_ativo ?? false}
      cadastroAberto={cfg?.clube_cadastro_aberto ?? true}
      linkPublico={`${origin}/clube/${slug}`}
      logoUrl={cfg?.logo_url ?? null}
      comoComprar={cfg?.clube_como_comprar ?? ''}
      mpToken={cfg?.mp_access_token ?? ''}
      produtos={(produtos ?? []) as Produto[]}
      fotoMap={fotoMap}
      membrosLista={(membrosLista ?? []) as Membro[]}
      vendasClube={(vendasClube ?? []) as VendaClube[]}
    />
  )
}

export type Produto = {
  id: string
  nome: string
  marca: string | null
  cor: string | null
  preco_venda: number | null
  preco_custo: number | null
  tamanhos: { tamanho: string | number; qtd: number }[] | null
  data_entrada: string | null
  oportunidade: boolean | null
  preco_oportunidade: number | null
  combo: boolean | null
  combo_texto: string | null
  status: string | null
}

export type Membro = { id: string; nome: string | null; email: string; telefone: string | null; criado_em: string | null }
export type VendaClube = { id: string; produto_nome: string | null; valor: number | null; email_membro: string | null; criado_em: string | null }
