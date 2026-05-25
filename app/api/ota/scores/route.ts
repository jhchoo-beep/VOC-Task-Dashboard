import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, recordedAt, overallScore, reviewCount } = await req.json()
    if (!propertyId || !recordedAt || overallScore == null) {
      return NextResponse.json({ error: 'propertyId, recordedAt, overallScore 필수' }, { status: 400 })
    }
    const { error } = await supabase.from('ota_scores').upsert(
      { property_id: propertyId, recorded_at: recordedAt, overall_score: overallScore, review_count: reviewCount ?? 0 },
      { onConflict: 'property_id,recorded_at' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
