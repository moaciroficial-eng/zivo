/** Redimensiona uma imagem para no máximo 1024px e retorna base64 JPEG. */
export async function imageToBase64(file: File): Promise<string> {
  const MAX = 1024
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')

  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(file)
    let { width, height } = bitmap
    if (width > MAX || height > MAX) {
      if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
      else                 { width = Math.round(width * MAX / height); height = MAX }
    }
    canvas.width = width; canvas.height = height
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
  } else {
    await new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')) }
      img.onload  = () => {
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
          else                 { width = Math.round(width * MAX / height); height = MAX }
        }
        canvas.width = width; canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(url)
        resolve()
      }
      img.src = url
    })
  }

  const result = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
  if (!result) throw new Error('Conversão de imagem falhou')
  return result
}

/** Lê um arquivo binário (ex: PDF) como base64 sem modificações. */
export function fileToBase64Raw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}
