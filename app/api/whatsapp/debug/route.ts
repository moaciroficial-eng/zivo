import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BASE_URL = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
const API_KEY  = process.env.EVOLUTION_API_KEY
const INSTANCE = process.env.EVOLUTION_INSTANCE

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    config: { BASE_URL, INSTANCE, API_KEY: API_KEY ? '***' + API_KEY.slice(-4) : 'MISSING' },
  }

  const headers = { apikey: API_KEY ?? '', 'Content-Type': 'application/json' }

  const endpoints = [
    { key: 'fetchInstances',   method: 'GET',    path: `/instance/fetchInstances` },
    { key: 'connectionState',  method: 'GET',    path: `/instance/connectionState/${INSTANCE}` },
    { key: 'connect',          method: 'GET',    path: `/instance/connect/${INSTANCE}` },
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, { method: ep.method, headers, cache: 'no-store' })
      const text = await res.text()
      let json: unknown
      try { json = JSON.parse(text) } catch { json = text }
      results[ep.key] = { status: res.status, body: json }
    } catch (e) {
      results[ep.key] = { error: String(e) }
    }
  }

  return NextResponse.json(results, { status: 200 })
}
