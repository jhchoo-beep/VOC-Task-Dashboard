import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('churn_trigger_links')
    .select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trigger_name, url, label } = await req.json()
  if (!trigger_name || !url) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const { data, error } = await supabase
    .from('churn_trigger_links')
    .upsert({ trigger_name, url, label: label ?? null }, { onConflict: 'trigger_name' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { trigger_name } = await req.json()
  const { error } = await supabase
    .from('churn_trigger_links')
    .delete()
    .eq('trigger_name', trigger_name)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
