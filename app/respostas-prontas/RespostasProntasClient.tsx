'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Botao = { titulo: string }
type Resposta = {
  id: string
  titulo: string
  atalho: string
  texto: string
  botoes: Botao[] | null
}

const INPUT = 'w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-lg px-4 py-2.5 text-sm outline-none transition focus:border-[#C79A54] focus:ring-2 focus:ring-[#C79A54]/20 [color-scheme:dark]'

const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IconEdit = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 18 4 13"/></svg>
const IconPlus = () => <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>

type Form = { titulo: string; atalho: string; texto: string; botoes: string[] }
const FORM_VAZIO: Form = { titulo: '', atalho: '', texto: '', botoes: [] }

export default function RespostasProntasClient({ initialRespostas }: {
  user: { id: string; email: string }
  initialRespostas: Resposta[]
}) {
  const supabase = createClient()
  const [respostas, setRespostas] = useState<Resposta[]>(initialRespostas)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Form>(FORM_VAZIO)
  const [criando, setCriando] = useState(false)
  const [novoForm, setNovoForm] = useState<Form>(FORM_VAZIO)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function abrirEdicao(r: Resposta) {
    setEditingId(r.id)
    setEditForm({ titulo: r.titulo, atalho: r.atalho, texto: r.texto, botoes: (r.botoes ?? []).map(b => b.titulo) })
  }

  function setBotao(form: Form, i: number, valor: string, setForm: (f: Form) => void) {
    const botoes = [...form.botoes]
    if (valor) botoes[i] = valor.slice(0, 20); else botoes.splice(i, 1)
    setForm({ ...form, botoes })
  }

  async function salvarEdicao() {
    if (!editingId || !editForm.titulo.trim() || !editForm.atalho.trim() || !editForm.texto.trim()) return
    setSaving(true); setError('')
    try {
      const botoes = editForm.botoes.filter(Boolean).slice(0, 3).map(titulo => ({ titulo }))
      const { error: err } = await supabase.from('respostas_prontas').update({
        titulo: editForm.titulo.trim(), atalho: editForm.atalho.trim().toLowerCase(), texto: editForm.texto,
        botoes: botoes.length > 0 ? botoes : null, updated_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (err) throw err
      setRespostas(rs => rs.map(r => r.id === editingId
        ? { ...r, titulo: editForm.titulo.trim(), atalho: editForm.atalho.trim().toLowerCase(), texto: editForm.texto, botoes: botoes.length > 0 ? botoes : null }
        : r
      ).sort((a, b) => a.titulo.localeCompare(b.titulo)))
      setEditingId(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao salvar.') }
    setSaving(false)
  }

  async function criar() {
    if (!novoForm.titulo.trim() || !novoForm.atalho.trim() || !novoForm.texto.trim()) return
    setSaving(true); setError('')
    try {
      const botoes = novoForm.botoes.filter(Boolean).slice(0, 3).map(titulo => ({ titulo }))
      const { data, error: err } = await supabase.from('respostas_prontas').insert({
        titulo: novoForm.titulo.trim(), atalho: novoForm.atalho.trim().toLowerCase(), texto: novoForm.texto,
        botoes: botoes.length > 0 ? botoes : null,
      }).select('id, titulo, atalho, texto, botoes').single()
      if (err) throw err
      setRespostas(rs => [...rs, data as Resposta].sort((a, b) => a.titulo.localeCompare(b.titulo)))
      setNovoForm(FORM_VAZIO)
      setCriando(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao criar.') }
    setSaving(false)
  }

  async function excluir(id: string) {
    if (!confirm('Excluir essa resposta pronta?')) return
    await supabase.from('respostas_prontas').delete().eq('id', id)
    setRespostas(rs => rs.filter(r => r.id !== id))
  }

  function FormCampos({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
    return (
      <div className="space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input className={INPUT} placeholder="Título (ex.: Chave Pix)" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
          <input className={INPUT} placeholder="Atalho pro / (ex.: pix)" value={form.atalho} onChange={e => setForm({ ...form, atalho: e.target.value })} />
        </div>
        <textarea className={`${INPUT} min-h-[80px]`} placeholder="Texto -- use {nome} pra entrar o nome do cliente" value={form.texto} onChange={e => setForm({ ...form, texto: e.target.value })} />
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Botões (opcional, até 3)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[0, 1, 2].map(i => (
              <input key={i} className={INPUT} placeholder={`Botão ${i + 1}`} maxLength={20}
                value={form.botoes[i] ?? ''} onChange={e => setBotao(form, i, e.target.value, setForm)} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold">Respostas prontas</h1>
        {!criando && (
          <button onClick={() => setCriando(true)} className="flex items-center gap-1.5 text-sm font-medium bg-[#C79A54] hover:bg-[#d8ac68] text-[#16151A] rounded-lg px-3 py-1.5 transition">
            <IconPlus /> Nova
          </button>
        )}
      </div>
      <p className="text-sm text-zinc-500 mb-5">
        No campo de digitar da conversa do WhatsApp, digite &quot;/&quot; pra escolher uma dessas e preencher a mensagem na hora.
        {' '}Use <code className="text-[#E0B36A]">{'{nome}'}</code> no texto pra entrar o primeiro nome do cliente.
      </p>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {criando && (
        <div className="bg-zinc-900 border border-[#C79A54]/40 rounded-2xl p-4 mb-5 space-y-3">
          <FormCampos form={novoForm} setForm={setNovoForm} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setCriando(false); setNovoForm(FORM_VAZIO) }} className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 transition">Cancelar</button>
            <button onClick={criar} disabled={saving} className="flex items-center gap-1.5 text-sm font-medium bg-[#C79A54] hover:bg-[#d8ac68] disabled:opacity-50 text-[#16151A] rounded-lg px-3 py-1.5 transition"><IconCheck /> Salvar</button>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        {respostas.map(r => (
          <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            {editingId === r.id ? (
              <div className="space-y-3">
                <FormCampos form={editForm} setForm={setEditForm} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingId(null)} className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 transition">Cancelar</button>
                  <button onClick={salvarEdicao} disabled={saving} className="flex items-center gap-1.5 text-sm font-medium bg-[#C79A54] hover:bg-[#d8ac68] disabled:opacity-50 text-[#16151A] rounded-lg px-3 py-1.5 transition"><IconCheck /> Salvar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{r.titulo}</span>
                    <span className="text-[11px] text-[#E0B36A] bg-[#C79A54]/15 rounded px-1.5 py-0.5">/{r.atalho}</span>
                  </div>
                  <p className="text-sm text-zinc-400 mt-1 whitespace-pre-wrap break-words">{r.texto}</p>
                  {r.botoes && r.botoes.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {r.botoes.map((b, i) => (
                        <span key={i} className="text-[11px] text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-2.5 py-1">{b.titulo}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => abrirEdicao(r)} title="Editar" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"><IconEdit /></button>
                  <button onClick={() => excluir(r.id)} title="Excluir" className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"><IconTrash /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {respostas.length === 0 && !criando && (
          <p className="text-center text-zinc-600 text-sm py-10">Nenhuma resposta pronta ainda.</p>
        )}
      </div>
    </div>
  )
}
