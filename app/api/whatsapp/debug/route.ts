import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function evo(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: API_KEY ?? '', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { parsed = text }
  return { status: res.status, body: parsed }
}

export async function GET(_request: NextRequest) {
  const log: Record<string, unknown> = { config: { BASE_URL, INSTANCE } }

  log['1_delete']  = await evo('DELETE', `/instance/delete/${INSTANCE}`)
  await wait(1500)

  log['2_create']  = await evo('POST', '/instance/create', {
    instanceName: INSTANCE,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  })
  await wait(2000)

  log['3_connect'] = await evo('GET', `/instance/connect/${INSTANCE}`)

  return NextResponse.json(log)
}
