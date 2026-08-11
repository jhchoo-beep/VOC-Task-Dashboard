import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { isTriageVerdict } from '@/lib/weeklyTriage'

// 미달 리뷰 판단(조치/이월/종결) 쓰기 API. weekly-tasks 라우트와 같은 골격.
// 판단은 리뷰당 하나(PK=review_id)라 POST가 곧 upsert다 — 같은 리뷰를 다시 판단하면
// 덮어쓴다. 슬랙 알림 없음: 회의 전 재헌님이 붙이는 개인 판단 층이다.
//
// 🔴 revalidateTag를 호출하지 않는다. getWeeklyReportProps는 캐시가 없다(2026-08-08).

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const b = await req.json()
  if (!b.review_id) return bad('review_id 누락')
  if (!b.week_start) return bad('week_start 누락')
  if (typeof b.property_id !== 'number') return bad('property_id 누락')
  if (!isTriageVerdict(b.verdict)) return bad('알 수 없는 판단')

  const { data, error } = await supabase.from('review_triage').upsert({
    review_id:   b.review_id,
    week_start:  b.week_start,
    property_id: b.property_id,
    verdict:     b.verdict,
    note:        b.note?.trim() || null,
    updated_at:  new Date().toISOString(),
  }).select().single()

  if (error) return bad(error.message, 500)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const id = req.nextUrl.searchParams.get('review_id')
  if (!id) return bad('review_id 누락')

  const { error } = await supabase.from('review_triage').delete().eq('review_id', id)
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}
