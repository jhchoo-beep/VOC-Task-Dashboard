import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse, after } from 'next/server'
import { notifyNewComment } from '@/lib/slack'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const taskId = new URL(req.url).searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'taskId 필요' }, { status: 400 })

  const { data, error } = await supabase
    .from('task_logs').select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId, content, author: bodyAuthor, attachments } = await req.json()
  if (!taskId || !content?.trim()) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const author = bodyAuthor?.trim() || (session.user?.name ?? session.user?.email ?? '사용자')
  const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 5) : []

  const { data, error } = await supabase
    .from('task_logs').insert({ task_id: taskId, author, content, attachments: safeAttachments }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 슬랙 알림: 응답 반환 후 실행(after) — 서버리스에서 누락 없이 보장되며 댓글 저장 응답을 지연시키지 않음.
  // 실패해도 댓글 저장에는 영향 없음.
  after(async () => {
    try {
      const { data: task } = await supabase
        .from('tasks').select('branch, title, task_month').eq('id', taskId).single()
      if (task) {
        await notifyNewComment({
          branch: task.branch,
          taskId,
          taskTitle: task.title,
          taskMonth: task.task_month ?? '',
          author,
          content,
        })
      }
    } catch (e) {
      console.error('[slack] 알림 처리 실패:', e)
    }
  })

  return NextResponse.json(data)
}
