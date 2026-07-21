import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await req.json()
  if (!id || !status) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag('tasks', 'max')

  // 수행과제 '완료' 시 슬랙 알림은 의도적으로 보내지 않는다(2026-07-21, 재헌님 요청).
  // 완료 알림 로직(lib/slack notifyTaskDone/buildTaskDoneText)은 재활성화 대비해 남겨두되 호출하지 않는다.

  return NextResponse.json({ ok: true })
}
