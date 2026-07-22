import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { distColumnsFor } from '@/lib/otaDetail'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, granularity = 'week', scoreMax = 10, counts } = await req.json()
    if (!propertyId || !weekStart || !counts) {
      return NextResponse.json({ error: 'propertyId, weekStart, counts 필수' }, { status: 400 })
    }

    // 가중 평균 — 밴드 대표값(score_N → N점)으로 계산한다.
    // 배치 파생은 실제 rating 평균을 쓰지만, 수기 입력은 분포만 알므로 여기서는 밴드 근사가 최선이다.
    const cols = distColumnsFor(Number(scoreMax))
    let total = 0, count = 0
    const row: Record<string, number> = {}
    cols.forEach((c, i) => {
      const n = Number(counts[c] ?? 0)
      row[c] = n
      total += n * (i + 1)
      count += n
    })
    const avg = count > 0 ? Math.round(total / count * 10) / 10 : 0

    // 사람이 UI에서 입력한 행은 항상 'manual'로 표시한다.
    // 컬럼 기본값이 'manual'이라도 명시하지 않으면, 배치가 이전에 'derived'로 써둔 행을
    // 사람이 수정할 때 source가 그대로 'derived'로 남아 다음 배치 실행 시 조용히 덮어써진다.
    const { error } = await supabase.from('ota_score_dist').upsert(
      { property_id: propertyId, week_start: weekStart, granularity, ...row, weekly_avg_score: avg, source: 'manual' },
      { onConflict: 'property_id,week_start,granularity' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
