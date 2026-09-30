import webpush from 'web-push'
import { VAPID_PUBLIC_KEY } from '@/lib/push-public'

/* ══════════════════════════════════════════════════════════════
   ENVIO DE NOTIFICAÇÃO PUSH (PWA)

   enviarPushParaUsuario lê as inscrições do dono e dispara o aviso em
   todos os dispositivos dele. Inscrições mortas (410/404) são apagadas.
   Precisa da env VAPID_PRIVATE_KEY na Vercel; sem ela, não faz nada.
   ══════════════════════════════════════════════════════════════ */

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const CONTATO = `mailto:${process.env.FOUNDER_EMAIL ?? 'moaciroficial@gmail.com'}`

let configurado = false
function garantirConfig(): boolean {
  if (configurado) return true
  if (!VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(CONTATO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configurado = true
  return true
}

export function pushConfigurado(): boolean {
  return !!VAPID_PRIVATE_KEY
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string; icon?: string }

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

export async function enviarPushParaUsuario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  payload: PushPayload,
): Promise<{ enviadas: number; removidas: number }> {
  if (!garantirConfig()) return { enviadas: 0, removidas: 0 }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  const lista = (subs ?? []) as SubRow[]
  if (!lista.length) return { enviadas: 0, removidas: 0 }

  const body = JSON.stringify(payload)
  let enviadas = 0
  let removidas = 0

  await Promise.all(lista.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
      enviadas++
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
        removidas++
      }
    }
  }))

  return { enviadas, removidas }
}
