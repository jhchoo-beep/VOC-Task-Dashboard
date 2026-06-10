import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, score2, score3, score4, score5, score6, score7, score8, score9, score10 } = await req.json()
    if (!propertyId || !weekStart) {
      return NextResponse.json({ error: 'propertyId, weekStart 필수' }, { status: 400 })
    }
    // 가중 평균 계산
    const scores = [score2,score3,score4,score5,score6,score7,score8,score9,score10].map(Number)
    let total = 0, count = 0
    scores.forEach((n, i) => { total += n * (i + 2); count += n })
    const weeklyAvg = count > 0 ? Math.round(total / count * 10) / 10 : 0

    const { error } = await supabase.from('ota_agoda_score_dist').upsert(
      {
        property_id: propertyId, week_start: weekStart,
        score_2: scores[0], score_3: scores[1], score_4: scores[2],
        score_5: scores[3], score_6: scores[4], score_7: scores[5],
        score_8: scores[6], score_9: scores[7], score_10: scores[8],
        weekly_avg_score: weeklyAvg,
      },
      { onConflict: 'property_id,week_start' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
