import { google } from 'googleapis'
import { Readable } from 'node:stream'

export const MAX_FILES = 5
export const MAX_BYTES = 10 * 1024 * 1024 // 10MB

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
    if (f.size > MAX_BYTES) return { ok: false, error: '각 사진은 10MB 이하만 가능합니다' }
  }
  return { ok: true }
}

export type Attachment = { fileId: string; name: string }

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const folderId = process.env.DRIVE_VOC_FOLDER_ID
  if (!raw || !folderId) throw new Error('Drive 환경변수(GOOGLE_SERVICE_ACCOUNT_JSON / DRIVE_VOC_FOLDER_ID)가 없습니다')
  const credentials = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] })
  return { drive: google.drive({ version: 'v3', auth }), folderId }
}

/** 버퍼를 전용 폴더에 업로드하고 '링크 있는 누구나 보기' 권한을 부여한 뒤 fileId를 반환한다. */
export async function uploadImage(buffer: Buffer, filename: string, mime: string): Promise<Attachment> {
  const { drive, folderId } = driveClient()
  const created = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buffer) },
    fields: 'id, name',
  })
  const fileId = created.data.id!
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } })
  return { fileId, name: created.data.name ?? filename }
}

/** best-effort 삭제. 실패해도 throw하지 않는다. */
export async function deleteImage(fileId: string): Promise<void> {
  try {
    const { drive } = driveClient()
    await drive.files.delete({ fileId })
  } catch (e) {
    console.error('[drive] 파일 삭제 실패:', fileId, e)
  }
}
