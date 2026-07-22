import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, granularity = 'week', roomComplaints, bathroomComplaints, memo } = await req.json()
    if (!propertyId || !weekStart) {
      return NextResponse.json({ error: 'propertyId, weekStart 필수' }, { status: 400 })
    }
    const { error } = await supabase.from('ota_complaints').upsert(
      { property_id: propertyId, week_start: weekStart, granularity, room_complaints: roomComplaints ?? 0, bathroom_complaints: bathroomComplaints ?? 0, memo: memo ?? '' },
      { onConflict: 'property_id,week_start,granularity' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
