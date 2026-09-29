import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

/* ══════════════════════════════════════════════════════════════
   CRON INTELIGÊNCIA v2 — insights de ritmo + LEMBRETE DE PRESENTE.

   As sugestões de reativação/encalhe/afinidade que este cron gerava
   foram APOSENTADAS: o motor das 8h (rodarInteligencia) faz isso melhor
   (LLM + estoque + meta + nota do dono + tamanho correto), e aniversário
   tem cron próprio (9h). Aqui ficam só os dois trabalhos NÃO duplicados:

   1) Recalcular em lote o ritmo/ mês de pico/ última compra de TODOS os
      clientes (contato_insights) — lido pelo plano diário e pela ficha.
   2) LEMBRETE DE PRESENTE: quem deu presente nesse MÊS no ano passado e
      ainda não deu esse ano → sugere lembrar (o presente NÃO é gosto
      pessoal do cliente, é o ângulo de presente — a época chegando).
   ══════════════════════════════════════════════════════════════ */

function diasEntre(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}
function mesStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* Cria sugestão pendente (o dono aprova antes de enviar). Dedupe: não sugere
   de novo pro mesmo cliente se já há sugestão dele nos últimos 14 dias. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function criarSugestao(admin: any, userId: string, cliente: { id: string; nome: string | null }, contatoId: string, tipo: string, titulo: string, descricao: string, mensagem: string): Promise<boolean> {
  const desde = new Date(); desde.setDate(desde.getDate() - 14)
  const { data: existentes } = await admin.from('agente_sugestoes')
    .select('id').eq('user_id', userId).eq('acao->>cliente_id', cliente.id)
    .gte('created_at', desde.toISOString()).limit(1)
  if ((existentes?.length ?? 0) > 0) return false
  const { error } = await admin.from('agente_sugestoes').insert({
    user_id: userId, tipo, titulo, descricao, prioridade: 2, status: 'pendente',
    acao: { tipo: 'enviar_mensagem', cliente_id: cliente.id, contato_id: contatoId, clientes: [cliente.nome ?? 'Cliente'], sugestao_mensagem: mensagem },
  })
  return !error
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buscarContato(admin: any, userId: string, clienteId: string, telefone?: string | null): Promise<{ id: string } | null> {
  const r1 = await admin.from('whatsapp_contatos').select('id').eq('user_id', userId).eq('cliente_id', clienteId).maybeSingle()
  if (r1.data?.id) return r1.data
  if (telefone) {
    const last = telefone.replace(/\D/g, '').slice(-8)
    const r2 = await admin.from('whatsapp_contatos').select('id').eq('user_id', userId).ilike('phone', `%${last}`).maybeSingle()
    if (r2.data?.id) return r2.data
  }
  return null
}

export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { lojasAtivas } = await import('@/lib/loja')
  const resultados: unknown[] = []
  for (const loja of await lojasAtivas(admin)) {
    try {
      resultados.push({ loja: loja.userId, ...(await processarLoja(admin, loja.userId)) })
    } catch (e) {
      resultados.push({ loja: loja.userId, ok: false, erro: e instanceof Error ? e.message : 'erro' })
    }
  }
  return NextResponse.json({ ok: true, resultados })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processarLoja(admin: any, userId: string) {
  const hoje = new Date()
  const hojeStr = hoje.toISOString().split('T')[0]

  const { data: config } = await admin.from('loja_config').select('nome_loja').eq('user_id', userId).maybeSingle()
  const nomeLoja = config?.nome_loja || 'a loja'

  const [{ data: todasVendas }, { data: todosClientes }] = await Promise.all([
    admin.from('vendas').select('cliente_id, valor, data_venda, presente, tipo_presente, presente_tamanho')
      .eq('user_id', userId).order('data_venda', { ascending: true }),
    admin.from('clientes').select('id, nome, telefone').eq('user_id', userId),
  ])

  type VendaRow = { cliente_id: string | null; valor: number; data_venda: string; presente: boolean | null; tipo_presente: string | null; presente_tamanho: string | null }
  const vendas = (todasVendas ?? []) as VendaRow[]
  const clientes = (todosClientes ?? []) as { id: string; nome: string | null; telefone: string | null }[]

  const vendasPorCliente = new Map<string, VendaRow[]>()
  for (const v of vendas) {
    if (!v.cliente_id) continue
    if (!vendasPorCliente.has(v.cliente_id)) vendasPorCliente.set(v.cliente_id, [])
    vendasPorCliente.get(v.cliente_id)!.push(v)
  }

  /* ── 1) Insights de ritmo (todos os clientes) ── */
  let insights = 0
  for (const cliente of clientes) {
    const vcList = (vendasPorCliente.get(cliente.id) ?? [])
      .filter(v => !v.presente)
      .sort((a, b) => a.data_venda.localeCompare(b.data_venda))
    if (vcList.length < 2) continue

    const intervalos: number[] = []
    for (let i = 1; i < vcList.length; i++) intervalos.push(diasEntre(vcList[i - 1].data_venda, vcList[i].data_venda))
    const ritmoMedio = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
    const ultimaCompra = vcList[vcList.length - 1].data_venda
    const diasSemComprar = diasEntre(ultimaCompra, hojeStr)

    const porMes: Record<string, number> = {}
    for (const v of vcList) { const m = mesStr(new Date(v.data_venda)); porMes[m] = (porMes[m] ?? 0) + 1 }
    const mesPico = Object.entries(porMes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    try {
      await admin.from('contato_insights').upsert({
        user_id: userId, cliente_id: cliente.id,
        ritmo_compra_dias: ritmoMedio, dias_sem_comprar: diasSemComprar,
        ultima_compra: ultimaCompra, mes_pico: mesPico, qtd_compras: vcList.length,
        total_gasto: vcList.reduce((s, v) => s + Number(v.valor), 0),
        ticket_medio: vcList.reduce((s, v) => s + Number(v.valor), 0) / vcList.length,
      }, { onConflict: 'user_id,cliente_id' })
      insights++
    } catch { /* ignora */ }
  }

  /* ── 2) Lembrete de presente (mesmo mês do ano passado) ── */
  const mesAtual = hoje.getMonth() + 1
  const anoAnterior = hoje.getFullYear() - 1
  let lembretes = 0
  const MAX_LEMBRETES = 10

  for (const cliente of clientes) {
    if (lembretes >= MAX_LEMBRETES) break
    const presentes = (vendasPorCliente.get(cliente.id) ?? []).filter(v => v.presente)
    if (presentes.length === 0) continue

    const presenteAnoPassado = presentes.find(v => {
      const d = new Date(v.data_venda)
      return d.getFullYear() === anoAnterior && (d.getMonth() + 1) === mesAtual
    })
    if (!presenteAnoPassado) continue

    /* Já deu presente esse ano nesse mês? então não precisa lembrar */
    const jaEsseAno = presentes.some(v => {
      const d = new Date(v.data_venda)
      return d.getFullYear() === hoje.getFullYear() && (d.getMonth() + 1) === mesAtual
    })
    if (jaEsseAno) continue

    const contato = await buscarContato(admin, userId, cliente.id, cliente.telefone)
    if (!contato) continue

    const nome = cliente.nome?.split(' ')[0] ?? 'você'
    const tipo = presenteAnoPassado.tipo_presente
    const msg = `Oi ${nome}! No ano passado, por essa época, você deu um presente${tipo ? ` de ${tipo}` : ''} aqui na ${nomeLoja} 🎁 Tá chegando a época de novo — quer que eu separe umas opções especiais pra você?`
    const criada = await criarSugestao(
      admin, userId, cliente, contato.id,
      'presente',
      `Época de presente — ${cliente.nome ?? 'cliente'}`,
      `${cliente.nome ?? 'Cliente'} deu um presente${tipo ? ` de ${tipo}` : ''} nesse mesmo mês no ano passado e ainda não deu esse ano. Sugiro lembrar da época do presente.`,
      msg,
    )
    if (criada) lembretes++
  }

  return { ok: true, insights, lembretes }
}
