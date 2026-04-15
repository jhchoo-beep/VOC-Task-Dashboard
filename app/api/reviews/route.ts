import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month    = searchParams.get('month')
  const branch   = searchParams.get('branch')
  const severity = searchParams.get('severity')

  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam) : 1000

  let q = supabase.from('reviews').select('*')
  if (month)    q = q.eq('review_month', month)
  if (branch)   q = q.eq('branch', branch)
  if (severity) q = q.eq('severity', severity)
  q = q.order('severity').order('rating').limit(limit)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { data, error } = await supabase.from('reviews').insert({
    branch:           body.branch,
    ota_site:         body.ota_site,
    rating:           body.rating,
    review_month:     body.review_month,
    content:          body.content ?? null,
    categories:       body.categories ?? [],
    severity:         body.severity ?? null,
    churn_triggers:   body.churn_triggers ?? [],
    customer_segment: body.customer_segment ?? null,
    priority_score:   body.priority_score ?? 0,
    crs_score:        body.crs_score ?? 0,
    status:           body.status ?? '신규접수',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
