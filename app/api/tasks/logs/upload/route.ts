import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { uploadImage, validateUploads, type Attachment } from '@/lib/drive'

export const runtime = 'nodejs' // googleapis는 Node 런타임 필요(edge 불가)

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)

  const valid = validateUploads(files.map(f => ({ size: f.size, type: f.type })))
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 })

  try {
    const attachments: Attachment[] = []
    for (const f of files) {
      const buffer = Buffer.from(await f.arrayBuffer())
      attachments.push(await uploadImage(buffer, f.name || 'photo.jpg', f.type))
    }
    return NextResponse.json({ attachments })
  } catch (e: any) {
    console.error('[upload] Drive 업로드 실패:', e)
    return NextResponse.json({ error: '사진 업로드에 실패했습니다' }, { status: 500 })
  }
}
