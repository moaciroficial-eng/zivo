/* ══════════════════════════════════════════════════════════════
   APRENDIZADO DA LOJA — o loop de resultado

   Lê o que a loja JÁ fez (campanhas, mensagens proativas) e cruza com as
   VENDAS reais pra descobrir o que converte: tom agressivo vs suave, com
   ou sem foto, com ou sem desconto, mensagem proativa. Vira um resumo curto
   que a consultora e o motor de oportunidades leem — a IA para de "achar"
   e passa a "saber o que funciona AQUI".

   Nada de treinar modelo: é dado derivado, calculado sob demanda.
   ══════════════════════════════════════════════════════════════ */

const JANELA_CONV_DIAS = 14        // comprou até 14 dias após a ação = converteu
const MIN_ENVIOS_BUCKET = 15       // abaixo disso não afirmo nada (ruído)

type Venda = { cliente_id: string | null; created_at: string }

/* Cliente comprou entre [desde, desde+dias]? */
function comprouApos(vendasPorCli: Map<string, string[]>, clienteId: string, desdeISO: string, dias = JANELA_CONV_DIAS): boolean {
  const datas = vendasPorCli.get(clienteId)
  if (!datas) return false
  const desde = new Date(desdeISO).getTime()
  const ate = desde + dias * 86400000
  return datas.some(d => { const t = new Date(d).getTime(); return t >= desde && t <= ate })
}

function pct(conv: number, total: number): number {
  return total > 0 ? Math.round((conv / total) * 100) : 0
}

export type Aprendizado = {
  resumo: string                    // texto pronto pro prompt
  temDados: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resumoAprendizado(admin: any, userId: string): Promise<Aprendizado> {
  const desde180 = new Date(Date.now() - 180 * 86400000).toISOString()

  const [{ data: campanhas }, { data: vendas }, { data: acoes }] = await Promise.all([
    admin.from('campanhas')
      .select('id, created_at, intensidade, desconto, com_foto')
      .eq('user_id', userId).gte('created_at', desde180),
    admin.from('vendas')
      .select('cliente_id, created_at')
      .eq('user_id', userId).gte('created_at', desde180),
    admin.from('inteligencia_acoes')
      .select('cliente_id, enviada_em')
      .eq('user_id', userId).gte('enviada_em', new Date(Date.now() - 90 * 86400000).toISOString()),
  ])

  /* index de vendas por cliente */
  const vendasPorCli = new Map<string, string[]>()
  for (const v of (vendas ?? []) as Venda[]) {
    if (!v.cliente_id) continue
    if (!vendasPorCli.has(v.cliente_id)) vendasPorCli.set(v.cliente_id, [])
    vendasPorCli.get(v.cliente_id)!.push(v.created_at)
  }

  const campanhaList = (campanhas ?? []) as { id: string; created_at: string; intensidade: string | null; desconto: string | null; com_foto: boolean | null }[]

  /* leads de todas as campanhas */
  let leadsPorCampanha = new Map<string, { cliente_id: string | null }[]>()
  if (campanhaList.length) {
    const { data: leads } = await admin.from('campanha_leads')
      .select('campanha_id, cliente_id').eq('user_id', userId)
      .in('campanha_id', campanhaList.map(c => c.id))
    leadsPorCampanha = new Map()
    for (const l of (leads ?? []) as { campanha_id: string; cliente_id: string | null }[]) {
      if (!leadsPorCampanha.has(l.campanha_id)) leadsPorCampanha.set(l.campanha_id, [])
      leadsPorCampanha.get(l.campanha_id)!.push({ cliente_id: l.cliente_id })
    }
  }

  /* buckets: acumula enviados e convertidos por atributo */
  const bucket = () => ({ env: 0, conv: 0 })
  const b = {
    agressiva: bucket(), suave: bucket(),
    comFoto: bucket(), semFoto: bucket(),
    comDesc: bucket(), semDesc: bucket(),
  }

  for (const c of campanhaList) {
    const leads = leadsPorCampanha.get(c.id) ?? []
    if (!leads.length) continue
    let env = 0, conv = 0
    for (const l of leads) {
      if (!l.cliente_id) continue
      env++
      if (comprouApos(vendasPorCli, l.cliente_id, c.created_at)) conv++
    }
    if (!env) continue
    const tom = String(c.intensidade ?? '').toLowerCase()
    if (tom === 'agressiva') { b.agressiva.env += env; b.agressiva.conv += conv }
    else if (tom === 'leve') { b.suave.env += env; b.suave.conv += conv }
    if (c.com_foto) { b.comFoto.env += env; b.comFoto.conv += conv } else { b.semFoto.env += env; b.semFoto.conv += conv }
    if (c.desconto) { b.comDesc.env += env; b.comDesc.conv += conv } else { b.semDesc.env += env; b.semDesc.conv += conv }
  }

  /* mensagens proativas (sugestões enviadas) */
  const prov = bucket()
  for (const a of (acoes ?? []) as { cliente_id: string | null; enviada_em: string }[]) {
    if (!a.cliente_id) continue
    prov.env++
    if (comprouApos(vendasPorCli, a.cliente_id, a.enviada_em)) prov.conv++
  }

  /* monta o resumo só com o que tem amostra suficiente */
  const linhas: string[] = []
  const comparar = (nomeA: string, A: {env:number;conv:number}, nomeB: string, B: {env:number;conv:number}, recomenda: (a:number,bb:number)=>string) => {
    if (A.env >= MIN_ENVIOS_BUCKET && B.env >= MIN_ENVIOS_BUCKET) {
      const pa = pct(A.conv, A.env), pb = pct(B.conv, B.env)
      linhas.push(`${nomeA} converteu ${pa}% vs ${pb}% ${nomeB}. ${recomenda(pa, pb)}`)
    }
  }
  comparar('Tom AGRESSIVO', b.agressiva, 'no suave', b.suave, (a, x) => a > x ? '→ prefira agressivo aqui.' : a < x ? '→ o suave rende mais nesta loja.' : '')
  comparar('COM foto', b.comFoto, 'sem foto', b.semFoto, (a, x) => a > x ? '→ sempre puxe foto.' : '')
  comparar('COM desconto', b.comDesc, 'sem desconto', b.semDesc, (a, x) => a > x ? '→ desconto vale pra girar.' : a < x ? '→ nem sempre precisa de desconto.' : '')
  if (prov.env >= MIN_ENVIOS_BUCKET) linhas.push(`Mensagens proativas converteram ${pct(prov.conv, prov.env)}% em ${JANELA_CONV_DIAS} dias.`)

  if (!linhas.length) {
    return { temDados: false, resumo: '(Ainda poucos resultados pra tirar padrão — vou aprendendo a cada campanha.)' }
  }
  return { temDados: true, resumo: linhas.map(l => `- ${l}`).join('\n') }
}
