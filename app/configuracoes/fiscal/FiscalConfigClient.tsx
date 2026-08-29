'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Cfg = {
  nome_loja: string | null
  endereco: string | null
  fiscal_ativo: boolean | null
  fiscal_cnpj: string | null
  fiscal_razao_social: string | null
  fiscal_ie: string | null
  fiscal_regime: string | null
  fiscal_csc: string | null
  fiscal_csc_id: string | null
  fiscal_ambiente: string | null
  fiscal_cep: string | null
  fiscal_logradouro: string | null
  fiscal_numero: string | null
  fiscal_bairro: string | null
  fiscal_municipio: string | null
  fiscal_uf: string | null
  fiscal_cod_municipio: string | null
  fiscal_cert_path: string | null
  fiscal_cert_validade: string | null
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border ${ok ? 'bg-[#00D4AA]/10 border-[#00D4AA]/30 text-[#00D4AA]' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{msg}</div>
  )
}

const inputClass = 'w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#3B6FFF]/60 focus:ring-1 focus:ring-[#3B6FFF]/30 transition'
const labelClass = 'block text-xs font-medium text-zinc-400 mb-1.5'
const soDigitos = (v: string) => v.replace(/\D/g, '')

export default function FiscalConfigClient({ user, cfg, temSenha }: { user: { id: string; email: string }; cfg: Cfg | null; temSenha: boolean }) {
  const supabase = createClient()

  const [ativo, setAtivo] = useState(cfg?.fiscal_ativo ?? false)
  const [cnpj, setCnpj] = useState(cfg?.fiscal_cnpj ?? '')
  const [razao, setRazao] = useState(cfg?.fiscal_razao_social ?? '')
  const [ie, setIe] = useState(cfg?.fiscal_ie ?? '')
  const [regime, setRegime] = useState(cfg?.fiscal_regime ?? 'simples')
  const [csc, setCsc] = useState(cfg?.fiscal_csc ?? '')
  const [cscId, setCscId] = useState(cfg?.fiscal_csc_id ?? '')
  const [ambiente, setAmbiente] = useState(cfg?.fiscal_ambiente ?? 'homologacao')

  const [cep, setCep] = useState(cfg?.fiscal_cep ?? '')
  const [logradouro, setLogradouro] = useState(cfg?.fiscal_logradouro ?? '')
  const [numero, setNumero] = useState(cfg?.fiscal_numero ?? '')
  const [bairro, setBairro] = useState(cfg?.fiscal_bairro ?? '')
  const [municipio, setMunicipio] = useState(cfg?.fiscal_municipio ?? '')
  const [uf, setUf] = useState(cfg?.fiscal_uf ?? '')
  const [codMun, setCodMun] = useState(cfg?.fiscal_cod_municipio ?? '')

  const [senha, setSenha] = useState('')          // vazio = mantém a atual
  const [validade, setValidade] = useState(cfg?.fiscal_cert_validade ?? '')
  const [certPath, setCertPath] = useState(cfg?.fiscal_cert_path ?? '')
  const [nomeArquivo, setNomeArquivo] = useState('')

  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enviandoCert, setEnviandoCert] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  async function buscarCep() {
    const c = soDigitos(cep)
    if (c.length !== 8) { showToast('CEP inválido.', false); return }
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const d = await res.json()
      if (d?.erro) { showToast('CEP não encontrado.', false); return }
      setLogradouro(d.logradouro || '')
      setBairro(d.bairro || '')
      setMunicipio(d.localidade || '')
      setUf(d.uf || '')
      setCodMun(d.ibge || '')  // código IBGE do município (necessário na nota)
      showToast('Endereço preenchido pelo CEP.')
    } catch { showToast('Falha ao buscar o CEP.', false) }
    finally { setBuscandoCep(false) }
  }

  async function enviarCertificado(file: File) {
    const nome = file.name.toLowerCase()
    if (!nome.endsWith('.pfx') && !nome.endsWith('.p12')) { showToast('O certificado deve ser um arquivo .pfx (ou .p12).', false); return }
    setEnviandoCert(true)
    try {
      const ext = nome.endsWith('.p12') ? 'p12' : 'pfx'
      const path = `${user.id}/certificado.${ext}`
      const { error } = await supabase.storage.from('certificados').upload(path, file, { upsert: true, contentType: 'application/x-pkcs12' })
      if (error) throw new Error(error.message)
      setCertPath(path)
      setNomeArquivo(file.name)
      showToast('Certificado enviado. Não esqueça de salvar.')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erro ao enviar o certificado.', false) }
    finally { setEnviandoCert(false) }
  }

  async function salvar() {
    if (ativo) {
      // validação mínima só quando a loja liga a emissão
      if (soDigitos(cnpj).length !== 14) { showToast('Informe um CNPJ válido (14 dígitos).', false); return }
      if (!razao.trim()) { showToast('Informe a razão social.', false); return }
      if (!ie.trim()) { showToast('Informe a Inscrição Estadual.', false); return }
      if (!csc.trim() || !cscId.trim()) { showToast('Informe o CSC e o ID do CSC (NFC-e).', false); return }
      if (!codMun) { showToast('Busque o CEP pra preencher o código do município.', false); return }
      if (!certPath) { showToast('Envie o certificado digital (.pfx).', false); return }
      if (!temSenha && !senha) { showToast('Informe a senha do certificado.', false); return }
    }
    setSaving(true)
    const payload: Record<string, unknown> = {
      user_id: user.id,
      fiscal_ativo: ativo,
      fiscal_cnpj: soDigitos(cnpj) || null,
      fiscal_razao_social: razao.trim() || null,
      fiscal_ie: ie.trim() || null,
      fiscal_regime: regime,
      fiscal_csc: csc.trim() || null,
      fiscal_csc_id: cscId.trim() || null,
      fiscal_ambiente: ambiente,
      fiscal_cep: soDigitos(cep) || null,
      fiscal_logradouro: logradouro.trim() || null,
      fiscal_numero: numero.trim() || null,
      fiscal_bairro: bairro.trim() || null,
      fiscal_municipio: municipio.trim() || null,
      fiscal_uf: uf.trim().toUpperCase() || null,
      fiscal_cod_municipio: soDigitos(codMun) || null,
      fiscal_cert_path: certPath || null,
      fiscal_cert_validade: validade || null,
    }
    if (senha) payload.fiscal_cert_senha = senha  // só sobrescreve se digitou uma nova
    const { error } = await supabase.from('loja_config').upsert(payload, { onConflict: 'user_id' })
    setSaving(false)
    if (error) showToast('Erro ao salvar: ' + error.message, false)
    else { showToast('Configuração fiscal salva!'); setSenha('') }
  }

  return (
    <div className="min-h-screen bg-[#080B10] p-6 md:p-8">
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Configuração Fiscal</h1>
          <p className="text-sm text-zinc-500 mt-1">Dados pra emitir a nota (NFC-e) na hora da venda. Seus dados ficam privados e só você acessa.</p>
        </div>

        {/* Aviso Fase 1 */}
        <div className="bg-amber-500/[0.07] border border-amber-500/25 rounded-2xl p-4 text-sm text-amber-200/90">
          <b>Etapa de configuração.</b> Aqui você guarda os dados fiscais e o certificado. A <b>emissão do cupom na venda</b> entra logo em seguida — pegue com sua contabilidade o certificado <b>A1 (.pfx)</b> e o <b>CSC de produção</b> da SEFAZ (o mesmo que você já usa hoje).
        </div>

        {/* Ligar emissão */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">Emitir nota nas vendas</p>
              <p className="text-xs text-zinc-500 mt-0.5">Quando ligado (e com tudo preenchido), o Zivo passa a emitir a NFC-e.</p>
            </div>
            <button type="button" onClick={() => setAtivo(!ativo)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${ativo ? 'bg-[#00D4AA]' : 'bg-zinc-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${ativo ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        {/* Dados da empresa */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#3B6FFF]" />Dados da empresa</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>CNPJ</label>
              <input className={inputClass} value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" />
            </div>
            <div>
              <label className={labelClass}>Inscrição Estadual</label>
              <input className={inputClass} value={ie} onChange={e => setIe(e.target.value)} placeholder="Sua IE" />
            </div>
          </div>
          <div>
            <label className={labelClass}>Razão social</label>
            <input className={inputClass} value={razao} onChange={e => setRazao(e.target.value)} placeholder="Razão social da empresa" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Regime tributário</label>
              <select className={inputClass} value={regime} onChange={e => setRegime(e.target.value)}>
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Ambiente</label>
              <select className={inputClass} value={ambiente} onChange={e => setAmbiente(e.target.value)}>
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção (nota real)</option>
              </select>
            </div>
          </div>
          {ambiente === 'producao' && (
            <p className="text-xs text-amber-400">⚠️ Em produção as notas são reais e válidas. Comece em homologação pra testar.</p>
          )}
        </div>

        {/* NFC-e (CSC) */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" />NFC-e (cupom)</h2>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <label className={labelClass}>CSC (Código de Segurança do Contribuinte)</label>
              <input className={inputClass} value={csc} onChange={e => setCsc(e.target.value)} placeholder="Token do CSC" />
            </div>
            <div>
              <label className={labelClass}>ID do CSC</label>
              <input className={inputClass} value={cscId} onChange={e => setCscId(e.target.value)} placeholder="Ex: 000001" />
            </div>
          </div>
          <p className="text-xs text-zinc-600">O CSC é gerado no portal da SEFAZ do seu estado (o mesmo usado no sistema atual). Use os dados de <b>{ambiente === 'producao' ? 'produção' : 'homologação'}</b>.</p>
        </div>

        {/* Endereço fiscal */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#3B6FFF]" />Endereço fiscal</h2>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label className={labelClass}>CEP</label>
              <input className={inputClass} value={cep} onChange={e => setCep(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarCep()} placeholder="00000-000" />
            </div>
            <button type="button" onClick={buscarCep} disabled={buscandoCep} className="py-2.5 px-4 rounded-xl border border-zinc-700 hover:border-[#3B6FFF]/50 text-sm font-medium text-zinc-200 transition disabled:opacity-50">
              {buscandoCep ? 'Buscando...' : 'Buscar CEP'}
            </button>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div>
              <label className={labelClass}>Logradouro</label>
              <input className={inputClass} value={logradouro} onChange={e => setLogradouro(e.target.value)} placeholder="Rua / Av." />
            </div>
            <div>
              <label className={labelClass}>Número</label>
              <input className={inputClass} value={numero} onChange={e => setNumero(e.target.value)} placeholder="123" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Bairro</label>
              <input className={inputClass} value={bairro} onChange={e => setBairro(e.target.value)} placeholder="Bairro" />
            </div>
            <div>
              <label className={labelClass}>Município</label>
              <input className={inputClass} value={municipio} onChange={e => setMunicipio(e.target.value)} placeholder="Cidade" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>UF</label>
              <input className={inputClass} value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="BA" />
            </div>
            <div>
              <label className={labelClass}>Código do município (IBGE)</label>
              <input className={inputClass} value={codMun} onChange={e => setCodMun(e.target.value)} placeholder="Preenchido pelo CEP" />
            </div>
          </div>
        </div>

        {/* Certificado digital */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />Certificado digital (A1)</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${certPath ? 'text-[#00D4AA] border-[#00D4AA]/30 bg-[#00D4AA]/10' : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'}`}>{certPath ? 'Enviado' : 'Não enviado'}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className={`inline-block text-sm font-medium border rounded-xl px-4 py-2.5 cursor-pointer transition ${enviandoCert ? 'opacity-50 pointer-events-none border-zinc-700' : 'border-zinc-700 hover:border-[#25D366]/50 text-zinc-200'}`}>
              {enviandoCert ? 'Enviando...' : certPath ? 'Trocar certificado (.pfx)' : 'Enviar certificado (.pfx)'}
              <input type="file" accept=".pfx,.p12,application/x-pkcs12" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) enviarCertificado(f); e.target.value = '' }} />
            </label>
            {nomeArquivo && <span className="text-xs text-zinc-500 truncate">{nomeArquivo}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Senha do certificado</label>
              <input type="password" className={inputClass} value={senha} onChange={e => setSenha(e.target.value)} placeholder={temSenha ? '•••••• (já salva)' : 'Senha do .pfx'} />
              {temSenha && <p className="text-xs text-zinc-600 mt-1">Deixe em branco pra manter a senha atual.</p>}
            </div>
            <div>
              <label className={labelClass}>Validade (opcional)</label>
              <input type="date" className={inputClass} value={validade} onChange={e => setValidade(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-zinc-600">🔒 O certificado vai pra um espaço privado — ninguém além de você e o Zivo acessa. Nunca compartilhe o .pfx nem a senha por WhatsApp/email.</p>
        </div>

        <button onClick={salvar} disabled={saving} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3B6FFF] to-[#00D4AA] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50">
          {saving ? 'Salvando...' : 'Salvar configuração fiscal'}
        </button>
      </div>
    </div>
  )
}
