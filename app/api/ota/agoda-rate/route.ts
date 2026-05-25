import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, reviewCount, checkoutCount, ratePct } = await req.json()
    if (!propertyId || !weekStart) {
      return NextResponse.json({ error: 'propertyId, weekStart 필수' }, { status: 400 })
    }
    const rate = checkoutCount > 0 ? Math.round(reviewCount / checkoutCount * 1000) / 10 : (ratePct ?? 0)
    const { error } = await supabase.from('ota_agoda_review_rate').upsert(
      { property_id: propertyId, week_start: weekStart, review_count: reviewCount ?? 0, checkout_count: checkoutCount ?? 0, rate_pct: rate },
      { onConflict: 'property_id,week_start' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
