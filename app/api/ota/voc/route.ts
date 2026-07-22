import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, granularity = 'week', items } = await req.json()
    if (!propertyId || !weekStart || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'propertyId, weekStart, items 필수' }, { status: 400 })
    }
    // ota_voc는 unique 제약이 없어(키 하나에 여러 키워드 행이 정상) delete 실패를 놓치면
    // 기존 행이 남은 채 insert가 더해져 중복 데이터가 쌓인다. delete 에러는 반드시 확인한다.
    const { error: deleteError } = await supabase.from('ota_voc')
      .delete()
      .eq('property_id', propertyId).eq('week_start', weekStart).eq('granularity', granularity)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    // delete 성공 후 insert가 실패하면 기존 행은 이미 삭제된 상태로 복구되지 않는다(비원자적).
    // Supabase JS 클라이언트에 트랜잭션 수단이 없고, 데이터는 배치 작업으로 재생성 가능하므로 의도적으로 감수한다.
    const rows = items.map((item: { band: string; sentiment: string; keyword: string }) => ({
      property_id: propertyId,
      week_start: weekStart,
      granularity,
      band: item.band,
      sentiment: item.sentiment,
      keyword: item.keyword,
    }))
    const { error } = await supabase.from('ota_voc').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
