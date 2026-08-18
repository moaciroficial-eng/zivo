'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Produto, Membro, VendaClube, ClienteRef } from './page'

function fBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function diasDe(data: string | null): number | null {
  if (!data) return null
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000)
}
/* Só os tamanhos que ainda têm peça em estoque (pra mostrar no card) */
function tamanhosComEstoque(t: Produto['tamanhos']): string[] {
  return (t ?? []).filter(x => (Number(x.qtd) || 0) > 0).map(x => String(x.tamanho))
}

export default function ClubeClient({
  user, nomeLoja, clubeAtivo, cadastroAberto, linkPublico, logoUrl, comoComprar, mpToken, produtos, fotoMap, membrosLista, vendasClube, clientes,
}: {
  user: { id: string; email: string }
  nomeLoja: string
  clubeAtivo: boolean
  cadastroAberto: boolean
  linkPublico: string
  logoUrl: string | null
  comoComprar: string
  mpToken: string
  produtos: Produto[]
  fotoMap: Record<string, string>
  membrosLista: Membro[]
  vendasClube: VendaClube[]
  clientes: ClienteRef[]
}) {
  const supabase = createClient()
  const [ativo, setAtivo] = useState(clubeAtivo)
  const [aberto, setAberto] = useState(cadastroAberto)
  const [lista, setLista] = useState<Produto[]>(produtos)
  const [busca, setBusca] = useState('')
  const [soParados, setSoParados] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [convidando, setConvidando] = useState(false)
  const [logo, setLogo] = useState<string | null>(logoUrl)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [comoTxt, setComoTxt] = useState(comoComprar)
  const [mp, setMp] = useState(mpToken)
  const [vendas, setVendas] = useState<VendaClube[]>(vendasClube)
  const [membros, setMembros] = useState<Membro[]>(membrosLista)
  const [configAberta, setConfigAberta] = useState(false)
  const [modal, setModal] = useState<null | 'membros' | 'vendas' | 'noclube'>(null)
  const [linkMembro, setLinkMembro] = useState<string | null>(null)  // membro sendo linkado
  const [linkBusca, setLinkBusca] = useState('')

  const nomeCliente = (id: string | null) => id ? (clientes.find(c => c.id === id)?.nome ?? 'vinculado') : null

  async function linkarCliente(membroId: string, clienteId: string) {
    setMembros(ms => ms.map(m => m.id === membroId ? { ...m, cliente_id: clienteId } : m))
    setLinkMembro(null); setLinkBusca('')
    await supabase.from('clube_membros').update({ cliente_id: clienteId }).eq('id', membroId)
    showToast('Cliente vinculado!')
  }

  // Realtime: quando entra uma venda paga no clube, avisa na tela
  useEffect(() => {
    const ch = supabase.channel('clube-vendas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clube_pedidos', filter: `user_id=eq.${user.id}` }, payload => {
        const novo = payload.new as VendaClube & { status?: string }
        if (novo?.status === 'pago') {
          setVendas(v => v.some(x => x.id === novo.id) ? v : [novo, ...v])
          showToast(`💰 Venda no clube: ${novo.produto_nome ?? 'pedido'}`)
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Venda no Clube! 🎉', { body: `${novo.produto_nome ?? ''} — R$${Number(novo.valor ?? 0).toFixed(2)}` }) } catch {}
        }
      })
      .subscribe()
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const noClube = lista.filter(p => p.oportunidade)
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter(p => {
      if (soParados && (diasDe(p.data_entrada) ?? 0) < 30) return false
      if (!q) return true
      return `${p.nome} ${p.marca ?? ''} ${p.cor ?? ''}`.toLowerCase().includes(q)
    })
  }, [lista, busca, soParados])

  async function toggleConfig(campo: 'clube_ativo' | 'clube_cadastro_aberto', valor: boolean) {
    if (campo === 'clube_ativo') setAtivo(valor); else setAberto(valor)
    await supabase.from('loja_config').upsert({ user_id: user.id, [campo]: valor }, { onConflict: 'user_id' })
  }

  async function toggleProduto(p: Produto) {
    const novo = !p.oportunidade
    const preco = novo ? (p.preco_oportunidade ?? p.preco_venda ?? null) : p.preco_oportunidade
    setLista(l => l.map(x => x.id === p.id ? { ...x, oportunidade: novo, preco_oportunidade: preco } : x))
    const { error } = await supabase.from('estoque').update({ oportunidade: novo, preco_oportunidade: preco }).eq('id', p.id)
    if (error) showToast('Erro ao salvar.', false)
  }

  async function setPreco(p: Produto, valor: string) {
    const preco = valor === '' ? null : Number(valor)
    setLista(l => l.map(x => x.id === p.id ? { ...x, preco_oportunidade: preco } : x))
    await supabase.from('estoque').update({ preco_oportunidade: preco }).eq('id', p.id)
  }

  async function toggleCombo(p: Produto) {
    const novo = !p.combo
    setLista(l => l.map(x => x.id === p.id ? { ...x, combo: novo } : x))
    await supabase.from('estoque').update({ combo: novo }).eq('id', p.id)
  }
  async function setComboTexto(p: Produto, valor: string) {
    setLista(l => l.map(x => x.id === p.id ? { ...x, combo_texto: valor } : x))
    await supabase.from('estoque').update({ combo_texto: valor || null }).eq('id', p.id)
  }

  /* Liga/desliga um tamanho na oferta do clube. clube_tamanhos null = todos
     ativos; ao mexer, materializa a lista explícita (na ordem do estoque). */
  async function toggleTamanho(p: Produto, size: string) {
    const emEstoque = tamanhosComEstoque(p.tamanhos)
    const atual = p.clube_tamanhos ?? emEstoque
    const alvo = atual.includes(size) ? atual.filter(s => s !== size) : [...atual, size]
    const ordenado = emEstoque.filter(s => alvo.includes(s))
    setLista(l => l.map(x => x.id === p.id ? { ...x, clube_tamanhos: ordenado } : x))
    await supabase.from('estoque').update({ clube_tamanhos: ordenado }).eq('id', p.id)
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    try {
      const path = `logos/${user.id}/${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`
      const { data: up, error } = await supabase.storage.from('biblioteca').upload(path, file, { contentType: file.type || 'image/png', upsert: true })
      if (error) throw new Error(error.message)
      const { data: pub } = supabase.storage.from('biblioteca').getPublicUrl(up.path)
      setLogo(pub.publicUrl)
      await supabase.from('loja_config').upsert({ user_id: user.id, logo_url: pub.publicUrl }, { onConflict: 'user_id' })
      showToast('Logo salva!')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erro no upload.', false) } finally { setUploadingLogo(false) }
  }

  async function salvarComoComprar() {
    await supabase.from('loja_config').upsert({ user_id: user.id, clube_como_comprar: comoTxt || null }, { onConflict: 'user_id' })
    showToast('Texto salvo!')
  }

  async function salvarMp() {
    await supabase.from('loja_config').upsert({ user_id: user.id, mp_access_token: mp.trim() || null }, { onConflict: 'user_id' })
    showToast(mp.trim() ? 'Pagamento ligado!' : 'Token removido.')
  }

  function copiarLink() {
    navigator.clipboard.writeText(linkPublico).then(() => showToast('Link copiado!')).catch(() => showToast('Copie manualmente.', false))
  }

  async function convidarTodos() {
    if (!confirm(`Enviar o convite do Clube ${nomeLoja} pra TODOS os seus clientes no WhatsApp?`)) return
    setConvidando(true)
    try {
      const res = await fetch('/api/clube/convidar', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (d?.ok) showToast(`Convite enviado para ${d.enviados ?? 0} cliente(s).`)
      else showToast(d?.erro || 'Falha ao enviar convites.', false)
    } catch { showToast('Falha ao enviar convites.', false) } finally { setConvidando(false) }
  }

  return (
    <div className="min-h-screen bg-[#080B10] text-white p-6 md:p-8">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border ${toast.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{toast.msg}</div>
      )}
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Clube {nomeLoja}</h1>
          <p className="text-sm text-zinc-500 mt-1">Vitrine VIP de oportunidades — selecione os produtos parados pra desovar com preço especial.</p>
        </div>

        {/* Link secreto + convite */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-zinc-400">Link secreto do clube</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ativo ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'}`}>{ativo ? 'Ativo' : 'Desligado'}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={linkPublico} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none" />
            <div className="flex gap-2">
              <button onClick={copiarLink} className="flex-1 text-sm font-medium border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 transition cursor-pointer">Copiar</button>
              <button onClick={convidarTodos} disabled={convidando} className="flex-1 text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-3 py-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap">
                {convidando ? 'Enviando...' : 'Convidar todos'}
              </button>
            </div>
          </div>
        </div>

        {/* Resumo — cards clicáveis */}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => setModal('noclube')} className="text-left bg-zinc-900/60 border border-zinc-800/60 hover:border-emerald-500/40 rounded-2xl p-4 transition cursor-pointer">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">No clube</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{noClube.length}</p>
            <p className="text-[10px] text-violet-400 mt-0.5">editar →</p>
          </button>
          <button onClick={() => setModal('membros')} className="text-left bg-zinc-900/60 border border-zinc-800/60 hover:border-violet-500/40 rounded-2xl p-4 transition cursor-pointer">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Membros VIP</p>
            <p className="text-2xl font-bold mt-1">{membros.length}</p>
            <p className="text-[10px] text-violet-400 mt-0.5">ver lista →</p>
          </button>
          <button onClick={() => setModal('vendas')} className="text-left bg-zinc-900/60 border border-zinc-800/60 hover:border-emerald-500/40 rounded-2xl p-4 transition cursor-pointer">
            <p className="text-[11px] text-zinc-500 uppercase tracking-wider">Vendas</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{vendas.length}</p>
            <p className="text-[10px] text-violet-400 mt-0.5">ver lista →</p>
          </button>
        </div>

        {/* Configurações — recolhível */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <button onClick={() => setConfigAberta(v => !v)} className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-800/30 transition cursor-pointer">
            <span className="font-semibold text-sm">⚙️ Configurações do clube</span>
            <span className="text-zinc-500 text-sm">{configAberta ? 'Fechar ▲' : 'Abrir ▼'}</span>
          </button>
          {configAberta && (
            <div className="px-5 pb-5 space-y-5 border-t border-zinc-800/60 pt-5">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Clube ativo</p><p className="text-xs text-zinc-500">Liga a vitrine pública.</p></div>
                <button onClick={() => toggleConfig('clube_ativo', !ativo)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0 ${ativo ? 'bg-emerald-500' : 'bg-zinc-700'}`}><span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${ativo ? 'translate-x-6' : 'translate-x-1'}`} /></button>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-800/60 pt-4">
                <div><p className="text-sm font-medium">Cadastro de novos VIPs</p><p className="text-xs text-zinc-500">Aberto: qualquer um com o link entra. Fechado: só quem já é VIP.</p></div>
                <button onClick={() => toggleConfig('clube_cadastro_aberto', !aberto)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0 ${aberto ? 'bg-[#3B6FFF]' : 'bg-zinc-700'}`}><span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${aberto ? 'translate-x-6' : 'translate-x-1'}`} /></button>
              </div>
              <div className="border-t border-zinc-800/60 pt-4 space-y-3">
                <p className="text-sm font-medium">Personalização</p>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600 text-xs">
                    {logo ? <img src={logo} alt="logo" className="w-full h-full object-contain" /> : 'logo'}
                  </div>
                  <label className={`inline-block text-sm font-medium border rounded-lg px-3 py-2 cursor-pointer transition ${uploadingLogo ? 'opacity-50 pointer-events-none border-zinc-700' : 'border-zinc-700 hover:border-violet-500/50'}`}>
                    {uploadingLogo ? 'Enviando...' : logo ? 'Trocar logo' : 'Enviar logo'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
                  </label>
                </div>
                <textarea value={comoTxt} onChange={e => setComoTxt(e.target.value)} onBlur={salvarComoComprar} rows={3} placeholder={'Como comprar (rodapé do site) — ex.: 1) Escolha  2) Clique em Comprar  3) Retirada/entrega...'} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 resize-none" />
              </div>
              <div className="border-t border-zinc-800/60 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Pagamento no site (Mercado Pago)</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${mp.trim() ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'}`}>{mp.trim() ? 'Ligado' : 'Desligado'}</span>
                </div>
                <p className="text-xs text-zinc-500">Access Token do Mercado Pago (produção). Com ele o cliente paga no site; sem token, o botão vira &quot;Quero essa&quot; no WhatsApp.</p>
                <div className="flex gap-2">
                  <input type="password" value={mp} onChange={e => setMp(e.target.value)} placeholder="APP_USR-..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" />
                  <button onClick={salvarMp} className="text-sm font-semibold border border-zinc-700 hover:border-emerald-500/50 rounded-lg px-4 py-2 transition cursor-pointer shrink-0">Salvar</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Produtos */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <h2 className="font-semibold text-sm">Selecione os produtos do clube</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={soParados} onChange={e => setSoParados(e.target.checked)} className="accent-violet-500" />
                Só parados (30+ dias)
              </label>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-violet-500" />
            </div>
          </div>
          <div className="p-4 sm:p-5 max-h-[640px] overflow-y-auto">
            {filtrados.length === 0 && <p className="py-8 text-sm text-zinc-500 text-center">Nenhum produto.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtrados.map(p => {
                const dias = diasDe(p.data_entrada)
                const parado = (dias ?? 0) >= 30
                const tams = tamanhosComEstoque(p.tamanhos)
                const semEstoque = tams.length === 0
                return (
                  <div key={p.id} className={`rounded-2xl border p-2.5 transition ${p.oportunidade ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                    {/* Foto */}
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 relative mb-2">
                      {fotoMap[p.id]
                        ? <img src={fotoMap[p.id]} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-3xl">👕</div>}
                      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                        {parado && <span className="text-[10px] font-bold bg-amber-500/90 text-black px-1.5 py-0.5 rounded-full">parado {dias}d</span>}
                        {semEstoque && <span className="text-[10px] font-bold bg-red-500/90 text-white px-1.5 py-0.5 rounded-full">sem estoque</span>}
                      </div>
                    </div>

                    {/* Nome + marca/preço */}
                    <p className="text-sm font-medium truncate">{p.nome}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {[p.marca, p.cor].filter(Boolean).join(' · ') || '—'} · {fBRL(p.preco_venda)}
                    </p>

                    {/* Tamanhos — no clube viram botões pra ligar/desligar da oferta */}
                    {tams.length > 0 && (
                      <>
                        {p.oportunidade && <p className="text-[10px] text-zinc-500 mt-1.5">Tamanhos na oferta (clique pra ligar/desligar):</p>}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {tams.map(s => {
                            if (!p.oportunidade) {
                              return <span key={s} className="text-[10px] font-bold bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-full">{s}</span>
                            }
                            const ativa = !p.clube_tamanhos || p.clube_tamanhos.includes(s)
                            return (
                              <button
                                key={s}
                                onClick={() => toggleTamanho(p, s)}
                                title={ativa ? 'Na oferta — clique pra tirar' : 'Fora da oferta — clique pra incluir'}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border transition cursor-pointer ${
                                  ativa
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                    : 'bg-zinc-800/40 text-zinc-600 border-zinc-700 line-through'
                                }`}
                              >
                                {s}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}

                    {/* Botão adicionar/tirar */}
                    <button
                      onClick={() => toggleProduto(p)}
                      className={`mt-2.5 w-full text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                        p.oportunidade ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15' : 'border-zinc-700 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {p.oportunidade ? 'No clube ✓' : '+ Clube'}
                    </button>

                    {/* Preço de oferta + combo (quando está no clube) */}
                    {p.oportunidade && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-zinc-500">R$</span>
                          <input
                            type="number" min="0" step="0.01" value={p.preco_oportunidade ?? ''}
                            onChange={e => setPreco(p, e.target.value)}
                            placeholder="oferta"
                            className="w-full bg-zinc-800 border border-emerald-500/40 rounded-lg px-2 py-1 text-sm text-emerald-300 outline-none focus:border-emerald-400"
                          />
                        </div>
                        <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                          <input type="checkbox" checked={!!p.combo} onChange={() => toggleCombo(p)} className="accent-amber-500" />
                          ⚡ Combo (isca)
                        </label>
                        {p.combo && (
                          <input
                            value={p.combo_texto ?? ''}
                            onChange={e => setComboTexto(p, e.target.value)}
                            placeholder="Condição — ex.: levando uma camiseta"
                            className="w-full bg-zinc-800 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-xs text-amber-200 placeholder-zinc-600 outline-none focus:border-amber-400"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Modal: produtos no clube (editar preço/combo/tirar) */}
      {modal === 'noclube' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold">No clube ({noClube.length})</h2>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-white text-sm">Fechar</button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {noClube.length === 0 && <p className="px-5 py-8 text-sm text-zinc-500 text-center">Nenhum produto no clube ainda. Adicione lá embaixo.</p>}
              {noClube.map(p => (
                <div key={p.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600">
                      {fotoMap[p.id] ? <img src={fotoMap[p.id]} alt="" className="w-full h-full object-cover" /> : '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.nome}</p>
                      <p className="text-xs text-zinc-500 truncate">{[p.marca, p.cor].filter(Boolean).join(' · ')} · de {fBRL(p.preco_venda)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-zinc-500">R$</span>
                      <input type="number" min="0" step="0.01" value={p.preco_oportunidade ?? ''} onChange={e => setPreco(p, e.target.value)} placeholder="oferta"
                        className="w-20 bg-zinc-800 border border-emerald-500/40 rounded-lg px-2 py-1 text-sm text-emerald-300 outline-none focus:border-emerald-400" />
                    </div>
                    <button onClick={() => toggleProduto(p)} className="shrink-0 text-[11px] font-semibold text-red-400 border border-red-500/30 rounded px-2 py-1 hover:bg-red-500/10 transition cursor-pointer">Tirar</button>
                  </div>
                  <div className="mt-2 sm:pl-14 flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer shrink-0">
                      <input type="checkbox" checked={!!p.combo} onChange={() => toggleCombo(p)} className="accent-amber-500" />
                      ⚡ Combo (isca)
                    </label>
                    {p.combo && (
                      <input value={p.combo_texto ?? ''} onChange={e => setComboTexto(p, e.target.value)} placeholder="Condição — ex.: levando uma camiseta"
                        className="flex-1 bg-zinc-800 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-sm text-amber-200 placeholder-zinc-600 outline-none focus:border-amber-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Membros VIP (com link manual) */}
      {modal === 'membros' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => { setModal(null); setLinkMembro(null) }}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold">Membros VIP ({membros.length})</h2>
              <button onClick={() => { setModal(null); setLinkMembro(null) }} className="text-zinc-500 hover:text-white text-sm">Fechar</button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {membros.length === 0 && <p className="px-5 py-8 text-sm text-zinc-500 text-center">Ninguém cadastrado ainda.</p>}
              {membros.map(m => (
                <div key={m.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-300 text-xs font-bold shrink-0">{(m.nome ?? m.email).charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm">{m.nome || m.email}</p>
                      <p className="text-xs text-zinc-500 truncate">{m.email}{m.telefone ? ` · ${m.telefone}` : ''}</p>
                    </div>
                    {m.cliente_id
                      ? <span className="text-[11px] text-emerald-400 shrink-0">✓ {nomeCliente(m.cliente_id)}</span>
                      : <button onClick={() => { setLinkMembro(linkMembro === m.id ? null : m.id); setLinkBusca('') }} className="text-[11px] font-semibold text-violet-300 border border-violet-500/30 rounded px-2 py-1 shrink-0 hover:bg-violet-500/10 transition cursor-pointer">Linkar cliente</button>}
                  </div>
                  {linkMembro === m.id && (
                    <div className="mt-2 sm:pl-11">
                      <input autoFocus value={linkBusca} onChange={e => setLinkBusca(e.target.value)} placeholder="Buscar cliente pelo nome ou telefone..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" />
                      <div className="mt-1 max-h-40 overflow-y-auto">
                        {clientes.filter(c => c.nome.toLowerCase().includes(linkBusca.toLowerCase()) || (c.telefone ?? '').includes(linkBusca)).slice(0, 8).map(c => (
                          <button key={c.id} onClick={() => linkarCliente(m.id, c.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-violet-500/20 rounded transition cursor-pointer">
                            {c.nome} <span className="text-xs text-zinc-500">{c.telefone ?? ''}</span>
                          </button>
                        ))}
                        {clientes.filter(c => c.nome.toLowerCase().includes(linkBusca.toLowerCase()) || (c.telefone ?? '').includes(linkBusca)).length === 0 && (
                          <p className="px-3 py-2 text-xs text-zinc-600">Nenhum cliente encontrado.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Vendas do clube */}
      {modal === 'vendas' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 sm:rounded-2xl rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold">Vendas do clube ({vendas.length})</h2>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-white text-sm">Fechar</button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {vendas.length === 0 && <p className="px-5 py-8 text-sm text-zinc-500 text-center">Nenhuma venda ainda.</p>}
              {vendas.map(v => (
                <div key={v.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{v.produto_nome}</p>
                    <p className="text-xs text-zinc-500 truncate">{v.email_membro} · {v.criado_em ? new Date(v.criado_em).toLocaleDateString('pt-BR') : ''}</p>
                  </div>
                  <span className="text-emerald-400 font-semibold shrink-0">{fBRL(v.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
