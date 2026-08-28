import { cookies } from 'next/headers'
import { createClient as createAdmin } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import ClubeLogin from './ClubeLogin'
import ClubeVitrine from './ClubeVitrine'

export const metadata: Metadata = { title: 'Clube de Oportunidades', robots: 'noindex, nofollow' }

type LojaClube = {
  user_id: string
  nome_loja: string | null
  owner_phone: string | null
  clube_ativo: boolean | null
  clube_cadastro_aberto: boolean | null
  logo_url: string | null
  clube_como_comprar: string | null
  mp_access_token: string | null
}

export default async function ClubePublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: loja } = await admin.from('loja_config')
    .select('user_id, nome_loja, owner_phone, clube_ativo, clube_cadastro_aberto, logo_url, clube_como_comprar, mp_access_token')
    .eq('clube_slug', slug).maybeSingle<LojaClube>()

  if (!loja || !loja.clube_ativo) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-4xl mb-3">🔒</p>
          <h1 className="text-xl font-bold">Clube indisponível</h1>
          <p className="text-zinc-500 text-sm mt-1">Esse link não está ativo no momento.</p>
        </div>
      </div>
    )
  }

  const nomeLoja = loja.nome_loja || 'a loja'

  // Já logado? (cookie com o email do membro)
  const store = await cookies()
  const email = store.get(`clube_${slug}`)?.value ?? null
  let membro = false
  if (email) {
    const { data: m } = await admin.from('clube_membros')
      .select('id').eq('user_id', loja.user_id).ilike('email', email).maybeSingle()
    membro = !!m
  }

  if (!membro) {
    return <ClubeLogin slug={slug} nomeLoja={nomeLoja} logo={loja.logo_url} cadastroAberto={loja.clube_cadastro_aberto ?? true} />
  }

  // Vitrine: produtos de oportunidade com estoque
  const [{ data: produtos }, { data: fotos }] = await Promise.all([
    admin.from('estoque')
      .select('id, nome, marca, cor, preco_venda, preco_oportunidade, tamanhos, combo, combo_texto, clube_tamanhos')
      .eq('user_id', loja.user_id).eq('oportunidade', true).not('status', 'eq', 'vendido'),
    admin.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', loja.user_id),
  ])

  const fotoMap: Record<string, string> = {}
  for (const f of (fotos ?? []) as { url: string; estoque_ids: string[] | null }[]) {
    for (const id of (f.estoque_ids ?? [])) if (!fotoMap[id]) fotoMap[id] = f.url
  }

  const itens = (produtos ?? [])
    .map(p => ({
      id: p.id, nome: p.nome, marca: p.marca, cor: p.cor,
      preco_venda: p.preco_venda, preco_oportunidade: p.preco_oportunidade,
      combo: !!p.combo, combo_texto: (p.combo_texto as string | null) ?? null,
      tamanhos: (() => {
        const emEstoque = ((p.tamanhos as { tamanho: string | number; qtd: number }[]) ?? []).filter(t => Number(t.qtd) > 0).map(t => String(t.tamanho))
        const permitidos = p.clube_tamanhos as string[] | null
        return permitidos ? emEstoque.filter(s => permitidos.includes(s)) : emEstoque
      })(),
      foto: fotoMap[p.id] ?? null,
    }))
    .filter(p => p.tamanhos.length > 0)

  return <ClubeVitrine nomeLoja={nomeLoja} logo={loja.logo_url} comoComprar={loja.clube_como_comprar} ownerPhone={loja.owner_phone} slug={slug} email={email ?? ''} mpAtivo={!!loja.mp_access_token} itens={itens} />
}
