'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type CampanhaRow = {
  id: string; nome: string; objetivo: string | null; produto_marca?: string | null
  copy_whatsapp: string | null; status: string; created_at: string
}
type DataProxima = { nome: string; dias: number; data: string; aprox?: boolean }
type Metricas = { enviados: number; respostas: number; conversoes: number; receita: number; taxaConversao: number; taxaResposta: number }
type DetalheCampanha = {
  campanha: CampanhaRow
  metricas: Metricas
  leads: { nome: string | null; status: string; converteu: boolean }[]
}

type Proposta = {
  titulo: string
  objetivo: string
  tamanhos: string[]
  marca: string | null
  genero?: string | null
  intensidade?: string | null
  copy_descritor: string
  copy_texto: string
  produtos_destaque: string[]
  desconto: string | null
}
type Publico = { id: string; nome: string; telefone: string | null; motivo: string }
type Espera = 'texto' | 'produto' | 'foto' | 'opcoes'
type Msg = { papel: 'dono' | 'consultora'; conteudo: string; foto?: string; opcoes?: string[]; espera?: Espera }
type Produto = {
  id: string; nome: string; marca: string | null; cor: string | null
  genero: string | null; preco: number | null; tamanhos: string[]; resumo: string
}
type SelProduto = { produto: Produto; tamanhos: string[] }

const SUGESTOES = [
  'Chegou um produto e quero zerar a grade dele',
  'Quero girar uma peça que tá parada no estoque',
  'Quero reativar clientes que sumiram',
]

function generoLabel(g: string | null | undefined): string {
  const c = String(g ?? '').toUpperCase().charAt(0)
  return c === 'M' ? 'masculino' : c === 'F' ? 'feminino' : 'unissex'
}
function generoDominante(sels: SelProduto[]): string | null {
  const gs = sels.map(s => String(s.produto.genero ?? '').toUpperCase().charAt(0)).filter(g => g === 'M' || g === 'F')
  if (gs.length === 0) return null
  if (gs.every(g => g === 'M')) return 'M'
  if (gs.every(g => g === 'F')) return 'F'
  return null
}

