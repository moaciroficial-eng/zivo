// Cria/consulta os templates de mensagem da WABA-fonte (Terny) na Meta.
// So roda daqui (terminal do servidor) -- nunca exposto como rota web,
// pra nao precisar de um sistema de permissao de admin que o projeto
// ainda nao tem. NUNCA imprime o token.
//
// Uso:
//   node scripts/whatsapp-templates.mjs preview   -- mostra o JSON de cada template (nao envia nada)
//   node scripts/whatsapp-templates.mjs send      -- envia os que ainda nao existem na WABA
//   node scripts/whatsapp-templates.mjs status    -- consulta status (aprovado/pendente/rejeitado) dos 7

import nextEnv from '@next/env'
import { TEMPLATES_INICIAIS } from '../lib/whatsapp-templates-iniciais.mjs'
nextEnv.loadEnvConfig(process.cwd())

const GRAPH = 'https://graph.facebook.com'
const VERSION = process.env.META_API_VERSION || 'v21.0'
const TEMPLATES = TEMPLATES_INICIAIS

const modo = process.argv[2] ?? 'preview'

if (modo === 'preview') {
  console.log(JSON.stringify(TEMPLATES, null, 2))
  process.exit(0)
}

const wabaId = process.env.META_WABA_ID
const token = process.env.META_ACCESS_TOKEN?.replace(/^﻿/, '').trim()
if (!wabaId || !token) {
  console.error('META_WABA_ID / META_ACCESS_TOKEN não configurados no ambiente.')
  process.exit(1)
}

if (modo === 'send') {
  for (const t of TEMPLATES) {
    try {
      const res = await fetch(`${GRAPH}/${VERSION}/${wabaId}/message_templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(t),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) console.log(`OK   ${t.name} -> id ${data.id}`)
      else console.log(`ERRO ${t.name} -> (${res.status}) ${JSON.stringify(data.error ?? data).slice(0, 300)}`)
    } catch (e) {
      console.log(`ERRO ${t.name} -> ${e instanceof Error ? e.message : 'falha desconhecida'}`)
    }
  }
} else if (modo === 'status') {
  const nomes = new Set(TEMPLATES.map(t => t.name))
  const achados = []
  let url = `${GRAPH}/${VERSION}/${wabaId}/message_templates?fields=name,status,category,rejected_reason&limit=100`
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { console.error(`Falha ao consultar status (${res.status}): ${(await res.text()).slice(0, 300)}`); process.exit(1) }
    const data = await res.json()
    for (const t of (data.data ?? [])) if (nomes.has(t.name)) achados.push(t)
    url = data.paging?.next ?? null
  }
  for (const nome of nomes) {
    const t = achados.find(a => a.name === nome)
    if (!t) console.log(`${nome} | ainda não encontrado na WABA`)
    else console.log(`${t.name} | ${t.status}${t.rejected_reason && t.rejected_reason !== 'NONE' ? ' | motivo: ' + t.rejected_reason : ''}`)
  }
} else {
  console.error(`Modo desconhecido: ${modo}. Use preview, send ou status.`)
  process.exit(1)
}
