import { focusRequest, focusAmbiente } from '@/lib/fiscal/focus'

/* ══════════════════════════════════════════════════════════════
   REGISTRAR EMPRESA NA FOCUS — cadastra a loja (CNPJ + certificado +
   CSC) na conta Focus do Terny, pra ela poder emitir NFC-e.

   Lê os dados fiscais da loja e baixa o certificado .pfx do bucket
   privado. Roda quando o dono sobe o certificado. Campos podem precisar
   de ajuste fino na 1ª emissão de homologação (a Focus devolve o erro).
   ══════════════════════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registrarEmpresaFocus(admin: any, userId: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { data: cfg } = await admin.from('loja_config')
    .select('nome_loja, fiscal_cnpj, fiscal_razao_social, fiscal_ie, fiscal_regime, fiscal_csc, fiscal_csc_id, fiscal_cep, fiscal_logradouro, fiscal_numero, fiscal_bairro, fiscal_municipio, fiscal_uf, fiscal_cod_municipio, fiscal_cert_path, fiscal_cert_senha, owner_phone')
    .eq('user_id', userId).maybeSingle()

  if (!cfg?.fiscal_cnpj) return { ok: false, status: 0, data: { erro: 'Falta o CNPJ na configuração fiscal.' } }
  if (!cfg.fiscal_cert_path) return { ok: false, status: 0, data: { erro: 'Falta subir o certificado A1 (.pfx).' } }
  if (!cfg.fiscal_cert_senha) return { ok: false, status: 0, data: { erro: 'Falta a senha do certificado.' } }

  /* Baixa o certificado do bucket privado e converte pra base64 */
  const { data: file, error: dlErr } = await admin.storage.from('certificados').download(cfg.fiscal_cert_path)
  if (dlErr || !file) return { ok: false, status: 0, data: { erro: 'Não consegui ler o certificado no armazenamento.' } }
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const amb = focusAmbiente()
  const cscFields = amb === 'producao'
    ? { csc_nfce_producao: cfg.fiscal_csc, id_token_nfce_producao: cfg.fiscal_csc_id }
    : { csc_nfce_homologacao: cfg.fiscal_csc, id_token_nfce_homologacao: cfg.fiscal_csc_id }

  const payload = {
    nome: cfg.fiscal_razao_social || cfg.nome_loja,
    nome_fantasia: cfg.nome_loja || cfg.fiscal_razao_social,
    cnpj: String(cfg.fiscal_cnpj).replace(/\D/g, ''),
    inscricao_estadual: cfg.fiscal_ie,
    regime_tributario: cfg.fiscal_regime === 'simples' ? '1' : cfg.fiscal_regime === 'presumido' ? '2' : '3',
    logradouro: cfg.fiscal_logradouro,
    numero: cfg.fiscal_numero,
    bairro: cfg.fiscal_bairro,
    municipio: cfg.fiscal_municipio,
    uf: cfg.fiscal_uf,
    cep: String(cfg.fiscal_cep ?? '').replace(/\D/g, ''),
    codigo_municipio: cfg.fiscal_cod_municipio,
    telefone: String(cfg.owner_phone ?? '').replace(/\D/g, '') || undefined,
    habilita_nfce: true,
    arquivo_certificado_base64: base64,
    senha_certificado: cfg.fiscal_cert_senha,
    ...cscFields,
  }

  return focusRequest('POST', '/v2/empresas', payload)
}
