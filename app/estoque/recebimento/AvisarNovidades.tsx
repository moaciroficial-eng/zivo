'use client'

import { useState, useEffect, useRef } from 'react'

/* ── Avisar novidades por marca (pós-conferência ou depois, pela lista) ──
   Lista os clientes que curtem cada marca recebida; o dono pode tirar quem
   não quer e ADICIONAR outros clientes na busca, depois dispara o WhatsApp. */

export type NovidadeCliente = { id: string; nome: string; telefone: string; compras: number; motivo: string }
export type NovidadeMarca = { marca: string; qtdPecas: number; produtos: string[]; tamanhos: string[]; clientes: NovidadeCliente[] }

export function msgPadraoNovidade(marca: string) {
  return `{saudacao} {nome}! Chegou novidade da ${marca} aqui na loja e lembrei de você 😊 Se tiver interesse, tenho uma peça que é a sua cara. Quer ver?`
}

const IconX = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
)
const IconSpinner = ({ size = 15 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
)

/* Busca de cliente pra adicionar na oferta de uma marca */
function BuscaAdicionar({ onAdd, jaIncluidos }: { onAdd: (c: NovidadeCliente) => void; jaIncluidos: Set<string> }) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<{ id: string; nome: string | null; telefone: string | null }[]>([])
  const [buscando, setBuscando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (termo.trim().length < 2) { setResultados([]); return }
    timer.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo.trim())}`)
        const d = await res.json()
        setResultados(Array.isArray(d?.clientes) ? d.clientes : [])
      } catch { setResultados([]) }
      setBuscando(false)
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [termo])

  return (
    <div className="relative">
      <input
        value={termo}
        onChange={e => setTermo(e.target.value)}
        placeholder="+ Adicionar cliente pelo nome…"
        className="w-full bg-zinc-800/60 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-violet-500"
      />
      {termo.trim().length >= 2 && (
        <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-lg max-h-40 overflow-y-auto divide-y divide-zinc-700/60">
          {buscando && <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p>}
          {!buscando && resultados.length === 0 && <p className="px-3 py-2 text-xs text-zinc-500">Nenhum cliente com WhatsApp encontrado.</p>}
          {resultados.map(c => {
            const dentro = jaIncluidos.has(c.id)
            return (
              <button
                key={c.id}
                disabled={dentro}
                onClick={() => { onAdd({ id: c.id, nome: c.nome ?? 'Cliente', telefone: c.telefone ?? '', compras: 0, motivo: 'adicionado por você' }); setTermo('') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-default flex items-center justify-between gap-2 cursor-pointer"
              >
                <span className="truncate">{c.nome}</span>
                <span className="text-xs text-zinc-500 shrink-0">{dentro ? 'já incluído' : 'adicionar +'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function AvisarNovidades({ marcas, onClose }: { marcas: NovidadeMarca[]; onClose: () => void }) {
  const [aberta, setAberta] = useState<string | null>(marcas.length === 1 ? marcas[0].marca : null)
  const [msgs, setMsgs] = useState<Record<string, string>>(() => Object.fromEntries(marcas.map(m => [m.marca, msgPadraoNovidade(m.marca)])))
  const [removidos, setRemovidos] = useState<Record<string, Set<string>>>({})
  const [adicionados, setAdicionados] = useState<Record<string, NovidadeCliente[]>>({})
  const [enviando, setEnviando] = useState<Record<string, boolean>>({})
  const [resultado, setResultado] = useState<Record<string, { enviados: number; falhas: number }>>({})

  /* Lista final de clientes de uma marca = casados automaticamente + adicionados à mão */
  function todosDaMarca(m: NovidadeMarca): NovidadeCliente[] {
    const extra = (adicionados[m.marca] ?? []).filter(a => !m.clientes.some(c => c.id === a.id))
    return [...m.clientes, ...extra]
  }

  function toggleCliente(marca: string, id: string) {
    setRemovidos(prev => {
      const s = new Set(prev[marca] ?? [])
      if (s.has(id)) s.delete(id); else s.add(id)
      return { ...prev, [marca]: s }
    })
  }

  function adicionarCliente(marca: string, c: NovidadeCliente) {
    setAdicionados(prev => {
      const arr = prev[marca] ?? []
      if (arr.some(a => a.id === c.id)) return prev
      return { ...prev, [marca]: [...arr, c] }
    })
    setRemovidos(prev => { const s = new Set(prev[marca] ?? []); s.delete(c.id); return { ...prev, [marca]: s } })
  }

  async function disparar(m: NovidadeMarca) {
    const rem = removidos[m.marca] ?? new Set<string>()
    const alvos = todosDaMarca(m).filter(c => !rem.has(c.id) && c.telefone)
    if (alvos.length === 0) return
    setEnviando(prev => ({ ...prev, [m.marca]: true }))
    let enviados = 0, falhas = 0
    for (const c of alvos) {
      try {
        const res = await fetch('/api/plano/contatar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clienteId: c.id, nome: c.nome, telefone: c.telefone, mensagem: msgs[m.marca] }),
        })
        const d = await res.json()
        if (d?.ok) enviados++; else falhas++
      } catch { falhas++ }
    }
    setEnviando(prev => ({ ...prev, [m.marca]: false }))
    setResultado(prev => ({ ...prev, [m.marca]: { enviados, falhas } }))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg my-8 shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold">Novidades recebidas 🎉</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Avise os clientes que curtem cada marca</p>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white rounded transition cursor-pointer"><IconX size={16}/></button>
        </div>

        <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          {marcas.length === 0 && <p className="py-8 text-sm text-zinc-500 text-center">Nenhuma marca recebida encontrada.</p>}
          {marcas.map(m => {
            const rem = removidos[m.marca] ?? new Set<string>()
            const todos = todosDaMarca(m)
            const idsIncluidos = new Set(todos.map(c => c.id))
            const selecionados = todos.filter(c => !rem.has(c.id)).length
            const res = resultado[m.marca]
            const aberto = aberta === m.marca
            return (
              <div key={m.marca} className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setAberta(aberto ? null : m.marca)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/40 transition cursor-pointer text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300 text-sm font-bold shrink-0">
                    {m.marca.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{m.marca}</p>
                    <p className="text-xs text-zinc-500">
                      {m.qtdPecas} peça{m.qtdPecas !== 1 ? 's' : ''} · {todos.length} cliente{todos.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {res
                    ? <span className="text-xs text-emerald-400 font-semibold shrink-0">✓ {res.enviados} enviada{res.enviados !== 1 ? 's' : ''}</span>
                    : <span className="text-xs text-violet-400 font-semibold shrink-0">{aberto ? 'Fechar' : 'Avisar'}</span>}
                </button>

                {aberto && !res && (
                  <div className="px-4 pb-4 flex flex-col gap-3 border-t border-zinc-800/60 pt-3">
                    <textarea
                      value={msgs[m.marca]}
                      onChange={e => setMsgs(prev => ({ ...prev, [m.marca]: e.target.value }))}
                      rows={3}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-violet-500 resize-none"
                    />
                    <p className="text-[11px] text-zinc-600">
                      <span className="font-mono">{'{saudacao}'}</span> e <span className="font-mono">{'{nome}'}</span> são preenchidos automaticamente pra cada cliente.
                    </p>

                    <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                      {todos.length === 0 && <p className="text-xs text-zinc-500 py-2 text-center">Ninguém casou automático — adicione clientes abaixo.</p>}
                      {todos.map(c => {
                        const ativo = !rem.has(c.id)
                        return (
                          <div key={c.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${ativo ? 'bg-zinc-800/60' : 'bg-zinc-800/20 opacity-50'}`}>
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{c.nome}</p>
                              <p className="text-xs text-zinc-500 truncate">{c.motivo}</p>
                            </div>
                            <button
                              onClick={() => toggleCliente(m.marca, c.id)}
                              className="p-1 text-zinc-500 hover:text-white cursor-pointer shrink-0"
                              title={ativo ? 'Remover' : 'Incluir'}
                            >
                              {ativo ? <IconX size={14}/> : <span className="text-lg leading-none">+</span>}
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    {/* Adicionar cliente manualmente */}
                    <BuscaAdicionar jaIncluidos={idsIncluidos} onAdd={c => adicionarCliente(m.marca, c)} />

                    <button
                      onClick={() => disparar(m)}
                      disabled={enviando[m.marca] || selecionados === 0}
                      className="flex items-center justify-center gap-2 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg py-2.5 transition cursor-pointer"
                    >
                      {enviando[m.marca] ? <><IconSpinner size={15}/> Enviando…</> : <>Avisar {selecionados} cliente{selecionados !== 1 ? 's' : ''}</>}
                    </button>
                  </div>
                )}

                {res && res.falhas > 0 && (
                  <p className="px-4 pb-3 text-xs text-amber-500">{res.falhas} não puderam ser enviadas (cliente sem WhatsApp/telefone).</p>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800">
          <button onClick={onClose} className="w-full text-sm font-semibold border border-zinc-700 hover:border-zinc-500 rounded-lg py-2.5 transition cursor-pointer">
            Concluir
          </button>
        </div>
      </div>
    </div>
  )
}
