import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

// 리뷰 작성률의 분모. 채널(property) 단위 주간 체크아웃 수다.
// 지점 공용값이 아니다 — 그 채널로 예약한 고객의 체크아웃 수만 센다.
// (신설의 119~147건은 아고다 예약 고객 기준이다. 지점 전체 체크아웃이 아니다.)
export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, checkoutCount } = await req.json()
    if (!propertyId || !weekStart || checkoutCount == null) {
      return NextResponse.json({ error: 'propertyId, weekStart, checkoutCount 필수' }, { status: 400 })
    }
    const { error } = await supabase.from('ota_channel_checkouts').upsert(
      { property_id: Number(propertyId), week_start: weekStart, checkout_count: Number(checkoutCount) },
      { onConflict: 'property_id,week_start' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // 누락하면 최대 300초간 수정이 화면에 안 뜬다 (Next 16 2인자 형식)
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
