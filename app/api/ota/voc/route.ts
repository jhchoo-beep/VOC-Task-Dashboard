import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, granularity = 'week', items } = await req.json()
    if (!propertyId || !weekStart || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'propertyId, weekStart, items 필수' }, { status: 400 })
    }
    await supabase.from('ota_voc')
      .delete()
      .eq('property_id', propertyId).eq('week_start', weekStart).eq('granularity', granularity)

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
