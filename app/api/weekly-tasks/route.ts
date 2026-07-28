import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { WEEKLY_TASK_STATUSES } from '@/lib/weeklyTasks'

// 주간 수행과제 쓰기 API. tasks 라우트와 같은 골격이되 슬랙 알림은 붙이지 않는다 —
// 주간 과제는 회의에서 재헌님이 직접 만들고 닫는 층이라 스쿼드 채널로 나갈 것이 없다.
//
// 🔴 revalidateTag를 호출하지 않는다. lib/pageData.ts의 getWeeklyTasks는 unstable_cache로
//    감싸지 않는다 — 캐시가 없으니 무효화할 것도 없다(2026-07-28 수정, 이유는 그쪽 주석 참조).

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const b = await req.json()
  if (!b.week_start) return bad('week_start 누락')
  if (!b.title?.trim()) return bad('제목을 입력해 주세요')

  const { data, error } = await supabase.from('weekly_tasks').insert({
    week_start:         b.week_start,
    branches:           Array.isArray(b.branches) ? b.branches : [],
    title:              b.title.trim(),
    problem_definition: b.problem_definition?.trim() || null,
    solution:           b.solution?.trim() || null,
    assignee:           b.assignee?.trim() || null,
    due_date:           b.due_date || null,
    status:             WEEKLY_TASK_STATUSES.includes(b.status) ? b.status : '시작전',
    source_reviews:     Array.isArray(b.source_reviews) ? b.source_reviews : [],
  }).select().single()

  if (error) return bad(error.message, 500)

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const b = await req.json()
  if (!b.id) return bad('id 누락')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (b.title !== undefined) {
    if (!b.title?.trim()) return bad('제목을 비울 수 없습니다')
    patch.title = b.title.trim()
  }
  for (const k of ['problem_definition', 'solution', 'assignee'] as const) {
    if (b[k] !== undefined) patch[k] = b[k]?.trim() || null
  }
  if (b.due_date !== undefined) patch.due_date = b.due_date || null
  if (b.branches !== undefined) patch.branches = Array.isArray(b.branches) ? b.branches : []
  if (b.status !== undefined) {
    if (!WEEKLY_TASK_STATUSES.includes(b.status)) return bad('알 수 없는 상태')
    patch.status = b.status
  }
  // 채택 시각은 클라이언트를 믿지 않고 서버가 찍는다. 해제하면 시각도 지운다.
  if (b.escalated !== undefined) {
    patch.escalated = Boolean(b.escalated)
    patch.escalated_at = b.escalated ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from('weekly_tasks').update(patch).eq('id', b.id).select().single()

  if (error) return bad(error.message, 500)

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return bad('id 누락')

  const { error } = await supabase.from('weekly_tasks').delete().eq('id', id)
  if (error) return bad(error.message, 500)

  return NextResponse.json({ ok: true })
}
