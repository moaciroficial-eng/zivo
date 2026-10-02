import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { lerCertificadosP12, type CertInfo } from '@/lib/fiscal/cert-info'
import { logErro } from '@/lib/log-erro'

/* Mostra a validade REAL do certificado que está salvo no Terny — ajuda a
   entender o erro "prazo de validade vencido": se o arquivo subido é o
   antigo (vencido) ou se o pacote traz o certificado velho junto do novo.
   Cada loja vê só o próprio (dado do user logado). GET pra abrir no link. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: cfg } = await admin
    .from('loja_config')
    .select('fiscal_cert_path, fiscal_cert_senha')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!cfg?.fiscal_cert_path) return NextResponse.json({ ok: false, erro: 'Nenhum certificado enviado ainda.' })
  if (!cfg.fiscal_cert_senha) return NextResponse.json({ ok: false, erro: 'Falta a senha do certificado.' })

  /* Quando o arquivo foi enviado pro Terny (pista forte se é o antigo) */
  let enviado_em: string | null = null
  try {
    const partes = cfg.fiscal_cert_path.split('/')
    const nome = partes.pop()!
    const dir = partes.join('/')
    const { data: lista } = await admin.storage.from('certificados').list(dir || undefined)
    const f = (lista ?? []).find(x => x.name === nome)
    enviado_em = (f?.updated_at as string) ?? (f?.created_at as string) ?? null
  } catch { /* segue sem a data */ }

  const { data: file, error } = await admin.storage.from('certificados').download(cfg.fiscal_cert_path)
  if (error || !file) return NextResponse.json({ ok: false, erro: 'Não consegui ler o certificado no armazenamento.' })
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
    catch { return iso }
  }

  try {
    const certs = lerCertificadosP12(base64, String(cfg.fiscal_cert_senha))
    const daLoja = certs.filter(c => !c.eh_autoridade)
    const principal = (daLoja.length ? daLoja : certs)
      .slice()
      .sort((a, b) => new Date(b.ate).getTime() - new Date(a.ate).getTime())[0] as CertInfo | undefined

    return NextResponse.json({
      ok: true,
      arquivo: cfg.fiscal_cert_path.split('/').pop(),
      enviado_em,
      certificado_da_loja: principal && {
        titular: principal.titular,
        valido_de: fmt(principal.de),
        valido_ate: fmt(principal.ate),
        vencido: principal.vencido,
        dias_restantes: principal.dias_restantes,
      },
      resumo: principal
        ? (principal.vencido
            ? `VENCIDO em ${fmt(principal.ate)} — precisa subir o certificado novo.`
            : `Válido até ${fmt(principal.ate)} (${principal.dias_restantes} dias). Este arquivo NÃO está vencido.`)
        : 'Não encontrei o certificado da loja dentro do arquivo.',
      todos_no_arquivo: certs.map(c => ({
        titular: c.titular, de: fmt(c.de), ate: fmt(c.ate), vencido: c.vencido, autoridade: c.eh_autoridade,
      })),
    })
  } catch (err) {
    await logErro('fiscal/certificado', err, undefined, user.id)
    return NextResponse.json({
      ok: false,
      erro: 'Não consegui abrir o certificado — senha errada ou arquivo inválido.',
      detalhe: err instanceof Error ? err.message : String(err),
    })
  }
}
