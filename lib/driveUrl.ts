export const MAX_FILES = 5
// 파일당 용량 제한은 두지 않는다 — 업로드 전 클라이언트가 이미지를 압축(lib/imageCompress)해
// Vercel 요청 본문 한도(4.5MB) 밑으로 맞추고, 사진을 1장씩 개별 전송하기 때문이다.

export function driveThumbUrl(fileId: string, width = 1000): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
}

export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

type UploadLike = { size: number; type: string }
type ValidateResult = { ok: true } | { ok: false; error: string }

export function validateUploads(files: UploadLike[]): ValidateResult {
  if (files.length === 0) return { ok: false, error: '파일이 없습니다' }
  if (files.length > MAX_FILES) return { ok: false, error: `사진은 최대 ${MAX_FILES}장까지 첨부할 수 있습니다` }
  for (const f of files) {
    if (!f.type.startsWith('image/')) return { ok: false, error: '이미지 파일만 첨부할 수 있습니다' }
  }
  return { ok: true }
}
