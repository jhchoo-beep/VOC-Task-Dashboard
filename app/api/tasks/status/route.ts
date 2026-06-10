import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse, after } from 'next/server'
import { notifyTaskDone } from '@/lib/slack'

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await req.json()
  if (!id || !status) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  // 완료 알림 중복 방지를 위해 이전 상태를 먼저 확인
  const { data: prev } = await supabase
    .from('tasks').select('status').eq('id', id).single()

  const { error } = await supabase.from('tasks').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 상태가 '완료'로 새로 바뀐 경우에만 스쿼드 채널에 축하 알림 발송.
  // 최신 done_memo 반영을 위해 after() 안에서 과제를 재조회한다.
  if (status === '완료' && prev?.status !== '완료') {
    after(async () => {
      try {
        const { data: task } = await supabase
          .from('tasks').select('branch, title, task_month, assignee, done_memo').eq('id', id).single()
        if (task) {
          await notifyTaskDone({
            branch: task.branch,
            taskId: id,
            taskTitle: task.title,
            taskMonth: task.task_month ?? '',
            assignee: task.assignee,
            doneMemo: task.done_memo,
          })
        }
      } catch (e) {
        console.error('[slack] 완료 알림 처리 실패:', e)
      }
    })
  }

  return NextResponse.json({ ok: true })
}
