import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logErro } from '@/lib/log-erro'
import JSZip from 'jszip'

export const maxDuration = 60

/* Exporta os XMLs das notas (NFC-e) emitidas num mês, num .zip — o arquivo
   que a contabilidade usa. Filtra pelo mês de emissão (criado_em). */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const mes = (request.nextUrl.searchParams.get('mes') ?? '').match(/^\d{4}-\d{2}$/)
    ? request.nextUrl.searchParams.get('mes')!
    : new Date().toISOString().slice(0, 7)

  /* Intervalo do mês [início, próximo mês) */
  const [ano, m] = mes.split('-').map(Number)
  const inicio = new Date(Date.UTC(ano, m - 1, 1)).toISOString()
  const fim = new Date(Date.UTC(ano, m, 1)).toISOString()

  try {
    const { data: notas } = await supabase
      .from('notas_fiscais')
      .select('numero, chave, url_xml, status, criado_em')
      .eq('user_id', user.id)
      .in('status', ['autorizado', 'cancelado'])
      .not('url_xml', 'is', null)
      .gte('criado_em', inicio)
      .lt('criado_em', fim)
      .order('criado_em', { ascending: true })

    const lista = (notas ?? []) as { numero: string | null; chave: string | null; url_xml: string; status: string }[]
    if (!lista.length) {
      return NextResponse.json({ ok: false, erro: `Nenhuma nota emitida em ${mes}.` })
    }

    const focusToken = process.env.FOCUS_NFE_TOKEN ?? process.env.FOCUS_NFE_TOKEN_PRODUCAO ?? ''
    const authHeader = focusToken ? { Authorization: `Basic ${Buffer.from(`${focusToken}:`).toString('base64')}` } : undefined

    const zip = new JSZip()
    let adicionados = 0
    await Promise.all(lista.map(async (n) => {
      try {
        let res = await fetch(n.url_xml, { cache: 'no-store' })
        if (!res.ok && authHeader) res = await fetch(n.url_xml, { cache: 'no-store', headers: authHeader })
        if (!res.ok) return
        const xml = await res.text()
        const base = n.chave ? n.chave : (n.numero ? `nota-${n.numero}` : `nota-${adicionados + 1}`)
        const nome = n.status === 'cancelado' ? `${base}-cancelada.xml` : `${base}.xml`
        zip.file(nome, xml)
        adicionados++
      } catch { /* pula a que falhar */ }
    }))

    if (!adicionados) {
      return NextResponse.json({ ok: false, erro: 'Não consegui baixar os XMLs. Tente de novo em instantes.' })
    }

    const buf = await zip.generateAsync({ type: 'uint8array' })
    const bytes = new Uint8Array(buf.length)   // backed por ArrayBuffer (tipo que o Blob aceita)
    bytes.set(buf)
    const blob = new Blob([bytes], { type: 'application/zip' })
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="notas-${mes}.zip"`,
      },
    })
  } catch (err) {
    await logErro('fiscal/exportar-xml', err, { mes }, user.id)
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : 'falha' }, { status: 500 })
  }
}
