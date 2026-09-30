/* Chave pública VAPID — pode ficar no código (não é segredo). O cliente usa
   ela pra se inscrever no push. A chave PRIVADA fica só no ambiente da Vercel
   (VAPID_PRIVATE_KEY) e nunca no repositório. As duas são do mesmo par. */
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BB-PpqluuljNx_28Cp9UpCt-Wwq32gV76L2ZLV29jQGNKthtGjUty72HhoB9oKhtG0CVGewCoXR647VwhBxH6MA'
