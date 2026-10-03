'use client'

import { useState } from 'react'

/* Modal pra emitir a NF-e (modelo 55) de uma venda — coleta os dados
   completos do destinatário (quem exige a nota "cheia"). Busca o endereço
   pelo CEP (ViaCEP) pra facilitar. */

type Resultado = { ok: boolean; titulo: string; msg: string; url?: string | null }

const input = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-[#C79A54] [color-scheme:dark]'
const label = 'block text-xs font-medium text-zinc-400 mb-1'

export default function NfeModal({
  vendaId, clienteNome, onClose, onResultado,
}: {
  vendaId: string
  clienteNome: string
  onClose: () => void
  onResultado: (r: Resultado, vendaId: string) => void
}) {
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF')
  const [documento, setDocumento] = useState('')
  const [nome, setNome] = useState(clienteNome && clienteNome !== 'Avulso' ? clienteNome : '')
  const [ie, setIe] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [uf, setUf] = useState('')
  const [complemento, setComplemento] = useState('')
  const [email, setEmail] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscarCep(v: string) {
    const d = v.replace(/\D/g, '')
    setCep(v)
    if (d.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const j = await res.json()
      if (!j.erro) {
        setLogradouro(j.logradouro ?? '')
        setBairro(j.bairro ?? '')
        setMunicipio(j.localidade ?? '')
        setUf(j.uf ?? '')
      }
    } catch { /* silencioso */ }
    finally { setBuscandoCep(false) }
  }

  async function emitir() {
    setErro(null)
    const doc = documento.replace(/\D/g, '')
    if (!nome.trim()) return setErro('Informe o nome / razão social.')
    if (doc.length !== 11 && doc.length !== 14) return setErro('CPF (11) ou CNPJ (14) inválido.')
    if (!logradouro.trim() || !municipio.trim() || !uf.trim() || cep.replace(/\D/g, '').length !== 8) {
      return setErro('Preencha o endereço (CEP, logradouro, município e UF).')
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/fiscal/emitir-nfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendaId,
          destinatario: { tipo, documento: doc, nome: nome.trim(), ie: ie.trim() || null, cep, logradouro: logradouro.trim(), numero: numero.trim(), bairro: bairro.trim(), municipio: municipio.trim(), uf: uf.trim(), complemento: complemento.trim() || null, email: email.trim() || null },
        }),
      })
      const d = await res.json()
      if (d.ok && (d.status === 'autorizado' || d.status === 'processando')) {
        onResultado(
          d.status === 'autorizado'
            ? { ok: true, titulo: 'NF-e emitida! 🎉', msg: `NF-e nº ${d.numero ?? ''} autorizada.`, url: d.url_danfe ?? null }
            : { ok: true, titulo: 'NF-e em processamento', msg: 'A SEFAZ está autorizando. Atualize a página em instantes.', url: d.url_danfe ?? null },
          vendaId,
        )
        onClose()
      } else {
        const msg = typeof d.mensagem === 'string' ? d.mensagem : d.mensagem ? JSON.stringify(d.mensagem) : d.erro ?? 'Não consegui emitir a NF-e.'
        setErro(String(msg))
      }
    } catch {
      setErro('Erro de conexão. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">Emitir NF-e (modelo 55)</h3>
        <p className="text-xs text-zinc-500 mt-1 mb-4">A nota &quot;cheia&quot;, pra quando o cliente ou a empresa exige. Preencha os dados de quem recebe.</p>

        <div className="flex gap-2 mb-4">
          {(['PF', 'PJ'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)} className={`flex-1 text-sm font-medium rounded-lg py-2 border transition ${tipo === t ? 'border-[#C79A54] bg-[#C79A54]/10 text-[#E0B36A]' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}`}>
              {t === 'PF' ? 'Pessoa Física (CPF)' : 'Empresa (CNPJ)'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{tipo === 'PF' ? 'CPF' : 'CNPJ'}</label>
              <input value={documento} onChange={e => setDocumento(e.target.value)} inputMode="numeric" placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} className={input} />
            </div>
            {tipo === 'PJ' && (
              <div>
                <label className={label}>Inscrição Estadual <span className="text-zinc-600">(ou vazio)</span></label>
                <input value={ie} onChange={e => setIe(e.target.value)} placeholder="ISENTO = deixe vazio" className={input} />
              </div>
            )}
          </div>
          <div>
            <label className={label}>{tipo === 'PF' ? 'Nome completo' : 'Razão social'}</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className={input} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>CEP {buscandoCep && <span className="text-zinc-600">buscando…</span>}</label>
              <input value={cep} onChange={e => buscarCep(e.target.value)} inputMode="numeric" placeholder="00000-000" className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>Logradouro</label>
              <input value={logradouro} onChange={e => setLogradouro(e.target.value)} className={input} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Número</label>
              <input value={numero} onChange={e => setNumero(e.target.value)} placeholder="S/N" className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>Bairro</label>
              <input value={bairro} onChange={e => setBairro(e.target.value)} className={input} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={label}>Município</label>
              <input value={municipio} onChange={e => setMunicipio(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>UF</label>
              <input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="BA" className={input} />
            </div>
          </div>
          <div>
            <label className={label}>E-mail <span className="text-zinc-600">(opcional — manda a nota pra ele)</span></label>
            <input value={email} onChange={e => setEmail(e.target.value)} inputMode="email" placeholder="cliente@email.com" className={input} />
          </div>
        </div>

        {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-4 break-words">{erro}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg py-2.5 transition">Cancelar</button>
          <button onClick={emitir} disabled={enviando} className="flex-1 text-sm font-semibold bg-[#C79A54] hover:bg-[#B98C46] disabled:opacity-60 text-[#16151A] rounded-lg py-2.5 transition">
            {enviando ? 'Emitindo…' : 'Emitir NF-e'}
          </button>
        </div>
      </div>
    </div>
  )
}
