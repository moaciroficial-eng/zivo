'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Template = {
  name: string
  status?: string
  bodyText?: string
  qtdVariaveis?: number
  botoes?: string[]
}

type Pessoa = { clienteId: string; contatoId: string | null; nome: string; phone: string }
type Excluidos = { semTelefone: number; optOut: number; duplicado: number }

const INPUT = 'w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#C79A54]/60 focus:ring-1 focus:ring-[#C79A54]/30 transition'
const LABEL = 'block text-xs font-medium text-zinc-400 mb-1.5'
const CARD = 'bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-4'

/* Mesma normalização de telefone BR do servidor (lib/whatsapp.ts) -- aqui é
   só pra montar a lista na hora de adicionar alguém manualmente; quem manda
   de fato é sempre o servidor, com a função original. */
function normalizarTelefoneBR(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  const with55 = d.startsWith('55') ? d : `55${d}`
  return with55.length === 12 && /^55\d{2}[6-9]/.test(with55) ? `${with55.slice(0, 4)}9${with55.slice(4)}` : with55
}

function renderPreview(bodyText: string | undefined, nomeExemplo: string, extras: string[]): string {
  if (!bodyText) return ''
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const i = Number(n)
    if (i === 1) return nomeExemplo
    return extras[i - 2]?.trim() || `[variável ${i}]`
  })
}

