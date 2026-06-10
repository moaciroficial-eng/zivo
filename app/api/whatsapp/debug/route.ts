import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function evo(method: string, path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { apikey: API_KEY ?? '', 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  const text = await res.text()
  let body: unknown
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}

export async function GET(request: NextRequest) {
  const log: Record<string, unknown> = { config: { BASE_URL, INSTANCE } }

  // Passo 1: estado atual
  log['1_connectionState'] = await evo('GET', `/instance/connectionState/${INSTANCE}`)
  await wait(500)

  // Passo 2: restart
  log['2_restart'] = await evo('PUT', `/instance/restart/${INSTANCE}`)
  await wait(3000)

  // Passo 3: estado após restart
  log['3_stateAfterRestart'] = await evo('GET', `/instance/connectionState/${INSTANCE}`)
  await wait(1000)

  // Passo 4: connect / QR
  log['4_connect'] = await evo('GET', `/instance/connect/${INSTANCE}`)

  return NextResponse.json(log)
}
