'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Config = {
  nome_loja: string | null
  horario: string | null
  endereco: string | null
  info_extra: string | null
  owner_phone: string | null
  ativo: boolean | null
  proativo_ativo: boolean | null
  desconto_aniversario: number | null
}

function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-[#3B6FFF]' : 'bg-zinc-700'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border transition-all ${ok ? 'bg-[#00D4AA]/10 border-[#00D4AA]/30 text-[#00D4AA]' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
      {msg}
    </div>
  )
}

export default function LojaConfigClient({ user, config }: { user: { id: string; email: string }; config: Config | null }) {
  const supabase = createClient()

  const [nomeLoja, setNomeLoja]         = useState(config?.nome_loja ?? '')
  const [horario, setHorario]           = useState(config?.horario ?? '')
  const [endereco, setEndereco]         = useState(config?.endereco ?? '')
  const [infoExtra, setInfoExtra]       = useState(config?.info_extra ?? '')
  const [ownerPhone, setOwnerPhone]     = useState(config?.owner_phone ?? '')
  const [ativo, setAtivo]               = useState(config?.ativo ?? true)
  const [proativoAtivo, setProativoAtivo] = useState(config?.proativo_ativo ?? true)
  const [desconto, setDesconto]         = useState(config?.desconto_aniversario ?? 40)

  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function salvar() {
    setSaving(true)
    const { error } = await supabase
      .from('loja_config')
      .upsert({
        user_id: user.id,
        nome_loja: nomeLoja || null,
        horario: horario || null,
        endereco: endereco || null,
        info_extra: infoExtra || null,
        owner_phone: ownerPhone || null,
        ativo,
        proativo_ativo: proativoAtivo,
        desconto_aniversario: desconto,
      }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) showToast('Erro ao salvar: ' + error.message, false)
    else showToast('Configurações salvas!')
  }

  const inputClass = 'w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#3B6FFF]/60 focus:ring-1 focus:ring-[#3B6FFF]/30 transition'
  const labelClass = 'block text-xs font-medium text-zinc-400 mb-1.5'

  return (
    <div className="min-h-screen bg-[#080B10] p-6 md:p-8">
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Configurações da Loja</h1>
          <p className="text-sm text-zinc-500 mt-1">Personalize como o Zivo representa sua loja</p>
        </div>

        {/* Dados da loja */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B6FFF]" />
            Dados da Loja
          </h2>

          <div>
            <label className={labelClass}>Nome da loja</label>
            <input className={inputClass} value={nomeLoja} onChange={e => setNomeLoja(e.target.value)} placeholder="Ex: Moca" />
          </div>

          <div>
            <label className={labelClass}>Telefone do dono</label>
            <input className={inputClass} value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} placeholder="5511999999999" />
            <p className="text-xs text-zinc-600 mt-1">Número com código do país. Usado para comandos via WhatsApp.</p>
          </div>

          <div>
            <label className={labelClass}>Horário de funcionamento</label>
            <input className={inputClass} value={horario} onChange={e => setHorario(e.target.value)} placeholder="Seg a Sex: 9h às 19h | Sáb: 9h às 13h" />
          </div>

          <div>
            <label className={labelClass}>Endereço</label>
            <input className={inputClass} value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua Exemplo, 123 — Bairro, Cidade" />
          </div>

          <div>
            <label className={labelClass}>Informações extras</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              value={infoExtra}
              onChange={e => setInfoExtra(e.target.value)}
              placeholder="Ex: Trabalhamos com encomendas. Aceitamos Pix, cartão e dinheiro."
            />
            <p className="text-xs text-zinc-600 mt-1">O assistente usa essas informações para responder clientes.</p>
          </div>
        </div>

        {/* Atendimento */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-1 divide-y divide-zinc-800/60">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 pb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B6FFF]" />
            Atendimento Automático
          </h2>
          <Toggle
            checked={ativo}
            onChange={setAtivo}
            label="Atendimento ativo"
            desc="Liga ou desliga o assistente para responder clientes no WhatsApp"
          />
          <Toggle
            checked={proativoAtivo}
            onChange={setProativoAtivo}
            label="Agente proativo"
            desc="Envia mensagens automáticas baseadas no comportamento dos clientes"
          />
        </div>

        {/* Aniversário */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" />
            Cupom de Aniversário
          </h2>
          <div>
            <label className={labelClass}>Desconto (%)</label>
            <div className="relative w-32">
              <input
                type="number"
                min={1}
                max={100}
                className={inputClass}
                value={desconto}
                onChange={e => setDesconto(Number(e.target.value))}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-500">%</span>
            </div>
            <p className="text-xs text-zinc-600 mt-1">Enviado automaticamente 1 dia antes e no dia do aniversário.</p>
          </div>
        </div>

        {/* WhatsApp */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            Conexão WhatsApp
          </h2>
          <div className="flex items-center gap-3 py-2">
            <span className="w-2 h-2 rounded-full bg-[#00D4AA] animate-pulse" />
            <p className="text-sm text-zinc-400">Instância Z-API configurada via painel do servidor</p>
          </div>
          <p className="text-xs text-zinc-600 mt-1">Integração com múltiplas instâncias disponível em breve.</p>
        </div>

        <button
          onClick={salvar}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#3B6FFF] to-[#00D4AA] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
