import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import FiscalConfigClient from './FiscalConfigClient'

export const metadata: Metadata = { title: 'Configuração Fiscal — Zivo' }

export default async function FiscalConfigPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: cfg } = await supabase
    .from('loja_config')
    .select('nome_loja, endereco, fiscal_ativo, fiscal_cnpj, fiscal_razao_social, fiscal_ie, fiscal_regime, fiscal_csc, fiscal_csc_id, fiscal_ambiente, fiscal_cep, fiscal_logradouro, fiscal_numero, fiscal_bairro, fiscal_municipio, fiscal_uf, fiscal_cod_municipio, fiscal_cert_path, fiscal_cert_validade')
    .eq('user_id', user.id)
    .maybeSingle()

  // Não mandamos a senha do certificado pro cliente; só sinalizamos se já existe.
  const { data: cfgSenha } = await supabase
    .from('loja_config').select('fiscal_cert_senha').eq('user_id', user.id).maybeSingle()

  return (
    <FiscalConfigClient
      user={{ id: user.id, email: user.email ?? '' }}
      cfg={cfg ?? null}
      temSenha={!!cfgSenha?.fiscal_cert_senha}
    />
  )
}
