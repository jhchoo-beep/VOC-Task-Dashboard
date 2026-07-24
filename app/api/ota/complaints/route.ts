import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, granularity = 'week', roomComplaints, bathroomComplaints, memo, headline } = await req.json()
    if (!propertyId || !weekStart) {
      return NextResponse.json({ error: 'propertyId, weekStart 필수' }, { status: 400 })
    }
    // 사람이 UI에서 입력한 행은 항상 'manual'로 표시한다.
    // 컬럼 기본값이 'manual'이라도 명시하지 않으면, 배치가 이전에 'derived'로 써둔 행을
    // 사람이 수정할 때 source가 그대로 'derived'로 남아 다음 배치 실행 시 조용히 덮어써진다.
    const { error } = await supabase.from('ota_complaints').upsert(
      { property_id: propertyId, week_start: weekStart, granularity, room_complaints: roomComplaints ?? 0, bathroom_complaints: bathroomComplaints ?? 0, memo: memo ?? '', headline: (headline ?? '').trim() || null, source: 'manual' },
      { onConflict: 'property_id,week_start,granularity' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
