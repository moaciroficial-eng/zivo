'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MetaEmbeddedSignup from './MetaEmbeddedSignup'

type Config = {
  nome_loja: string | null
  horario: string | null
  endereco: string | null
  info_extra: string | null
  owner_phone: string | null
  ativo: boolean | null
  proativo_ativo: boolean | null
  desconto_aniversario: number | null
  vende_tenis: boolean | null
  vende_feminino: boolean | null
  whatsapp_provider: string | null
  meta_phone_number_id: string | null
  meta_waba_id: string | null
  meta_access_token: string | null
  anotacoes_dono: string | null
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
  const [vendeTenis, setVendeTenis]     = useState(config?.vende_tenis ?? true)
  const [vendeFeminino, setVendeFeminino] = useState(config?.vende_feminino ?? false)
  const [anotacoes, setAnotacoes]       = useState(config?.anotacoes_dono ?? '')

  // Conexão WhatsApp (Meta Cloud API)
  const [usaMeta, setUsaMeta]           = useState(config?.whatsapp_provider === 'meta')
  const [metaPhoneId, setMetaPhoneId]   = useState(config?.meta_phone_number_id ?? '')
  const [metaWabaId, setMetaWabaId]     = useState(config?.meta_waba_id ?? '')
  const [metaToken, setMetaToken]       = useState(config?.meta_access_token ?? '')
  const [testando, setTestando]         = useState(false)
  const [provisionando, setProvisionando] = useState(false)

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
        vende_tenis: vendeTenis,
        vende_feminino: vendeFeminino,
        anotacoes_dono: anotacoes.trim() || null,
        whatsapp_provider: usaMeta ? 'meta' : 'zapi',
        meta_phone_number_id: usaMeta ? (metaPhoneId.trim() || null) : null,
        meta_waba_id: usaMeta ? (metaWabaId.trim() || null) : null,
        meta_access_token: usaMeta ? (metaToken.trim() || null) : null,
      }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) showToast('Erro ao salvar: ' + error.message, false)
    else showToast('Configurações salvas!')
  }

  async function testarConexao() {
    if (!metaPhoneId.trim() || !metaToken.trim()) {
      showToast('Preencha o Phone Number ID e o token primeiro.', false)
      return
    }
    setTestando(true)
    try {
      const res = await fetch('/api/whatsapp/meta/testar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: metaPhoneId.trim(), accessToken: metaToken.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (d?.ok) showToast(`Conectado${d.phone ? ': ' + d.phone : ''}${d.nome ? ' (' + d.nome + ')' : ''}`)
      else showToast(d?.erro || 'Não consegui validar. Confira os dados.', false)
    } catch {
      showToast('Falha ao testar a conexão.', false)
    } finally {
      setTestando(false)
    }
  }

  async function provisionarTemplates() {
    setProvisionando(true)
    try {
      const res = await fetch('/api/whatsapp/meta/provisionar-templates', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (d?.ok) {
        const r = d.resumo ?? {}
        showToast(`Templates: ${r.criados ?? 0} criados, ${r.existentes ?? 0} já existiam${r.falhas ? `, ${r.falhas} falharam` : ''}.`)
      } else {
        showToast(d?.erro || 'Falha ao provisionar templates.', false)
      }
    } catch {
      showToast('Falha ao provisionar templates.', false)
    } finally {
      setProvisionando(false)
    }
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

        {/* Anotações pro consultor de IA */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" />
            Anotações pro consultor de IA
          </h2>
          <p className="text-xs text-zinc-500">
            Escreva com suas palavras como está o negócio: como foi o mês, o que vendeu bem ou parou, promoções que rolaram, o que anda te preocupando. Quando você pedir uma <b className="text-zinc-400">estratégia ou campanha</b>, a IA lê isso pra bolar algo que faça sentido pra sua realidade.
          </p>
          <textarea
            className={`${inputClass} resize-none`}
            rows={5}
            value={anotacoes}
            onChange={e => setAnotacoes(e.target.value)}
            placeholder={'Ex: Início do mês foi muito bom, do dia 15 pra cá caiu bastante. Acho que foi o frio que passou. Camiseta parada, calça saindo bem. Semana passada fiz um sorteio no Instagram e engajou.'}
          />
          <p className="text-xs text-zinc-600">Dica: vá atualizando conforme o mês anda — quanto mais atual, melhor a estratégia.</p>
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

        {/* Produtos */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-1 divide-y divide-zinc-800/60">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 pb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" />
            Produtos da Loja
          </h2>
          <Toggle
            checked={vendeTenis}
            onChange={setVendeTenis}
            label="Vende tênis"
            desc="Exibe campo de numeração de calçado no cadastro de clientes"
          />
          <Toggle
            checked={vendeFeminino}
            onChange={setVendeFeminino}
            label="Vende feminino"
            desc="Ativa sugestões e cadastros voltados para clientes femininas"
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

        {/* WhatsApp (Meta Cloud API) */}
        <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
              Conexão WhatsApp (Meta)
            </h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
              usaMeta && metaPhoneId && metaToken
                ? 'text-[#00D4AA] border-[#00D4AA]/30 bg-[#00D4AA]/10'
                : 'text-zinc-500 border-zinc-700 bg-zinc-800/40'
            }`}>
              {usaMeta && metaPhoneId && metaToken ? 'Configurado' : 'Não conectado'}
            </span>
          </div>

          {/* Conexão automática (Embedded Signup) */}
          <div className="space-y-2">
            <MetaEmbeddedSignup onDone={(msg, ok) => { showToast(msg, ok); if (ok) setUsaMeta(true) }} />
            <p className="text-xs text-zinc-600 text-center">Recomendado: conecta a conta Meta da loja e provisiona os templates automaticamente.</p>
          </div>

          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">ou conectar manualmente</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          <Toggle
            checked={usaMeta}
            onChange={setUsaMeta}
            label="Usar WhatsApp oficial da Meta"
            desc="Conecta o número desta loja à API oficial (Cloud API)"
          />

          {usaMeta && (
            <div className="space-y-4 pt-1">
              <div>
                <label className={labelClass}>Phone Number ID</label>
                <input className={inputClass} value={metaPhoneId} onChange={e => setMetaPhoneId(e.target.value)} placeholder="Ex: 123456789012345" />
                <p className="text-xs text-zinc-600 mt-1">Encontrado no painel da Meta em WhatsApp → Configuração da API.</p>
              </div>
              <div>
                <label className={labelClass}>WhatsApp Business Account ID (WABA)</label>
                <input className={inputClass} value={metaWabaId} onChange={e => setMetaWabaId(e.target.value)} placeholder="Ex: 987654321098765" />
              </div>
              <div>
                <label className={labelClass}>Token de acesso</label>
                <input type="password" className={inputClass} value={metaToken} onChange={e => setMetaToken(e.target.value)} placeholder="Token permanente do sistema" />
                <p className="text-xs text-zinc-600 mt-1">Use um token permanente (System User) — o token temporário expira em 24h.</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={testarConexao}
                  disabled={testando}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:border-[#25D366]/50 text-sm font-medium text-zinc-200 transition disabled:opacity-50"
                >
                  {testando ? 'Testando...' : 'Testar conexão'}
                </button>
                <button
                  type="button"
                  onClick={provisionarTemplates}
                  disabled={provisionando}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-700 hover:border-[#3B6FFF]/50 text-sm font-medium text-zinc-200 transition disabled:opacity-50"
                >
                  {provisionando ? 'Provisionando...' : 'Provisionar templates'}
                </button>
              </div>
              <p className="text-xs text-zinc-600">"Provisionar templates" copia os modelos já aprovados do Zivo pra WABA desta loja (a Meta ainda aprova cada um).</p>
            </div>
          )}
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
