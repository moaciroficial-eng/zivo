'use client'

/* Converte o áudio gravado no navegador (webm/opus no Chrome/Android,
   mp4/aac no Safari/iOS) pra OGG com codec Opus -- o único formato que a
   Meta Cloud API renderiza como nota de voz (bolha com onda) em vez de
   arquivo de áudio comum.

   Roda via ffmpeg.wasm DENTRO do navegador, não numa function serverless --
   evita depender de um binário nativo de ffmpeg rodando (ou não) dentro da
   Lambda da Vercel. O core (~8MB, wasm single-thread, sem precisar de
   cross-origin-isolation) é buscado uma vez da CDN e fica em cache do
   navegador depois disso. */

const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

let ffmpegPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null

async function carregarFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { toBlobURL } = await import('@ffmpeg/util')
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })()
  }
  return ffmpegPromise
}

function extensaoDe(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export async function converterParaOggOpus(blob: Blob): Promise<Blob> {
  const ffmpeg = await carregarFFmpeg()
  const { fetchFile } = await import('@ffmpeg/util')
  const nomeEntrada = `entrada.${extensaoDe(blob.type)}`
  const nomeSaida = 'saida.ogg'
  await ffmpeg.writeFile(nomeEntrada, await fetchFile(blob))
  try {
    /* mono + 48kHz + ~32kbps -- qualidade de nota de voz, arquivo pequeno */
    await ffmpeg.exec(['-i', nomeEntrada, '-c:a', 'libopus', '-ar', '48000', '-ac', '1', '-b:a', '32k', nomeSaida])
    const data = await ffmpeg.readFile(nomeSaida) as Uint8Array
    const copia = new Uint8Array(data.length)
    copia.set(data)
    return new Blob([copia], { type: 'audio/ogg; codecs=opus' })
  } finally {
    await ffmpeg.deleteFile(nomeEntrada).catch(() => null)
    await ffmpeg.deleteFile(nomeSaida).catch(() => null)
  }
}
