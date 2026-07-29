import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { normalizarTelefoneBR } from '@/lib/whatsapp'

/* Grava os clientes revisados. Normaliza telefone e NÃO duplica quem já
   existe (mesmo telefone). Devolve quantos entraram e quantos já existiam. */

type ClienteIn = {
  nome: string; telefone?: string | null; genero?: string | null
  tamanho_camiseta?: string | null; tamanho_calca?: string | null; tamanho_tenis?: string | null
  data_nascimento?: string | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { clientes } = await request.json() as { clientes: ClienteIn[] }
  if (!Array.isArray(clientes) || !clientes.length) return NextResponse.json({ ok: false, erro: 'Nada pra importar.' }, { status: 400 })

  /* telefones já existentes (últimos 8 dígitos) pra não duplicar */
  const { data: existentes } = await supabase.from('clientes').select('telefone').eq('user_id', user.id).limit(5000)
  const jaTem = new Set((existentes ?? []).map(c => String(c.telefone ?? '').replace(/\D/g, '').slice(-8)).filter(Boolean))

  const g = (v: unknown) => { const c = String(v ?? '').toUpperCase().charAt(0); return c === 'M' || c === 'F' ? c : null }
  const limpo = (v: unknown) => { const s = String(v ?? '').trim(); return s && s.toLowerCase() !== 'null' ? s : null }

  let inseridos = 0, duplicados = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  for (const c of clientes) {
    if (!c?.nome?.trim()) continue
    const digitos = String(c.telefone ?? '').replace(/\D/g, '')
    const last8 = digitos.slice(-8)
    if (last8 && jaTem.has(last8)) { duplicados++; continue }
    if (last8) jaTem.add(last8)
    rows.push({
      user_id: user.id,
      nome: c.nome.trim(),
      telefone: digitos ? normalizarTelefoneBR(digitos) : null,
      genero: g(c.genero),
      tamanho_camiseta: limpo(c.tamanho_camiseta),
      tamanho_calca: limpo(c.tamanho_calca),
      tamanho_tenis: limpo(c.tamanho_tenis),
      data_nascimento: limpo(c.data_nascimento),
    })
  }

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('clientes').insert(rows.slice(i, i + 500))
      if (error) return NextResponse.json({ ok: false, erro: error.message, inseridos }, { status: 500 })
      inseridos += rows.slice(i, i + 500).length
    }
  }

  return NextResponse.json({ ok: true, inseridos, duplicados })
}
