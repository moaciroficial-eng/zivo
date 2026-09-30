/* ══════════════════════════════════════════════════════════════
   FOCUS NFe — cliente da API fiscal (emissão de NFC-e)

   A Focus é o gateway: o Terny manda os dados da venda, ela assina e
   autoriza na SEFAZ. Auth = HTTP Basic com o token como usuário (senha
   vazia). Token vem de env (NUNCA no código): homologação p/ testar,
   produção p/ nota real. Ambiente por env FOCUS_NFE_AMBIENTE.
   ══════════════════════════════════════════════════════════════ */

export type FocusAmbiente = 'homologacao' | 'producao'

export function focusAmbiente(): FocusAmbiente {
  return process.env.FOCUS_NFE_AMBIENTE === 'producao' ? 'producao' : 'homologacao'
}

function baseUrl(amb: FocusAmbiente): string {
  return amb === 'producao'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br'
}

function tokenDoAmbiente(amb: FocusAmbiente): string | undefined {
  const t = amb === 'producao'
    ? (process.env.FOCUS_NFE_TOKEN_PRODUCAO ?? process.env.FOCUS_NFE_TOKEN)
    : (process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO ?? process.env.FOCUS_NFE_TOKEN)
  return t?.trim() || undefined
}

export function focusConfigurada(): boolean {
  return !!tokenDoAmbiente(focusAmbiente())
}

type FocusResp = { ok: boolean; status: number; data: unknown }

/* Requisição genérica à Focus. Nunca lança — devolve {ok,status,data}. */
export async function focusRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<FocusResp> {
  const amb = focusAmbiente()
  const token = tokenDoAmbiente(amb)
  if (!token) return { ok: false, status: 0, data: { erro: 'Focus NFe não configurada (falta o token no ambiente).' } }

  const auth = 'Basic ' + Buffer.from(`${token}:`).toString('base64')
  try {
    const res = await fetch(`${baseUrl(amb)}${path}`, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, data: { erro: e instanceof Error ? e.message : 'falha de rede' } }
  }
}

/* ── NFC-e ─────────────────────────────────────────────────────
   ref = identificador ÚNICO da nota no nosso lado (idempotência):
   reenviar a mesma ref não duplica a nota. */
export async function emitirNfce(ref: string, payload: unknown): Promise<FocusResp> {
  return focusRequest('POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, payload)
}
export async function consultarNfce(ref: string): Promise<FocusResp> {
  return focusRequest('GET', `/v2/nfce/${encodeURIComponent(ref)}`)
}
export async function cancelarNfce(ref: string, justificativa: string): Promise<FocusResp> {
  return focusRequest('DELETE', `/v2/nfce/${encodeURIComponent(ref)}`, { justificativa })
}

/* Lista as empresas cadastradas na conta (serve de teste de conexão). */
export async function listarEmpresas(): Promise<FocusResp> {
  return focusRequest('GET', '/v2/empresas')
}
