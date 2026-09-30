import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { focusAmbiente, focusConfigurada } from '@/lib/fiscal/focus'

/* Verificador da configuração fiscal da loja — mostra o que está preenchido
   e o que falta (sem expor segredos). Ajuda a conferir antes de registrar. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const { data: c } = await supabase
    .from('loja_config')
    .select('nome_loja, fiscal_ativo, fiscal_cnpj, fiscal_razao_social, fiscal_ie, fiscal_regime, fiscal_ambiente, fiscal_csc, fiscal_csc_id, fiscal_cep, fiscal_municipio, fiscal_uf, fiscal_cod_municipio, fiscal_cert_path, fiscal_cert_senha')
    .eq('user_id', user.id).maybeSingle()

  const tem = (v: unknown) => !!(v && String(v).trim())
  const campos = {
    cnpj: c?.fiscal_cnpj ?? null,
    razao_social: tem(c?.fiscal_razao_social),
    inscricao_estadual: c?.fiscal_ie ?? null,
    regime: c?.fiscal_regime ?? null,
    csc: tem(c?.fiscal_csc),
    id_csc: c?.fiscal_csc_id ?? null,
    endereco_cep: c?.fiscal_cep ?? null,
    municipio: c?.fiscal_municipio ?? null,
    uf: c?.fiscal_uf ?? null,
    codigo_municipio_ibge: c?.fiscal_cod_municipio ?? null,
    certificado_enviado: tem(c?.fiscal_cert_path),
    senha_certificado: tem(c?.fiscal_cert_senha),
  }

  const faltando: string[] = []
  if (!tem(campos.cnpj)) faltando.push('CNPJ')
  if (!campos.razao_social) faltando.push('Razão social')
  if (!tem(campos.inscricao_estadual)) faltando.push('Inscrição Estadual')
  if (!campos.csc) faltando.push('CSC')
  if (!tem(campos.id_csc)) faltando.push('ID do CSC')
  if (!tem(campos.codigo_municipio_ibge)) faltando.push('Código do município (buscar CEP)')
  if (!campos.certificado_enviado) faltando.push('Certificado (.p12)')
  if (!campos.senha_certificado) faltando.push('Senha do certificado')

  return NextResponse.json({
    loja: c?.nome_loja ?? null,
    ambiente_terny: c?.fiscal_ambiente ?? 'homologacao',
    ambiente_focus: focusAmbiente(),
    focus_token_configurado: focusConfigurada(),
    emitir_ligado: !!c?.fiscal_ativo,
    campos,
    faltando,
    pronto_para_registrar: faltando.length === 0,
  })
}
