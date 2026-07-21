// 업로드 전 이미지 압축 유틸.
// 목적: Vercel 서버리스 요청 본문 4.5MB 한도를 넘지 않도록 브라우저에서 미리 리사이즈·재인코딩한다.
// fitDimensions는 순수 함수(단위 테스트 대상), compressImage는 브라우저 전용(모든 DOM API는 함수 내부 참조).

export const MAX_EDGE = 2048 // 긴 변 최대 px
export const QUALITY = 0.82 // JPEG 품질

/** 종횡비를 유지한 채 긴 변을 maxEdge로 축소한 정수 치수. 원본이 작으면 확대하지 않고 그대로. */
export function fitDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) return { width, height }
  const scale = maxEdge / longEdge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** file을 비트맵으로 디코드. createImageBitmap 우선(EXIF 방향 반영), 실패 시 <img> 폴백. */
async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() }
    } catch {
      // 폴백으로 진행
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * 이미지를 긴 변 maxEdge / JPEG quality로 압축한 새 File을 반환한다.
 * 이미지가 아니거나, 디코드 실패, 또는 압축 결과가 원본보다 크면 원본을 그대로 반환(안전 폴백).
 */
export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? MAX_EDGE
  const quality = opts.quality ?? QUALITY
  if (!file.type.startsWith('image/')) return file

  let decoded: Awaited<ReturnType<typeof decodeImage>> | null = null
  try {
    decoded = await decodeImage(file)
    const { width, height } = fitDimensions(decoded.width, decoded.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(decoded.source, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (!blob || blob.size >= file.size) return file // 더 커지면(이미 작은 파일) 원본 유지
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file // 미지원 포맷 등 → 원본 폴백
  } finally {
    decoded?.cleanup()
  }
}
