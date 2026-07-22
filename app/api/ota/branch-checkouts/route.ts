import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

// 리뷰 작성률의 분모. 지점 단위 주간 체크아웃 수 — 채널별로 나뉘지 않는다.
export async function POST(req: NextRequest) {
  try {
    const { branch, weekStart, checkoutCount } = await req.json()
    if (!branch || !weekStart || checkoutCount == null) {
      return NextResponse.json({ error: 'branch, weekStart, checkoutCount 필수' }, { status: 400 })
    }
    const { error } = await supabase.from('ota_branch_checkouts').upsert(
      { branch, week_start: weekStart, checkout_count: Number(checkoutCount) },
      { onConflict: 'branch,week_start' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
