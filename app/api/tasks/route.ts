import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse, after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { notifyNewTask } from '@/lib/slack'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    branch, task_month, title, severity, churn_trigger,
    problem_definition, solution, category, assignee, due_date,
    priority_score, link_url, link_label, review_content, linked_review_ids,
  } = body

  if (!title?.trim() || !branch) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const { data, error } = await supabase.from('tasks').insert({
    branch, task_month, title,
    severity: severity ?? 'High',
    churn_trigger: churn_trigger ?? [],
    problem_definition: problem_definition ?? null,
    solution: solution ?? null,
    category: category ?? [],
    assignee: assignee ?? null,
    due_date: due_date || null,
    priority_score: priority_score ?? 0,
    link_url: link_url ?? null,
    link_label: link_label ?? null,
    review_content: review_content ?? null,
    linked_review_ids: linked_review_ids ?? [],
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag('tasks', 'max')

  // 슬랙 알림: 응답 반환 후 실행(after) — 신규 수행과제 등록을 해당 지점 스쿼드 채널에 통보.
  // 실패해도 과제 저장 응답에는 영향 없음.
  // 발송된 메시지의 ts를 저장해 둔다 — 이후 진행사항 댓글 알림이 이 스레드의 답글로 붙는다.
  after(async () => {
    try {
      const threadTs = await notifyNewTask({
        branch: data.branch,
        taskId: data.id,
        taskTitle: data.title,
        taskMonth: data.task_month ?? '',
        severity: data.severity ?? '',
        assignee: data.assignee,
        dueDate: data.due_date,
        churnTrigger: data.churn_trigger,
      })
      if (threadTs) {
        const { error: tsError } = await supabase
          .from('tasks').update({ slack_thread_ts: threadTs }).eq('id', data.id)
        if (tsError) console.error('[slack] 스레드 ts 저장 실패:', tsError.message)
      }
    } catch (e) {
      console.error('[slack] 신규 과제 알림 처리 실패:', e)
    }
  })

  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month  = searchParams.get('month')
  const branch = searchParams.get('branch')

  let q = supabase.from('tasks').select('*')
  if (month)  q = q.eq('task_month', month)
  if (branch) q = q.eq('branch', branch)
  q = q.order('severity').order('priority_score', { ascending: false })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
