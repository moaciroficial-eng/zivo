import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* ── PLANO DE CAIXA ──────────────────────────────────────────────
   Monta um plano de promoção pra LEVANTAR CAIXA equilibrando o estoque:
   - só produtos com +60 dias (recém-chegado não é encalhe)
   - desconto por tempo parado, teto 50%, nunca abaixo do custo
   - PROTEGE os tamanhos escassos (oferta pouco); desova os que sobram
   - prioriza o mais parado + com mais peças até somar a meta */

type TamQtd = { tamanho: string; qtd: number }
type EstoqueRow = {
  id: string; nome: string; marca: string | null; cor: string | null
  tamanhos: TamQtd[] | null; preco_venda: number | null; preco_custo: number | null
  data_entrada: string | null; created_at: string | null; status: string | null
  nfe_grupo_id: string | null
}

function diasDe(data: string | null): number {
  if (!data) return 0
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000)
}
/* desconto sugerido conforme quanto tempo está parado (teto 50%) */
function descontoPorTempo(dias: number): number {
  if (dias >= 180) return 0.50
  if (dias >= 120) return 0.45
  if (dias >= 90) return 0.40
  return 0.25 // 60–90 dias
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const meta = Math.max(0, Number(body?.meta) || 10000)

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: estoque } = await admin.from('estoque')
    .select('id, nome, marca, cor, tamanhos, preco_venda, preco_custo, data_entrada, created_at, status, nfe_grupo_id')
    .eq('user_id', user.id).eq('status', 'disponivel')

  const itens = (estoque ?? []) as EstoqueRow[]

  /* Fotos da biblioteca (estoque_id → url) */
  const { data: fotos } = await admin.from('biblioteca_fotos').select('url, estoque_ids').eq('user_id', user.id)
  const fotoMap: Record<string, string> = {}
  for (const f of (fotos ?? []) as { url: string; estoque_ids: string[] | null }[]) {
    for (const id of (f.estoque_ids ?? [])) if (!fotoMap[id]) fotoMap[id] = f.url
  }

  /* Elegíveis: produto da NOTA só entra com +60 dias (recém-chegado é novo).
     Produto SEM nota (cadastrado na mão) = estoque antigo → entra sempre. */
  const elegiveis = itens.filter(p =>
    Number(p.preco_venda) > 0 &&
    (!p.nfe_grupo_id || diasDe(p.data_entrada ?? p.created_at) >= 60)
  )

  const normTam = (t: unknown) => String(t ?? '').trim().toUpperCase()

  /* Histórico: quanto cada TAMANHO já VENDEU ("o que mais sai") */
  const { data: vendas } = await admin.from('vendas').select('produtos').eq('user_id', user.id)
  const vendidoPorTam = new Map<string, number>()
  for (const v of (vendas ?? [])) {
    const prods = Array.isArray((v as { produtos?: unknown }).produtos) ? (v as { produtos: { tamanho?: unknown; qtd?: unknown }[] }).produtos : []
    for (const pr of prods) {
      const tam = normTam(pr?.tamanho)
      if (!tam) continue
      vendidoPorTam.set(tam, (vendidoPorTam.get(tam) ?? 0) + (Number(pr?.qtd) || 1))
    }
  }

  /* Estoque atual por TAMANHO (só elegíveis) */
  const emEstoquePorTam = new Map<string, number>()
  for (const p of elegiveis) for (const t of (p.tamanhos ?? [])) {
    const s = normTam(t.tamanho); emEstoquePorTam.set(s, (emEstoquePorTam.get(s) ?? 0) + (Number(t.qtd) || 0))
  }

  /* PROTEGE o tamanho que MAIS SAI e MENOS TEM: se vendeu bem (>=2) e o que
     sobra é <= o que já vendeu (bom giro), é vendedor forte (tipo G) → NÃO
     entra na queima, fica no preço cheio. */
  const protegido = (tam: string) => {
    const t = normTam(tam)
    const vend = vendidoPorTam.get(t) ?? 0
    const emEst = emEstoquePorTam.get(t) ?? 0
    return vend >= 2 && emEst <= vend
  }
  const tamanhosProtegidos = [...emEstoquePorTam.keys()].filter(protegido)

  /* Uma LINHA por tamanho (peça + tamanho) — o dono revisa e dispensa o que
     não faz sentido. Oferta a qtd cheia; só MARCA os tamanhos escassos. */
  type Linha = {
    id: string; nome: string; marca: string | null; cor: string | null; foto: string | null
    tamanho: string; qtd: number; escasso: boolean
    dias: number; manual: boolean
    preco_venda: number; preco_custo: number | null
    desconto: number; preco_promo: number; valor: number
  }
  const linhas: Linha[] = []
  for (const p of elegiveis) {
    const manual = !p.nfe_grupo_id
    const dias = diasDe(p.data_entrada ?? p.created_at)
    const diasEfetivo = manual ? Math.max(dias, 90) : dias  // manual = estoque antigo
    const preco = Number(p.preco_venda)
    let desc = descontoPorTempo(diasEfetivo)
    let promo = Math.round(preco * (1 - desc))
    if (p.preco_custo != null && promo < Number(p.preco_custo)) {
      promo = Math.ceil(Number(p.preco_custo))
      desc = preco > 0 ? Math.max(0, 1 - promo / preco) : 0
    }
    if (desc <= 0.02) continue // sem margem pra desconto real
    for (const t of (p.tamanhos ?? [])) {
      const qtd = Number(t.qtd) || 0
      if (qtd <= 0) continue
      if (protegido(t.tamanho)) continue  // tamanho bom vendedor → fora da queima
      linhas.push({
        id: p.id, nome: p.nome, marca: p.marca, cor: p.cor, foto: fotoMap[p.id] ?? null,
        tamanho: String(t.tamanho), qtd, escasso: false,
        dias, manual, preco_venda: preco, preco_custo: p.preco_custo,
        desconto: Math.round(desc * 100), preco_promo: promo, valor: promo * qtd,
      })
    }
  }

  /* Mais parado primeiro (manual = muito antigo) */
  const idade = (x: Linha) => x.manual ? Math.max(x.dias, 200) : x.dias
  linhas.sort((a, b) => (idade(b) * b.qtd) - (idade(a) * a.qtd))

  return NextResponse.json({
    ok: true,
    meta,
    resumo: {
      valor_estoque_elegivel: Math.round(elegiveis.reduce((s, p) => s + Number(p.preco_venda) * (p.tamanhos ?? []).reduce((a, t) => a + (Number(t.qtd) || 0), 0), 0)),
      tamanhos_protegidos: tamanhosProtegidos,
    },
    itens: linhas.slice(0, 80),
  })
}
