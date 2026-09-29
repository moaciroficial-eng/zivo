import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

/* ══════════════════════════════════════════════════════════════
   CRON INTELIGÊNCIA v2 — agora SÓ atualiza insights de ritmo.

   As sugestões de reativação/encalhe/afinidade/presente que este cron
   gerava foram APOSENTADAS: o motor das 8h (rodarInteligencia) já faz
   isso melhor (LLM + estoque + meta + nota do dono + equivalência de
   tamanho correta), e aniversário tem cron próprio (9h). Manter as duas
   fontes gerava cards duplicados e — pior — matches de tamanho errados
   (este cron misturava camiseta com calça).

   O que sobra aqui é o único trabalho NÃO duplicado: recalcular em lote
   o ritmo de compra / mês de pico / última compra de TODOS os clientes,
   que o plano diário e a ficha do cliente leem (contato_insights).
   ══════════════════════════════════════════════════════════════ */

function diasEntre(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
function mesStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  /* Só a Vercel (cron) pode chamar quando CRON_SECRET está configurado */
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { lojasAtivas } = await import('@/lib/loja')
  const resultados: unknown[] = []
  for (const loja of await lojasAtivas(admin)) {
    try {
      resultados.push({ loja: loja.userId, ...(await atualizarInsights(admin, loja.userId)) })
    } catch (e) {
      resultados.push({ loja: loja.userId, ok: false, erro: e instanceof Error ? e.message : 'erro' })
    }
  }
  return NextResponse.json({ ok: true, resultados })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function atualizarInsights(admin: any, userId: string) {
  const hojeStr = new Date().toISOString().split('T')[0]

  const [{ data: todasVendas }, { data: todosClientes }] = await Promise.all([
    admin.from('vendas').select('cliente_id, valor, data_venda, presente')
      .eq('user_id', userId).order('data_venda', { ascending: true }),
    admin.from('clientes').select('id').eq('user_id', userId),
  ])

  type VendaRow = { cliente_id: string | null; valor: number; data_venda: string; presente: boolean | null }
  const vendas = (todasVendas ?? []) as VendaRow[]
  const clientes = (todosClientes ?? []) as { id: string }[]

  const vendasPorCliente = new Map<string, VendaRow[]>()
  for (const v of vendas) {
    if (!v.cliente_id) continue
    if (!vendasPorCliente.has(v.cliente_id)) vendasPorCliente.set(v.cliente_id, [])
    vendasPorCliente.get(v.cliente_id)!.push(v)
  }

  let atualizados = 0
  for (const cliente of clientes) {
    const vcList = (vendasPorCliente.get(cliente.id) ?? [])
      .filter(v => !v.presente)
      .sort((a, b) => a.data_venda.localeCompare(b.data_venda))
    if (vcList.length < 2) continue

    const intervalos: number[] = []
    for (let i = 1; i < vcList.length; i++) {
      intervalos.push(diasEntre(vcList[i - 1].data_venda, vcList[i].data_venda))
    }
    const ritmoMedio = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
    const ultimaCompra = vcList[vcList.length - 1].data_venda
    const diasSemComprar = diasEntre(ultimaCompra, hojeStr)

    const porMes: Record<string, number> = {}
    for (const v of vcList) {
      const m = mesStr(new Date(v.data_venda))
      porMes[m] = (porMes[m] ?? 0) + 1
    }
    const mesPico = Object.entries(porMes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    try {
      await admin.from('contato_insights').upsert({
        user_id: userId,
        cliente_id: cliente.id,
        ritmo_compra_dias: ritmoMedio,
        dias_sem_comprar: diasSemComprar,
        ultima_compra: ultimaCompra,
        mes_pico: mesPico,
        qtd_compras: vcList.length,
        total_gasto: vcList.reduce((s, v) => s + Number(v.valor), 0),
        ticket_medio: vcList.reduce((s, v) => s + Number(v.valor), 0) / vcList.length,
      }, { onConflict: 'user_id,cliente_id' })
      atualizados++
    } catch { /* ignora erro de upsert individual */ }
  }

  return { ok: true, insights: atualizados }
}
