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
    // 사람이 UI에서 입력한 행은 항상 'manual'로 표시한다.
    // 컬럼 기본값이 'manual'이라도 명시하지 않으면, 배치가 이전에 'derived'로 써둔 행을
    // 사람이 수정할 때 source가 그대로 'derived'로 남아 다음 배치 실행 시 조용히 덮어써진다.
    const rows = items.map((item: { band: string; sentiment: string; keyword: string }) => ({
      property_id: propertyId,
      week_start: weekStart,
      granularity,
      band: item.band,
      sentiment: item.sentiment,
      keyword: item.keyword,
      source: 'manual',
    }))
    const { error } = await supabase.from('ota_voc').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
