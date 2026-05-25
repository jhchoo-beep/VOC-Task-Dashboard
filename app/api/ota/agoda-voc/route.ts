import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, items } = await req.json()
    if (!propertyId || !weekStart || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'propertyId, weekStart, items 필수' }, { status: 400 })
    }
    const rows = items.map((item: { band: string; sentiment: string; keyword: string }) => ({
      property_id: propertyId,
      week_start: weekStart,
      band: item.band,
      sentiment: item.sentiment,
      keyword: item.keyword,
    }))
    const { error } = await supabase.from('ota_agoda_voc').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