function PreviaWhatsApp({ texto, botoes }: { texto: string; botoes?: string[] }) {
  return (
    <div className="bg-[#0b141a] rounded-xl p-3 flex flex-col gap-2">
      <div className="bg-[#005c4b] text-zinc-100 text-sm rounded-xl rounded-tr-sm px-3 py-2 max-w-[90%] ml-auto whitespace-pre-wrap break-words">
        {texto || <span className="text-zinc-400 italic">(escreva o template pra ver a prévia)</span>}
      </div>
      {botoes && botoes.length > 0 && (
        <div className="flex flex-col gap-1 max-w-[90%] ml-auto w-full">
          {botoes.map((b, i) => (
            <div key={i} className="text-center text-xs text-[#53bdeb] bg-[#1f2c34] rounded-lg py-1.5">{b}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DisparoNovoClient() {
  const router = useRouter()
  const params = useSearchParams()
  const templatePreSelecionado = params.get('template')

  const [step, setStep] = useState<'template' | 'publico' | 'revisar'>('template')

  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [carregandoTemplates, setCarregandoTemplates] = useState(true)
  const [templateSel, setTemplateSel] = useState<Template | null>(null)
  const [extras, setExtras] = useState<string[]>([])

  const [genero, setGenero] = useState<'' | 'M' | 'F'>('')
  const [aniversariantes, setAniversariantes] = useState(false)
  const [compradosDias, setCompradosDias] = useState('')
  const [naoCompradosDias, setNaoCompradosDias] = useState('')

  const [buscandoPublico, setBuscandoPublico] = useState(false)
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null)
  const [excluidos, setExcluidos] = useState<Excluidos | null>(null)
  const [filtroLista, setFiltroLista] = useState('')
  const [buscaManual, setBuscaManual] = useState('')
  const [resultadosManual, setResultadosManual] = useState<{ id: string; nome: string; telefone: string }[]>([])

  const [custoPorMsg, setCustoPorMsg] = useState('')

  const [testeStatus, setTesteStatus] = useState<string | null>(null)
  const [testando, setTestando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/whatsapp/templates')
        const data = await res.json()
        const aprovados = ((data?.templates ?? []) as Template[]).filter(t => t.status === 'APPROVED')
        setTemplates(aprovados)
        if (templatePreSelecionado) {
          const match = aprovados.find(t => t.name === templatePreSelecionado)
          if (match) selecionarTemplate(match)
        }
      } catch {
        setTemplates([])
      } finally {
        setCarregandoTemplates(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selecionarTemplate(t: Template) {
    setTemplateSel(t)
    setExtras(Array.from({ length: Math.max(0, (t.qtdVariaveis ?? 1) - 1) }, () => ''))
  }

  async function buscarPublico() {
    setBuscandoPublico(true)
    setErro(null)
    try {
      const res = await fetch('/api/campanhas/disparo-template/publico', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genero: genero || null,
          aniversariantesMes: aniversariantes,
          compradosDesdeDias: compradosDias ? Number(compradosDias) : null,
          naoCompradosDesdeDias: naoCompradosDias ? Number(naoCompradosDias) : null,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro || 'Falha ao montar o público.'); return }
      setPessoas(data.pessoas ?? [])
      setExcluidos(data.excluidos ?? null)
    } catch {
      setErro('Falha ao montar o público.')
    } finally {
      setBuscandoPublico(false)
    }
  }

  async function buscarManual(termo: string) {
    setBuscaManual(termo)
    if (!termo.trim()) { setResultadosManual([]); return }
    try {
      const res = await fetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo)}`)
      const data = await res.json()
      setResultadosManual(data?.clientes ?? [])
    } catch { setResultadosManual([]) }
  }

  function adicionarManual(c: { id: string; nome: string; telefone: string }) {
    const phone = normalizarTelefoneBR(c.telefone)
    setPessoas(prev => {
      const lista = prev ?? []
      if (lista.some(p => p.phone === phone)) return lista
      return [...lista, { clienteId: c.id, contatoId: null, nome: c.nome, phone }]
    })
    setBuscaManual('')
    setResultadosManual([])
  }

  function removerPessoa(phone: string) {
    setPessoas(prev => (prev ?? []).filter(p => p.phone !== phone))
  }

  const listaFiltrada = useMemo(() => {
    const termo = filtroLista.trim().toLowerCase()
    if (!termo) return pessoas ?? []
    return (pessoas ?? []).filter(p => p.nome.toLowerCase().includes(termo))
  }, [pessoas, filtroLista])

  const previaTexto = templateSel ? renderPreview(templateSel.bodyText, 'Amanda', extras) : ''
  const custoTotal = custoPorMsg && pessoas ? Number(custoPorMsg) * pessoas.length : null

  async function enviarTeste() {
    if (!templateSel) return
    setTestando(true)
    setTesteStatus(null)
    try {
      const res = await fetch('/api/campanhas/disparo-template/teste', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName: templateSel.name, extras }),
      })
      const data = await res.json()
      setTesteStatus(data.ok ? 'Teste enviado pro seu WhatsApp! 📲' : (data.erro || 'Falha ao enviar o teste.'))
    } catch {
      setTesteStatus('Falha ao enviar o teste.')
    } finally {
      setTestando(false)
    }
  }

  async function confirmarDisparo() {
    if (!templateSel || !pessoas?.length) return
    setCriando(true)
    setErro(null)
    try {
      const res = await fetch('/api/campanhas/disparo-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: templateSel.name, extras, bodyText: templateSel.bodyText,
          pessoas,
          filtro: { genero: genero || null, aniversariantesMes: aniversariantes, compradosDesdeDias: compradosDias || null, naoCompradosDesdeDias: naoCompradosDias || null },
        }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro || 'Falha ao criar o disparo.'); setCriando(false); return }
      router.push(`/campanhas/disparo/${data.disparoId}`)
    } catch {
      setErro('Falha ao criar o disparo.')
      setCriando(false)
    }
  }

  const qtdVarsFaltando = extras.some(e => !e.trim())

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/campanhas" className="hover:text-zinc-300 transition">Campanhas</Link>
        <span>/</span>
        <span className="text-zinc-300">Disparar template</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {(['template', 'publico', 'revisar'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-semibold ${step === s ? 'bg-[#C79A54] text-zinc-950' : 'bg-zinc-800 text-zinc-500'}`}>{i + 1}</span>
            <span className={step === s ? 'text-zinc-200' : ''}>{s === 'template' ? 'Template' : s === 'publico' ? 'Público' : 'Revisar'}</span>
            {i < 2 && <span className="text-zinc-700">—</span>}
          </div>
        ))}
      </div>

      {erro && <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{erro}</div>}

      {step === 'template' && (
        <div className={CARD + ' flex flex-col gap-3'}>
          <h2 className="text-sm font-semibold text-zinc-200">Escolha o template aprovado</h2>
          {carregandoTemplates ? (
            <p className="text-sm text-zinc-500">Carregando…</p>
          ) : !templates?.length ? (
            <p className="text-sm text-zinc-500">Nenhum template aprovado ainda. Crie ou aguarde a aprovação na <Link href="/whatsapp/templates" className="text-[#C79A54] hover:underline">tela de Templates</Link>.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {templates.map(t => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => selecionarTemplate(t)}
                  className={`text-left px-3.5 py-3 rounded-xl border transition ${templateSel?.name === t.name ? 'border-[#C79A54] bg-[#C79A54]/10' : 'border-zinc-700/60 hover:border-zinc-500'}`}
                >
                  <p className="text-sm font-mono text-zinc-200">{t.name}</p>
                  {t.bodyText && <p className="text-xs text-zinc-500 mt-0.5 truncate">{t.bodyText}</p>}
                </button>
              ))}
            </div>
          )}

          {templateSel && (
            <>
              {Array.from({ length: extras.length }).map((_, i) => (
                <div key={i}>
                  <label className={LABEL}>Variável {'{{' + (i + 2) + '}}'}</label>
                  <input
                    value={extras[i] ?? ''}
                    onChange={e => setExtras(ex => { const novo = [...ex]; novo[i] = e.target.value; return novo })}
                    className={INPUT}
                  />
                </div>
              ))}
              <PreviaWhatsApp texto={previaTexto} botoes={templateSel.botoes} />
              <button
                type="button"
                disabled={qtdVarsFaltando}
                onClick={() => setStep('publico')}
                className="px-4 py-2.5 bg-[#C79A54] hover:bg-[#D4AB6A] disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition"
              >
                Continuar
              </button>
            </>
          )}
        </div>
      )}

      {step === 'publico' && (
        <div className={CARD + ' flex flex-col gap-4'}>
          <h2 className="text-sm font-semibold text-zinc-200">Quem vai receber</h2>

          <div>
            <label className={LABEL}>Gênero</label>
            <div className="flex gap-2">
              {([['', 'Todos'], ['F', 'Mulheres'], ['M', 'Homens']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setGenero(v)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${genero === v ? 'bg-[#C79A54] text-zinc-950 border-[#C79A54]' : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}>{label}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={aniversariantes} onChange={e => setAniversariantes(e.target.checked)} className="accent-[#C79A54]" />
            Aniversariantes do mês
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Comprou nos últimos (dias)</label>
              <input value={compradosDias} onChange={e => setCompradosDias(e.target.value.replace(/\D/g, ''))} placeholder="ex: 30" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>NÃO comprou nos últimos (dias)</label>
              <input value={naoCompradosDias} onChange={e => setNaoCompradosDias(e.target.value.replace(/\D/g, ''))} placeholder="ex: 60" className={INPUT} />
            </div>
          </div>

          <button
            type="button"
            onClick={buscarPublico}
            disabled={buscandoPublico}
            className="px-4 py-2.5 bg-zinc-700/60 hover:bg-zinc-700 disabled:opacity-50 text-sm text-zinc-200 font-semibold rounded-xl transition"
          >
            {buscandoPublico ? 'Buscando…' : 'Buscar público'}
          </button>

          {pessoas && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300 font-semibold">{pessoas.length} pessoa{pessoas.length !== 1 ? 's' : ''} vão receber</span>
              </div>
              {excluidos && (excluidos.semTelefone + excluidos.optOut + excluidos.duplicado) > 0 && (
                <p className="text-xs text-zinc-500">
                  Excluídos automaticamente: {excluidos.semTelefone} sem telefone válido, {excluidos.duplicado} telefone repetido, {excluidos.optOut} pediram pra não receber.
                </p>
              )}

              <input value={filtroLista} onChange={e => setFiltroLista(e.target.value)} placeholder="Buscar na lista…" className={INPUT} />

              <div className="max-h-56 overflow-y-auto flex flex-col gap-1 border border-zinc-700/60 rounded-xl p-2">
                {listaFiltrada.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">Ninguém na lista.</p>
                ) : listaFiltrada.map(p => (
                  <div key={p.phone} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-zinc-800/60">
                    <span className="text-sm text-zinc-300 truncate">{p.nome}</span>
                    <button type="button" onClick={() => removerPessoa(p.phone)} className="text-zinc-500 hover:text-red-400 transition shrink-0 ml-2">×</button>
                  </div>
                ))}
              </div>

              <div className="relative">
                <label className={LABEL}>Adicionar pessoa manualmente</label>
                <input value={buscaManual} onChange={e => buscarManual(e.target.value)} placeholder="Nome do cliente…" className={INPUT} />
                {resultadosManual.length > 0 && (
                  <div className="absolute z-10 w-full bg-zinc-800 border border-zinc-700 rounded-xl mt-1 overflow-hidden">
                    {resultadosManual.map(c => (
                      <button key={c.id} type="button" onClick={() => adicionarManual(c)} className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700/60 transition">{c.nome}</button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={pessoas.length === 0}
                onClick={() => setStep('revisar')}
                className="px-4 py-2.5 bg-[#C79A54] hover:bg-[#D4AB6A] disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition"
              >
                Continuar
              </button>
            </>
          )}
        </div>
      )}

      {step === 'revisar' && templateSel && pessoas && (
        <div className={CARD + ' flex flex-col gap-4'}>
          <h2 className="text-sm font-semibold text-zinc-200">Revisar e enviar</h2>

          <PreviaWhatsApp texto={previaTexto} botoes={templateSel.botoes} />

          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Destinatários</span>
            <span className="text-zinc-200 font-semibold">{pessoas.length}</span>
          </div>

          <div>
            <label className={LABEL}>Custo por mensagem (R$) — opcional, pra estimar o total</label>
            <input value={custoPorMsg} onChange={e => setCustoPorMsg(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="ex: 0,10" className={INPUT} />
            {custoTotal !== null && !isNaN(custoTotal) && (
              <p className="text-xs text-zinc-500 mt-1">Custo estimado: R${custoTotal.toFixed(2).replace('.', ',')}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={enviarTeste} disabled={testando} className="px-3.5 py-2 bg-zinc-700/60 hover:bg-zinc-700 disabled:opacity-50 text-xs text-zinc-200 font-semibold rounded-xl transition">
              {testando ? 'Enviando…' : 'Enviar teste pra mim'}
            </button>
            {testeStatus && <span className="text-xs text-zinc-400">{testeStatus}</span>}
          </div>

          <button
            type="button"
            onClick={confirmarDisparo}
            disabled={criando}
            className="px-4 py-3 bg-[#C79A54] hover:bg-[#D4AB6A] disabled:opacity-50 text-zinc-950 text-sm font-semibold rounded-xl transition"
          >
            {criando ? 'Enviando…' : `Enviar agora pra ${pessoas.length} pessoas`}
          </button>
        </div>
      )}
    </div>
  )
}
