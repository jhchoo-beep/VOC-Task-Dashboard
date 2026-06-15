import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse, after } from 'next/server'
import { deleteImage, type Attachment } from '@/lib/drive'

export const runtime = 'nodejs'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  // 삭제 전에 첨부 fileId를 확보(행 삭제 후엔 못 읽음)
  const { data: log } = await supabase.from('task_logs').select('attachments').eq('id', id).single()

  const { error } = await supabase.from('task_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const attachments: Attachment[] = Array.isArray(log?.attachments) ? log!.attachments : []
  if (attachments.length > 0) {
    after(async () => {
      for (const a of attachments) await deleteImage(a.fileId)
    })
  }

  return NextResponse.json({ ok: true })
}
