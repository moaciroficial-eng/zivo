/* ══════════════════════════════════════════════════════════════
   PROVISIONAMENTO META (Tech Provider / Embedded Signup)

   Helpers pra conectar a WABA de uma loja pelo Zivo, sem o dono
   precisar mexer no painel de desenvolvedor da Meta:
   - troca o `code` do Embedded Signup por um token de acesso
   - registra o número de telefone (Cloud API)
   - assina o app do Zivo nos webhooks daquela WABA
   - clona os templates já aprovados da WABA-fonte pra WABA nova
   ══════════════════════════════════════════════════════════════ */

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0'
const GRAPH = 'https://graph.facebook.com'

/* Troca o `code` do Embedded Signup por um token de acesso (business
   integration system user). Precisa do App ID + App Secret do Zivo. */
export async function trocarCodePorToken(code: string): Promise<string> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) throw new Error('META_APP_ID / META_APP_SECRET não configurados no servidor.')

  const url = `${GRAPH}/${META_API_VERSION}/oauth/access_token`
    + `?client_id=${encodeURIComponent(appId)}`
    + `&client_secret=${encodeURIComponent(appSecret)}`
    + `&code=${encodeURIComponent(code)}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error?.message || `Falha ao trocar o code por token (${res.status}).`)
  }
  return data.access_token as string
}

/* Registra o número na Cloud API. Necessário antes de enviar mensagens.
   Se já estiver registrado, a Meta devolve erro que tratamos como ok. */
export async function registrarNumero(phoneNumberId: string, token: string, pin?: string): Promise<{ ok: boolean; motivo?: string }> {
  const codigo = (pin && /^\d{6}$/.test(pin)) ? pin : String(Math.floor(100000 + Math.random() * 900000))
  const res = await fetch(`${GRAPH}/${META_API_VERSION}/${phoneNumberId}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin: codigo }),
  })
  if (res.ok) return { ok: true }
  const txt = await res.text()
  // "already registered" e afins não são falha real
  if (/already\s+registered|already\s+been\s+registered/i.test(txt)) return { ok: true, motivo: 'já registrado' }
  return { ok: false, motivo: `(${res.status}) ${txt.slice(0, 200)}` }
}

/* Assina o app do Zivo nos webhooks da WABA — sem isso, as mensagens
   que chegam pra essa loja não são entregues no nosso /webhook. */
export async function assinarWebhook(wabaId: string, token: string): Promise<{ ok: boolean; motivo?: string }> {
  const res = await fetch(`${GRAPH}/${META_API_VERSION}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.ok) return { ok: true }
  return { ok: false, motivo: `(${res.status}) ${(await res.text()).slice(0, 200)}` }
}

type TemplateRaw = {
  id?: string
  name: string
  language: string
  status?: string
  category: string
  components?: unknown[]
}

/* Lista todos os templates de uma WABA (segue paginação). */
export async function listarTemplates(wabaId: string, token: string): Promise<TemplateRaw[]> {
  const out: TemplateRaw[] = []
  let url: string | null = `${GRAPH}/${META_API_VERSION}/${wabaId}/message_templates?limit=100`
  while (url) {
    const res: Response = await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Falha ao listar templates (${res.status}): ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    for (const t of (data?.data ?? [])) out.push(t as TemplateRaw)
    url = data?.paging?.next ?? null
  }
  return out
}

export type ClonarResultado = { name: string; ok: boolean; motivo?: string; jaExistia?: boolean }

/* Clona os templates da WABA-fonte (a sua, já aprovada) pra WABA nova.
   Pula os que já existem no destino. Falha de um template não derruba
   os outros — retorna o resultado item a item. */
export async function clonarTemplates(params: {
  sourceWabaId: string; sourceToken: string
  targetWabaId: string; targetToken: string
}): Promise<ClonarResultado[]> {
  const { sourceWabaId, sourceToken, targetWabaId, targetToken } = params

  const [origem, destino] = await Promise.all([
    listarTemplates(sourceWabaId, sourceToken),
    listarTemplates(targetWabaId, targetToken).catch(() => [] as TemplateRaw[]),
  ])

  const jaNoDestino = new Set(destino.map(t => `${t.name}|${t.language}`))
  const resultados: ClonarResultado[] = []

  for (const t of origem) {
    const chave = `${t.name}|${t.language}`
    if (jaNoDestino.has(chave)) { resultados.push({ name: t.name, ok: true, jaExistia: true }); continue }
    try {
      const res = await fetch(`${GRAPH}/${META_API_VERSION}/${targetWabaId}/message_templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${targetToken}` },
        body: JSON.stringify({
          name: t.name,
          language: t.language,
          category: t.category,
          components: t.components ?? [],
        }),
      })
      if (!res.ok) resultados.push({ name: t.name, ok: false, motivo: `(${res.status}) ${(await res.text()).slice(0, 200)}` })
      else resultados.push({ name: t.name, ok: true })
    } catch (e) {
      resultados.push({ name: t.name, ok: false, motivo: e instanceof Error ? e.message : 'erro' })
    }
  }
  return resultados
}
