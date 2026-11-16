'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Disparo = { id: string; template_name: string; status: string; total_destinatarios: number; agendado_para: string | null; created_at: string }
type Contagem = { pendente: number; enviado: number; entregue: number; lido: number; falhou: number }
type Envio = { nome: string; status: string; motivo: string | null; contatoId: string | null; respondeu: boolean }

const CARD = 'bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-4'

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Na fila', enviado: 'Enviado', entregue: 'Entregue', lido: 'Lido', falhou: 'Falhou',
}
const STATUS_COR: Record<string, string> = {
  pendente: 'text-zinc-400', enviado: 'text-zinc-300', entregue: 'text-sky-400', lido: 'text-emerald-400', falhou: 'text-red-400',
}

export default function DisparoResultadoClient({ id }: { id: string }) {
  const [disparo, setDisparo] = useState<Disparo | null>(null)
  const [contagem, setContagem] = useState<Contagem | null>(null)
  const [respostas, setRespostas] = useState(0)
  const [envios, setEnvios] = useState<Envio[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const carregandoRef = useRef(false)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/disparo-template/${id}`)
      const data = await res.json()
      if (!data.ok) { setErro(data.erro || 'Disparo não encontrado.'); return }
      setDisparo(data.disparo)
      setContagem(data.contagem)
      setRespostas(data.respostas ?? 0)
      setEnvios(data.envios ?? [])
      return data.disparo as Disparo
    } catch {
      setErro('Falha ao carregar o resultado.')
      return null
    }
  }, [id])

  /* Envio "agora": o navegador chama o lote repetidas vezes até esvaziar a
     fila de pendentes, com uma pausa curta entre chamadas (não trava a tela
     e respeita o ritmo da Meta). Agendado: o cron cuida sozinho -- aqui só
     mostramos o status, sem disparar nada do navegador. */
  useEffect(() => {
    let cancelado = false
    async function loop() {
      if (carregandoRef.current) return
      carregandoRef.current = true
      const d = await carregar()
      if (!d || cancelado) { carregandoRef.current = false; return }
      const precisaEnviar = !d.agendado_para && (d.status === 'enviando')
      if (precisaEnviar) {
        setEnviando(true)
        const res = await fetch(`/api/campanhas/disparo-template/${id}/enviar-lote`, { method: 'POST' }).catch(() => null)
        const data = await res?.json().catch(() => null)
        carregandoRef.current = false
        if (!cancelado && data?.ok && data.restantes > 0) {
          setTimeout(loop, 800)
        } else {
          setEnviando(false)
          if (!cancelado) carregar()
        }
      } else {
        carregandoRef.current = false
      }
    }
    loop()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (erro) return <div className="p-6 max-w-2xl mx-auto text-sm text-red-400">{erro}</div>
  if (!disparo || !contagem) return <div className="p-6 max-w-2xl mx-auto text-sm text-zinc-500">Carregando…</div>

  const total = disparo.total_destinatarios || 1
  const processados = contagem.enviado + contagem.entregue + contagem.lido + contagem.falhou

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/campanhas" className="hover:text-zinc-300 transition">Campanhas</Link>
        <span>/</span>
        <span className="text-zinc-300">Resultado do disparo</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-zinc-100 font-mono">{disparo.template_name}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {disparo.agendado_para
            ? `Agendado pra ${new Date(disparo.agendado_para).toLocaleString('pt-BR')}`
            : enviando ? 'Enviando agora…' : disparo.status === 'concluido' ? 'Concluído' : disparo.status}
        </p>
      </div>

      {(enviando || (!disparo.agendado_para && disparo.status !== 'concluido')) && (
        <div className={CARD}>
          <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
            <div className="h-full bg-[#C79A54] transition-all" style={{ width: `${Math.round((processados / total) * 100)}%` }} />
          </div>
          <p className="text-xs text-zinc-500 mt-2">{processados} de {disparo.total_destinatarios} processados</p>
        </div>
      )}

      <div className={CARD + ' grid grid-cols-3 gap-3 text-center'}>
        <div><p className="text-lg font-semibold text-zinc-200">{contagem.entregue + contagem.lido + contagem.enviado}</p><p className="text-xs text-zinc-500">Enviados</p></div>
        <div><p className="text-lg font-semibold text-emerald-400">{contagem.lido}</p><p className="text-xs text-zinc-500">Leram</p></div>
        <div><p className="text-lg font-semibold text-[#C79A54]">{respostas}</p><p className="text-xs text-zinc-500">Responderam</p></div>
      </div>
      {contagem.falhou > 0 && (
        <p className="text-sm text-red-400">{contagem.falhou} falharam.</p>
      )}

      <div className={CARD + ' flex flex-col gap-1 max-h-96 overflow-y-auto'}>
        {envios.map((e, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-700/40 last:border-0">
            <span className="text-sm text-zinc-300 truncate">{e.nome}</span>
            <div className="flex items-center gap-2 shrink-0">
              {e.respondeu && e.contatoId && (
                <Link href={`/whatsapp?contato=${e.contatoId}`} className="text-xs text-[#C79A54] hover:underline">abrir conversa</Link>
              )}
              <span className={`text-xs font-semibold ${STATUS_COR[e.status] ?? 'text-zinc-400'}`}>{STATUS_LABEL[e.status] ?? e.status}</span>
            </div>
            {e.motivo && <span className="text-[10px] text-red-400/80 w-full">{e.motivo}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
