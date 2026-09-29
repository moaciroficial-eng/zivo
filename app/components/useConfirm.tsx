'use client'

import { useState, useCallback, type ReactNode } from 'react'

type Opcoes = { titulo?: string; confirmar?: string; perigo?: boolean }
type Pedido = Opcoes & { message: string; onOk: () => void }

/* Modal de confirmação bonito, no lugar do confirm() feio do navegador.
   Uso:
     const [confirmUI, pedirConfirm] = useConfirm()
     ...render {confirmUI}...
     pedirConfirm('Apagar isso?', () => apagar(), { perigo: true, confirmar: 'Apagar' })
*/
export function useConfirm(): [ReactNode, (message: string, onOk: () => void, opts?: Opcoes) => void] {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const ask = useCallback((message: string, onOk: () => void, opts?: Opcoes) => {
    setPedido({ message, onOk, ...opts })
  }, [])

  const el: ReactNode = pedido ? (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPedido(null)}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        {pedido.titulo && <h3 className="font-bold text-white mb-1.5">{pedido.titulo}</h3>}
        <p className="text-sm text-zinc-300 leading-relaxed">{pedido.message}</p>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={() => setPedido(null)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 transition cursor-pointer">Cancelar</button>
          <button
            onClick={() => { const f = pedido.onOk; setPedido(null); f() }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition cursor-pointer ${pedido.perigo ? 'bg-red-600 hover:bg-red-500' : 'bg-violet-600 hover:bg-violet-500'}`}
          >
            {pedido.confirmar ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return [el, ask]
}
