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
      .select('id, nome, marca, cor, categoria, preco_venda, preco_oportunidade, tamanhos, combo, combo_texto, clube_tamanhos')
      .eq('user_id', loja.user_id).eq('oportunidade', true).not('status', 'eq', 'vendido'),
    admin.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', loja.user_id),
  ])

  const fotoMap: Record<string, string> = {}
  for (const f of (fotos ?? []) as { url: string; estoque_ids: string[] | null }[]) {
    for (const id of (f.estoque_ids ?? [])) if (!fotoMap[id]) fotoMap[id] = f.url
  }

  const planos = (produtos ?? [])
    .map(p => ({
      id: p.id, nome: p.nome, marca: p.marca, cor: p.cor, categoria: (p.categoria as string | null) ?? null,
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

  /* Agrupa peças que são o MESMO produto e só mudam o tamanho.
     A nota fiscal traz cada tamanho como um item separado (e escreve o tamanho
     no fim do nome, ex.: "... INDIGO 117 P" / "... 117 M"). Aqui juntamos num
     card só, mantendo cada tamanho ligado ao seu id de estoque (pra baixa certa). */
  type Opcao = { tamanho: string; estoqueId: string; preco: number }
  type Grupo = (typeof planos)[number] & { opcoes: Opcao[] }
  const baseNome = (nome: string, tams: string[]) => {
    const toks = nome.trim().split(/\s+/)
    const ultimo = toks[toks.length - 1] ?? ''
    // só tira o último token se ele for exatamente o tamanho daquele item (nota split por tamanho)
    if (toks.length > 1 && tams.length === 1 && ultimo.toUpperCase() === tams[0].toUpperCase()) return toks.slice(0, -1).join(' ')
    return nome.trim()
  }
  const mapaG = new Map<string, Grupo>()
  for (const it of planos) {
    const base = baseNome(it.nome, it.tamanhos)
    const chave = `${base.toLowerCase()}||${(it.marca ?? '').toLowerCase()}||${(it.cor ?? '').toLowerCase()}||${it.combo ? 'c' : ''}`
    const preco = Number(it.preco_oportunidade ?? it.preco_venda ?? 0)
    const opcoes: Opcao[] = it.tamanhos.map(t => ({ tamanho: t, estoqueId: it.id, preco }))
    const g = mapaG.get(chave)
    if (!g) {
      mapaG.set(chave, { ...it, nome: base, opcoes })
    } else {
      for (const o of opcoes) if (!g.opcoes.some(x => x.tamanho.toUpperCase() === o.tamanho.toUpperCase())) g.opcoes.push(o)
      if (!g.foto && it.foto) g.foto = it.foto
    }
  }
  const itens = [...mapaG.values()].map(g => ({ ...g, tamanhos: g.opcoes.map(o => o.tamanho) }))

  return <ClubeVitrine nomeLoja={nomeLoja} logo={loja.logo_url} comoComprar={loja.clube_como_comprar} ownerPhone={loja.owner_phone} slug={slug} email={email ?? ''} mpAtivo={!!loja.mp_access_token} itens={itens} />
}
