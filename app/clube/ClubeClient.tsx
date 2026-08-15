'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Produto, Membro, VendaClube } from './page'

function fBRL(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function diasDe(data: string | null): number | null {
  if (!data) return null
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000)
}
function totalQtd(t: Produto['tamanhos']) {
  return (t ?? []).reduce((s, x) => s + (Number(x.qtd) || 0), 0)
}

export default function ClubeClient({
  user, nomeLoja, clubeAtivo, cadastroAberto, linkPublico, logoUrl, comoComprar, mpToken, produtos, fotoMap, membrosLista, vendasClube,
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
  const membros = membrosLista.length

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

        {/* Config + link */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Clube ativo</p>
              <p className="text-xs text-zinc-500">Liga a vitrine pública (o link só funciona com isso ligado).</p>
            </div>
            <button onClick={() => toggleConfig('clube_ativo', !ativo)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${ativo ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${ativo ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-800/60 pt-4">
            <div>
              <p className="text-sm font-medium">Cadastro de novos VIPs</p>
              <p className="text-xs text-zinc-500">Aberto: qualquer um com o link entra. Fechado: só quem já é VIP acessa.</p>
            </div>
            <button onClick={() => toggleConfig('clube_cadastro_aberto', !aberto)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${aberto ? 'bg-[#3B6FFF]' : 'bg-zinc-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${aberto ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="border-t border-zinc-800/60 pt-4">
            <p className="text-xs font-medium text-zinc-400 mb-1.5">Link secreto do clube ({membros} membro{membros !== 1 ? 's' : ''})</p>
            <div className="flex gap-2">
              <input readOnly value={linkPublico} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none" />
              <button onClick={copiarLink} className="text-sm font-medium border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2 transition cursor-pointer shrink-0">Copiar</button>
              <button onClick={convidarTodos} disabled={convidando} className="text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-3 py-2 transition cursor-pointer shrink-0 disabled:opacity-50">
                {convidando ? 'Enviando...' : 'Convidar todos'}
              </button>
            </div>
          </div>
        </div>

        {/* Personalização */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300">Personalização do site</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600 text-xs">
              {logo ? <img src={logo} alt="logo" className="w-full h-full object-contain" /> : 'sem logo'}
            </div>
            <div>
              <label className={`inline-block text-sm font-medium border rounded-lg px-3 py-2 cursor-pointer transition ${uploadingLogo ? 'opacity-50 pointer-events-none border-zinc-700' : 'border-zinc-700 hover:border-violet-500/50'}`}>
                {uploadingLogo ? 'Enviando...' : logo ? 'Trocar logo' : 'Enviar logo'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
              </label>
              <p className="text-xs text-zinc-600 mt-1">Aparece no topo do site do clube.</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Como comprar (aparece no rodapé do site)</label>
            <textarea
              value={comoTxt} onChange={e => setComoTxt(e.target.value)} onBlur={salvarComoComprar} rows={3}
              placeholder={'Ex.: 1) Escolha a peça  2) Clique em "Quero essa"  3) Combinamos o pagamento e a retirada/entrega no WhatsApp.'}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 resize-none"
            />
          </div>
        </div>

        {/* Pagamento (Mercado Pago) */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300">Pagamento no site (Mercado Pago)</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${mp.trim() ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'}`}>
              {mp.trim() ? 'Ligado' : 'Desligado'}
            </span>
          </div>
          <p className="text-xs text-zinc-500">Cole seu <b>Access Token</b> do Mercado Pago (Suas integrações → Credenciais de produção). Com ele, o cliente paga no site (Pix/cartão) e o estoque baixa sozinho. Sem token, o botão vira &quot;Quero essa&quot; no WhatsApp.</p>
          <div className="flex gap-2">
            <input type="password" value={mp} onChange={e => setMp(e.target.value)} placeholder="APP_USR-..." className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" />
            <button onClick={salvarMp} className="text-sm font-semibold border border-zinc-700 hover:border-emerald-500/50 rounded-lg px-4 py-2 transition cursor-pointer shrink-0">Salvar</button>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">No clube</p>
            <p className="text-2xl font-bold mt-1 text-emerald-400">{noClube.length}</p>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Membros VIP</p>
            <p className="text-2xl font-bold mt-1">{membros}</p>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-4 col-span-2 sm:col-span-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Status</p>
            <p className={`text-lg font-bold mt-1 ${ativo ? 'text-emerald-400' : 'text-zinc-500'}`}>{ativo ? 'Ativo' : 'Desligado'}</p>
          </div>
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
          <div className="divide-y divide-zinc-800/60 max-h-[560px] overflow-y-auto">
            {filtrados.length === 0 && <p className="px-5 py-8 text-sm text-zinc-500 text-center">Nenhum produto.</p>}
            {filtrados.map(p => {
              const dias = diasDe(p.data_entrada)
              const parado = (dias ?? 0) >= 30
              const semEstoque = totalQtd(p.tamanhos) <= 0
              return (
                <div key={p.id} className={`px-5 py-3 ${p.oportunidade ? 'bg-emerald-500/5' : ''}`}>
                  <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-zinc-600">
                    {fotoMap[p.id] ? <img src={fotoMap[p.id]} alt="" className="w-full h-full object-cover" /> : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.nome}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {[p.marca, p.cor].filter(Boolean).join(' · ')}
                      {' · '}{fBRL(p.preco_venda)}
                      {parado && <span className="ml-1.5 text-amber-400">parado {dias}d</span>}
                      {semEstoque && <span className="ml-1.5 text-red-400">sem estoque</span>}
                    </p>
                  </div>
                  {p.oportunidade && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-zinc-500">R$</span>
                      <input
                        type="number" min="0" step="0.01" value={p.preco_oportunidade ?? ''}
                        onChange={e => setPreco(p, e.target.value)}
                        placeholder="oferta"
                        className="w-20 bg-zinc-800 border border-emerald-500/40 rounded-lg px-2 py-1 text-sm text-emerald-300 outline-none focus:border-emerald-400"
                      />
                    </div>
                  )}
                  <button
                    onClick={() => toggleProduto(p)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                      p.oportunidade ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15' : 'border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {p.oportunidade ? 'No clube ✓' : '+ Clube'}
                  </button>
                  </div>
                  {p.oportunidade && (
                    <div className="mt-2 sm:pl-14 flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer shrink-0">
                        <input type="checkbox" checked={!!p.combo} onChange={() => toggleCombo(p)} className="accent-amber-500" />
                        ⚡ Combo (isca)
                      </label>
                      {p.combo && (
                        <input
                          value={p.combo_texto ?? ''}
                          onChange={e => setComboTexto(p, e.target.value)}
                          placeholder="Condição — ex.: nesse preço, levando uma camiseta"
                          className="flex-1 bg-zinc-800 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-sm text-amber-200 placeholder-zinc-600 outline-none focus:border-amber-400"
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Vendas do clube */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm">Vendas do clube ({vendas.length})</h2>
          </div>
          <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
            {vendas.length === 0 && <p className="px-5 py-6 text-sm text-zinc-500 text-center">Nenhuma venda ainda.</p>}
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

        {/* Membros VIP */}
        <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="font-semibold text-sm">Membros VIP ({membrosLista.length})</h2>
          </div>
          <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
            {membrosLista.length === 0 && <p className="px-5 py-6 text-sm text-zinc-500 text-center">Ninguém cadastrado ainda.</p>}
            {membrosLista.map(m => (
              <div key={m.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-300 text-xs font-bold shrink-0">
                  {(m.nome ?? m.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{m.nome || m.email}</p>
                  <p className="text-xs text-zinc-500 truncate">{m.email}{m.telefone ? ` · ${m.telefone}` : ''}</p>
                </div>
                <span className="text-xs text-zinc-600 shrink-0">{m.criado_em ? new Date(m.criado_em).toLocaleDateString('pt-BR') : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