export default function CampanhasClient({ campanhas: campanhasInit, datas = [] }: { campanhas: CampanhaRow[]; datas?: DataProxima[] }) {
  const [campanhas, setCampanhas] = useState<CampanhaRow[]>(campanhasInit)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [pensando, setPensando] = useState(false)
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [publico, setPublico] = useState<Publico[]>([])
  const [copyEditada, setCopyEditada] = useState('')
  const [disparando, setDisparando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  /* Foto do produto (fica anexada até o disparo) */
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Escape: força o campo de texto mesmo quando a IA espera produto/foto */
  const [forcarTexto, setForcarTexto] = useState(false)

  /* Picker de produtos do estoque (multi-seleção) */
  const [pickerAberto, setPickerAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Produto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [selecionados, setSelecionados] = useState<SelProduto[]>([])

  /* Detalhe/resultado de campanha */
  const [detalhe, setDetalhe] = useState<DetalheCampanha | null>(null)
  const [carregandoDet, setCarregandoDet] = useState(false)
  const [acaoDet, setAcaoDet] = useState(false)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, pensando])

  /* ─── histórico / resultado ─── */
  async function abrirDetalhe(id: string) {
    setCarregandoDet(true); setDetalhe(null)
    try {
      const res = await fetch(`/api/campanhas/${id}`)
      const data = await res.json()
      if (data.ok) setDetalhe(data)
    } catch { /* ignora */ } finally { setCarregandoDet(false) }
  }
  async function salvarCampanha(id: string) {
    setAcaoDet(true)
    try {
      await fetch(`/api/campanhas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'salva' }) })
      setCampanhas(prev => prev.map(c => c.id === id ? { ...c, status: 'salva' } : c))
      setDetalhe(d => d ? { ...d, campanha: { ...d.campanha, status: 'salva' } } : d)
    } catch { /* ignora */ } finally { setAcaoDet(false) }
  }
  async function apagarCampanha(id: string) {
    if (!confirm('Apagar essa campanha do histórico? Não dá pra desfazer.')) return
    setAcaoDet(true)
    try {
      await fetch(`/api/campanhas/${id}`, { method: 'DELETE' })
      setCampanhas(prev => prev.filter(c => c.id !== id))
      setDetalhe(null)
    } catch { /* ignora */ } finally { setAcaoDet(false) }
  }

  /* ─── picker ─── */
  useEffect(() => {
    if (!pickerAberto) return
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/campanhas/produtos?termo=${encodeURIComponent(busca)}`)
        const data = await res.json()
        setResultados(data.produtos ?? [])
      } catch { setResultados([]) } finally { setBuscando(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [busca, pickerAberto])

  function abrirPicker() { setPickerAberto(true); setBusca('') }
  function estaSelecionado(id: string) { return selecionados.some(s => s.produto.id === id) }
  function toggleProduto(p: Produto) {
    setSelecionados(prev => prev.some(s => s.produto.id === p.id)
      ? prev.filter(s => s.produto.id !== p.id)
      : [...prev, { produto: p, tamanhos: [...p.tamanhos] }])
  }
  function toggleTamanho(id: string, t: string) {
    setSelecionados(prev => prev.map(s => s.produto.id !== id ? s : {
      ...s, tamanhos: s.tamanhos.includes(t) ? s.tamanhos.filter(x => x !== t) : [...s.tamanhos, t],
    }))
  }
  function confirmarSelecao() {
    const validos = selecionados.filter(s => s.tamanhos.length > 0)
    if (validos.length === 0) return
    const linhas = validos.map((s, i) => {
      const p = s.produto
      const attrs = [p.marca, p.cor, generoLabel(p.genero)].filter(Boolean).join(', ')
      const preco = p.preco != null ? ` — R$ ${Number(p.preco).toFixed(2).replace('.', ',')}` : ''
      return `${i + 1}) ${p.nome} (${attrs}) — vender tamanhos ${s.tamanhos.join(', ')}${preco}`
    }).join('\n')
    const g = generoDominante(validos)
    const nota = g ? `\n(Produto ${g === 'M' ? 'masculino' : 'feminino'} — não oferecer pro gênero oposto.)` : ''
    setPickerAberto(false)
    setSelecionados([])
    enviar(`Selecionei do estoque pra campanha:\n${linhas}${nota}\nMonta a campanha em cima desses produtos.`)
  }

  /* ─── foto ─── */
  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setEnviandoFoto(true); setErro(null)
    try {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `campanhas/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('biblioteca').upload(path, file, { contentType: file.type || 'image/jpeg' })
      if (error) { setErro('Não consegui subir a foto. Tenta de novo.'); return }
      const { data: { publicUrl } } = supabase.storage.from('biblioteca').getPublicUrl(path)
      setFotoUrl(publicUrl)
      enviar('Anexei a foto do produto. Dá uma olhada e usa ela pra deixar a campanha melhor.', publicUrl)
    } catch { setErro('Falha ao enviar a foto.') } finally { setEnviandoFoto(false) }
  }

  /* ─── conversa ─── */
  async function enviar(texto?: string, fotoVision?: string) {
    const conteudo = (texto ?? input).trim()
    if ((!conteudo && !fotoVision) || pensando) return
    setInput(''); setErro(null); setResultado(null); setForcarTexto(false)
    const novos: Msg[] = [...msgs, { papel: 'dono', conteudo, foto: fotoVision }]
    setMsgs(novos); setPensando(true)
    try {
      const res = await fetch('/api/campanhas/consultora', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: conteudo, historico: msgs, foto: fotoVision ?? null }),
      })
      const data = await res.json()
      if (!data.ok) { setErro('A consultora tropeçou. Tenta de novo.'); return }
      setMsgs(prev => [...prev, { papel: 'consultora', conteudo: data.resposta, opcoes: data.opcoes ?? [], espera: data.espera ?? 'texto' }])
      if (data.proposta) {
        setProposta(data.proposta)
        setPublico(data.publico ?? [])
        setCopyEditada(data.proposta.copy_texto ?? '')
      }
    } catch { setErro('Erro de conexão.') } finally { setPensando(false) }
  }

  async function aprovarEnviar() {
    if (!proposta || disparando) return
    if (publico.length === 0) { setErro('Nenhum cliente casou com esses tamanhos.'); return }
    setDisparando(true); setErro(null)
    try {
      const res = await fetch('/api/campanhas/consultora/disparar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: proposta.titulo,
          objetivo: proposta.objetivo,
          marca: proposta.marca,
          copy_texto: copyEditada,
          copy_descritor: proposta.copy_descritor,
          publico_ids: publico.map(p => p.id),
          foto_url: fotoUrl,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setErro(data.erro ?? 'Falha ao enviar.'); return }
      setResultado(`✅ Oferta enviada para ${data.enviados} cliente(s)! ${data.por_template ?? 0} por template (frios) e ${data.por_texto ?? 0} direto (quentes)${fotoUrl ? ' — com foto pros quentes' : ''}. O resultado aparece no histórico.`)
      if (data.campanhaId) {
        setCampanhas(prev => [{
          id: data.campanhaId, nome: proposta.titulo, objetivo: proposta.objetivo,
          produto_marca: proposta.marca, copy_whatsapp: copyEditada, status: 'ativa',
          created_at: new Date().toISOString(),
        }, ...prev])
      }
      setProposta(null); setPublico([]); setFotoUrl(null)
    } catch { setErro('Erro de conexão.') } finally { setDisparando(false) }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.25rem)] lg:h-screen max-w-3xl mx-auto w-full px-4 py-4 gap-3">
      <div className="shrink-0">
        <h1 className="text-lg font-bold text-white">🎯 Consultora de Campanhas</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Me conta o que você quer vender que eu monto a oferta e acho os clientes certos.</p>
      </div>

      {/* Conversa */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 pr-1">
        {msgs.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">💡</p>
            <p className="text-zinc-300 font-medium">O que a gente vende hoje?</p>
            <div className="flex flex-col gap-2 mt-4 max-w-sm mx-auto">
              <button onClick={abrirPicker}
                className="text-left text-sm bg-violet-600 hover:bg-violet-500 text-white px-3 py-2.5 rounded-lg transition cursor-pointer font-medium">
                📦 Escolher produtos do estoque
              </button>
              <p className="text-[11px] text-zinc-600 py-1">ou me conta o objetivo:</p>
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)}
                  className="text-left text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/60 text-zinc-400 px-3 py-2 rounded-lg transition cursor-pointer">
                  {s}
                </button>
              ))}
            </div>

            {datas.length > 0 && (
              <div className="mt-6 max-w-sm mx-auto text-left">
                <p className="text-[11px] font-semibold text-zinc-500 mb-2 px-1">📅 Tá chegando — monta antes que passe</p>
                <div className="flex flex-col gap-2">
                  {datas.slice(0, 3).map(d => (
                    <button key={d.nome}
                      onClick={() => enviar(`Quero montar uma campanha pro ${d.nome}, que é em ${d.dias} dias. Me ajuda a pensar a melhor oferta pra essa data.`)}
                      className="flex items-center justify-between gap-2 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 text-left px-3 py-2.5 rounded-lg transition cursor-pointer">
                      <span className="text-sm text-amber-200 font-medium">{d.nome}</span>
                      <span className="text-[11px] text-amber-400/80 shrink-0">
                        {d.dias === 0 ? 'é hoje!' : d.dias === 1 ? 'amanhã' : `em ${d.dias} dias`}{d.aprox ? ' ~' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.papel === 'dono' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
              m.papel === 'dono' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
            }`}>
              {m.foto && <img src={m.foto} alt="produto" className="rounded-lg mb-2 max-h-40 w-auto" />}
              {m.conteudo}
            </div>
            {/* Opções clicáveis (só na última mensagem da consultora, antes da proposta) */}
            {m.papel === 'consultora' && i === msgs.length - 1 && (m.opcoes?.length ?? 0) > 0 && !proposta && !pensando && (
              <div className="flex flex-wrap gap-2 mt-2">
                {m.opcoes!.map(op => (
                  <button key={op} onClick={() => enviar(op)}
                    className="text-sm bg-violet-600/20 hover:bg-violet-600 border border-violet-500/40 text-violet-200 hover:text-white px-3.5 py-2 rounded-full transition cursor-pointer font-medium">
                    {op}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {pensando && <div className="flex justify-start"><div className="bg-zinc-800 text-zinc-500 rounded-2xl px-4 py-2.5 text-sm animate-pulse">pensando...</div></div>}

        {/* Proposta pronta */}
        {proposta && (
          <div className="rounded-2xl border border-violet-500/40 bg-violet-500/5 p-4 flex flex-col gap-3">
            <div>
              <p className="text-base font-bold text-white">{proposta.titulo}</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {proposta.tamanhos?.length ? `Tamanhos: ${proposta.tamanhos.join(', ')}` : ''}
                {proposta.marca ? ` · ${proposta.marca}` : ''}
                {proposta.genero ? ` · ${generoLabel(proposta.genero)}` : ''}
                {proposta.desconto ? ` · ${proposta.desconto} off` : ''}
                {proposta.intensidade ? ` · tom ${proposta.intensidade === 'agressiva' ? 'agressivo' : 'de boa'}` : ''}
              </p>
            </div>

            <div className="rounded-lg bg-zinc-900/60 border border-zinc-700/40 p-3">
              <p className="text-xs font-semibold text-zinc-400 mb-2">👥 {publico.length} cliente(s) vão receber <span className="text-zinc-600 font-normal">— tira quem já comprou na 🗑️</span></p>
              {publico.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {publico.map(p => (
                    <span key={p.id} title={p.motivo}
                      className="group flex items-center gap-1 text-[12px] bg-zinc-700/80 text-zinc-100 pl-2.5 pr-1 py-1 rounded-full">
                      {p.nome.split(' ')[0]}
                      <button onClick={() => setPublico(prev => prev.filter(x => x.id !== p.id))}
                        title="Tirar da lista" className="text-zinc-400 hover:text-red-300 px-0.5 cursor-pointer leading-none">🗑️</button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500">Ninguém na lista. Ajusta os tamanhos ou o gênero com a consultora.</p>
              )}
            </div>

            {fotoUrl && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <img src={fotoUrl} alt="" className="h-10 w-10 rounded object-cover" />
                📷 Foto vai junto pros clientes quentes
                <button onClick={() => setFotoUrl(null)} className="text-zinc-500 hover:text-zinc-300 ml-auto cursor-pointer">remover</button>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-zinc-400 mb-1">💬 Copy (edite à vontade — {'{nome}'} vira o primeiro nome)</p>
              <textarea value={copyEditada} onChange={e => setCopyEditada(e.target.value)} rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 resize-y focus:outline-none focus:border-violet-500 [color-scheme:dark]" />
              <p className="mt-1.5 text-[11px] text-zinc-600">Quer outro tom ou ajuste? É só pedir na conversa (&quot;deixa mais agressiva&quot;).</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={aprovarEnviar} disabled={disparando || publico.length === 0}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                {disparando ? 'Enviando...' : `📤 Aprovar e enviar (${publico.length})`}
              </button>
              <button onClick={() => setProposta(null)} disabled={disparando}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm transition cursor-pointer">
                Descartar
              </button>
            </div>
          </div>
        )}

        {erro && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-300">{erro}</div>}
        {resultado && <div className="rounded-xl border border-[#00D4AA]/30 bg-[#00D4AA]/5 p-4 text-sm text-zinc-200">{resultado}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Foto anexada (fora da proposta) */}
      {fotoUrl && !proposta && (
        <div className="shrink-0 flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-2">
          <img src={fotoUrl} alt="" className="h-9 w-9 rounded object-cover" />
          <span className="text-xs text-zinc-300">📷 Foto anexada à campanha</span>
          <button onClick={() => setFotoUrl(null)} className="text-zinc-500 hover:text-zinc-300 text-xs px-1 ml-auto cursor-pointer">remover</button>
        </div>
      )}

      {/* Input contextual — aparece conforme o que a consultora está pedindo */}
      <input ref={fileRef} type="file" accept="image/*" onChange={onFoto} className="hidden" />
      {(() => {
        const ultima = msgs.length > 0 ? msgs[msgs.length - 1] : null
        const base: Espera = (!pensando && !proposta && ultima?.papel === 'consultora') ? (ultima.espera ?? 'texto') : 'texto'
        const modo: Espera = forcarTexto ? 'texto' : base

        if (pensando) return null

        /* Passo: escolher produto do estoque */
        if (modo === 'produto') return (
          <div className="shrink-0 border-t border-zinc-800 pt-3 flex flex-col gap-2">
            <button onClick={abrirPicker}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition cursor-pointer">
              📦 Escolher produtos do estoque
            </button>
            <button onClick={() => setForcarTexto(true)} className="text-[11px] text-zinc-500 hover:text-zinc-300 self-center cursor-pointer">prefiro escrever</button>
          </div>
        )

        /* Passo: subir foto (ou seguir sem) — antes de gerar a copy */
        if (modo === 'foto') return (
          <div className="shrink-0 border-t border-zinc-800 pt-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={enviandoFoto}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                {enviandoFoto ? '⏳ Subindo...' : '📷 Subir foto do produto'}
              </button>
              <button onClick={() => enviar('Seguir sem foto, pode gerar a copy.')} disabled={enviandoFoto}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition cursor-pointer">
                Seguir sem foto
              </button>
            </div>
            <button onClick={() => setForcarTexto(true)} className="text-[11px] text-zinc-500 hover:text-zinc-300 self-center cursor-pointer">prefiro escrever</button>
          </div>
        )

        /* Passo: escolha clicável — as opções aparecem embaixo da mensagem;
           aqui só um atalho pra escrever, caso queira */
        if (modo === 'opcoes') return (
          <div className="shrink-0 border-t border-zinc-800 pt-3">
            <button onClick={() => setForcarTexto(true)} className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer">responder escrevendo →</button>
          </div>
        )

        /* Padrão: campo de texto */
        return (
          <div className="flex gap-2 shrink-0 border-t border-zinc-800 pt-3">
            <textarea autoFocus value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Responde a consultora..." rows={1}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-violet-500 [color-scheme:dark]" />
            <button onClick={() => enviar()} disabled={!input.trim()}
              className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition cursor-pointer">Enviar</button>
          </div>
        )
      })()}

      {/* Modal do picker de produtos (multi-seleção) */}
      {pickerAberto && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 p-0 lg:p-4" onClick={() => setPickerAberto(false)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full lg:max-w-lg bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-2xl flex flex-col max-h-[85dvh]">
            <div className="p-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-white">📦 Escolher produtos ({selecionados.length})</p>
                <button onClick={() => setPickerAberto(false)} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">✕</button>
              </div>
              <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, marca ou cor..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-2">
              {buscando && <p className="text-center text-xs text-zinc-500 py-6 animate-pulse">buscando...</p>}
              {!buscando && resultados.length === 0 && (
                <p className="text-center text-xs text-zinc-500 py-6">Nenhum produto com estoque encontrado.</p>
              )}
              {resultados.map(p => {
                const sel = selecionados.find(s => s.produto.id === p.id)
                return (
                  <div key={p.id} className={`rounded-lg px-3 py-2.5 mb-1 transition ${estaSelecionado(p.id) ? 'bg-violet-500/10 border border-violet-500/30' : 'hover:bg-zinc-800 border border-transparent'}`}>
                    <button onClick={() => toggleProduto(p)} className="w-full text-left flex items-center justify-between gap-2 cursor-pointer">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-100 font-medium truncate">{estaSelecionado(p.id) ? '✓ ' : ''}{p.nome}</p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {[p.marca, p.cor, generoLabel(p.genero)].filter(Boolean).join(' · ')} · {p.resumo}
                        </p>
                      </div>
                      {p.preco != null && (
                        <span className="text-xs text-[#00D4AA] font-semibold shrink-0">R$ {Number(p.preco).toFixed(2).replace('.', ',')}</span>
                      )}
                    </button>
                    {sel && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="text-[10px] text-zinc-500 mr-1 self-center">vender:</span>
                        {p.tamanhos.map(t => (
                          <button key={t} onClick={() => toggleTamanho(p.id, t)}
                            className={`text-[11px] px-2 py-0.5 rounded-full transition cursor-pointer ${sel.tamanhos.includes(t) ? 'bg-violet-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>{t}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {selecionados.length > 0 && (
              <div className="p-3 border-t border-zinc-800 shrink-0">
                <button onClick={confirmarSelecao}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                  Confirmar {selecionados.length} produto(s) →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico de campanhas */}
      {campanhas.length > 0 && (
        <details className="shrink-0 text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">📜 Campanhas ({campanhas.length}) — clica pra ver o resultado</summary>
          <div className="flex flex-col gap-1.5 mt-2 max-h-44 overflow-y-auto">
            {campanhas.map(c => (
              <button key={c.id} onClick={() => abrirDetalhe(c.id)}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60 px-3 py-2 text-left transition cursor-pointer">
                <div className="min-w-0">
                  <span className="text-zinc-300 truncate block">{c.nome}</span>
                  <span className="text-[10px] text-zinc-600">{new Date(c.created_at).toLocaleDateString('pt-BR')}{c.produto_marca ? ` · ${c.produto_marca}` : ''}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  c.status === 'salva' ? 'bg-violet-500/15 text-violet-300' : c.status === 'ativa' ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-zinc-700 text-zinc-400'
                }`}>{c.status}</span>
              </button>
            ))}
          </div>
        </details>
      )}

      {/* Modal de detalhe/resultado */}
      {(carregandoDet || detalhe) && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 p-0 lg:p-4" onClick={() => { if (!acaoDet) setDetalhe(null) }}>
          <div onClick={e => e.stopPropagation()}
            className="w-full lg:max-w-lg bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-2xl flex flex-col max-h-[85dvh]">
            {carregandoDet && <p className="text-center text-sm text-zinc-500 py-10 animate-pulse">carregando resultado...</p>}
            {detalhe && (
              <>
                <div className="p-4 border-b border-zinc-800 shrink-0 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white truncate">{detalhe.campanha.nome}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {new Date(detalhe.campanha.created_at).toLocaleDateString('pt-BR')}
                      {detalhe.campanha.produto_marca ? ` · ${detalhe.campanha.produto_marca}` : ''}
                    </p>
                  </div>
                  <button onClick={() => setDetalhe(null)} className="text-zinc-500 hover:text-zinc-300 cursor-pointer shrink-0">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center">
                      <p className="text-xl font-bold text-white">{detalhe.metricas.enviados}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">enviados</p>
                    </div>
                    <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center">
                      <p className="text-xl font-bold text-white">{detalhe.metricas.respostas}<span className="text-xs text-zinc-500"> · {detalhe.metricas.taxaResposta}%</span></p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">responderam</p>
                    </div>
                    <div className="rounded-xl bg-[#00D4AA]/10 border border-[#00D4AA]/30 p-3 text-center">
                      <p className="text-xl font-bold text-[#00D4AA]">{detalhe.metricas.taxaConversao}%</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">converteram ({detalhe.metricas.conversoes})</p>
                    </div>
                  </div>
                  {detalhe.metricas.receita > 0 && (
                    <p className="text-center text-sm text-zinc-300">
                      💰 Receita atribuída: <span className="font-bold text-[#00D4AA]">R$ {detalhe.metricas.receita.toFixed(2).replace('.', ',')}</span>
                    </p>
                  )}

                  {detalhe.campanha.copy_whatsapp && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 mb-1">💬 Mensagem enviada</p>
                      <p className="text-sm text-zinc-300 bg-zinc-800/40 border border-zinc-700/40 rounded-lg p-3 whitespace-pre-wrap">{detalhe.campanha.copy_whatsapp}</p>
                    </div>
                  )}

                  {detalhe.leads.some(l => l.converteu) && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-500 mb-1">✅ Compraram depois</p>
                      <div className="flex flex-wrap gap-1">
                        {detalhe.leads.filter(l => l.converteu).map((l, i) => (
                          <span key={i} className="text-[11px] bg-[#00D4AA]/15 text-[#00D4AA] px-2 py-0.5 rounded-full">{(l.nome ?? 'Cliente').split(' ')[0]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-zinc-800 shrink-0 flex gap-2">
                  <button onClick={() => salvarCampanha(detalhe.campanha.id)} disabled={acaoDet || detalhe.campanha.status === 'salva'}
                    className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition cursor-pointer">
                    {detalhe.campanha.status === 'salva' ? '⭐ Salva' : '⭐ Salvar campanha'}
                  </button>
                  <button onClick={() => apagarCampanha(detalhe.campanha.id)} disabled={acaoDet}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 rounded-xl text-sm transition cursor-pointer">
                    Apagar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
