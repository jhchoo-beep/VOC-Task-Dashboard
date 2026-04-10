import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month  = searchParams.get('month')
  const branch = searchParams.get('branch')
  const ota    = searchParams.get('ota')

  let q = supabase.from('raw_reviews').select('*')
  if (month)  q = q.eq('review_month', month)
  if (branch) q = q.eq('branch', branch)
  if (ota)    q = q.eq('ota_site', ota)
  q = q.order('review_month', { ascending: false }).order('rating')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { branch, ota_site, review_month, reviewer, country, travel_type, room_type, rating, content, has_response, raw_date } = body

  if (!branch || !ota_site || !review_month) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const { data, error } = await supabase.from('raw_reviews').insert({
    branch, ota_site, review_month,
    reviewer: reviewer ?? null,
    country: country ?? null,
    travel_type: travel_type ?? null,
    room_type: room_type ?? null,
    rating: rating ?? null,
    content: content ?? null,
    has_response: has_response ?? false,
    raw_date: raw_date ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
