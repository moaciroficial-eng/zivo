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

  /* Elegíveis: produto da NOTA só entra com +60 dias (recém-chegado é novo).
     Produto SEM nota (cadastrado na mão) = estoque antigo → entra sempre. */
  const elegiveis = itens.filter(p =>
    Number(p.preco_venda) > 0 &&
    (!p.nfe_grupo_id || diasDe(p.data_entrada ?? p.created_at) >= 60)
  )

  /* Total de peças por TAMANHO (loja toda) → tamanhos escassos = protege */
  const porTamanho = new Map<string, number>()
  for (const p of elegiveis) for (const t of (p.tamanhos ?? [])) {
    const s = String(t.tamanho); porTamanho.set(s, (porTamanho.get(s) ?? 0) + (Number(t.qtd) || 0))
  }
  const totais = [...porTamanho.values()].sort((a, b) => a - b)
  const mediana = totais.length ? totais[Math.floor(totais.length / 2)] : 0
  const escasso = (tam: string) => (porTamanho.get(tam) ?? 0) < mediana  // abaixo da mediana = escasso

  /* Monta candidatos */
  type ItemPlano = {
    id: string; nome: string; marca: string | null; cor: string | null
    dias: number; manual: boolean; preco_venda: number; preco_custo: number | null
    desconto: number; preco_promo: number
    tamanhos: { tamanho: string; qtd: number; escasso: boolean }[]
    pecas: number; valor_promo: number
  }
  const candidatos: ItemPlano[] = []
  for (const p of elegiveis) {
    const manual = !p.nfe_grupo_id
    const dias = diasDe(p.data_entrada ?? p.created_at)
    /* manual = estoque antigo cadastrado na mão: trata como bem parado */
    const diasEfetivo = manual ? Math.max(dias, 90) : dias
    const preco = Number(p.preco_venda)
    let desc = descontoPorTempo(diasEfetivo)
    let promo = Math.round(preco * (1 - desc))
    /* nunca abaixo do custo: se floor no custo, reduz o desconto efetivo */
    if (p.preco_custo != null && promo < Number(p.preco_custo)) {
      promo = Math.ceil(Number(p.preco_custo))
      desc = preco > 0 ? Math.max(0, 1 - promo / preco) : 0
    }
    if (desc <= 0.02) continue // sem margem pra desconto real

    /* Tamanhos: escasso → oferta no máx 1 (protege); resto → tudo */
    const tams = (p.tamanhos ?? [])
      .filter(t => (Number(t.qtd) || 0) > 0)
      .map(t => {
        const esc = escasso(String(t.tamanho))
        const qtd = esc ? Math.min(1, Number(t.qtd)) : Number(t.qtd)
        return { tamanho: String(t.tamanho), qtd, escasso: esc }
      })
      .filter(t => t.qtd > 0)
    const pecas = tams.reduce((s, t) => s + t.qtd, 0)
    if (pecas === 0) continue

    candidatos.push({
      id: p.id, nome: p.nome, marca: p.marca, cor: p.cor,
      dias, manual, preco_venda: preco, preco_custo: p.preco_custo,
      desconto: Math.round(desc * 100), preco_promo: promo,
      tamanhos: tams, pecas, valor_promo: promo * pecas,
    })
  }

  /* Prioriza o mais parado + com mais peças (manual = trata como muito antigo) */
  const idade = (x: ItemPlano) => x.manual ? Math.max(x.dias, 200) : x.dias
  candidatos.sort((a, b) => (idade(b) * b.pecas) - (idade(a) * a.pecas))

  /* Acumula até ~1.3x a meta (nem tudo vende de primeira, então oferta com folga) */
  const alvo = meta * 1.3
  const plano: ItemPlano[] = []
  let acumulado = 0
  for (const c of candidatos) {
    if (acumulado >= alvo && plano.length >= 8) break
    plano.push(c)
    acumulado += c.valor_promo
  }

  const totalPecas = plano.reduce((s, c) => s + c.pecas, 0)
  const economia = plano.reduce((s, c) => s + (c.preco_venda - c.preco_promo) * c.pecas, 0)

  return NextResponse.json({
    ok: true,
    meta,
    resumo: {
      valor_estoque_elegivel: Math.round(elegiveis.reduce((s, p) => s + Number(p.preco_venda) * (p.tamanhos ?? []).reduce((a, t) => a + (Number(t.qtd) || 0), 0), 0)),
      produtos_no_plano: plano.length,
      pecas: totalPecas,
      valor_promocional: Math.round(acumulado),
      desconto_total: Math.round(economia),
      tamanhos_protegidos: [...porTamanho.keys()].filter(escasso),
    },
    itens: plano,
  })
}
