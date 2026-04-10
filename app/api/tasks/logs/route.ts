import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const taskId = new URL(req.url).searchParams.get('taskId')
  if (!taskId) return NextResponse.json({ error: 'taskId 필요' }, { status: 400 })

  const { data, error } = await supabase
    .from('task_logs').select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId, content } = await req.json()
  if (!taskId || !content?.trim()) return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })

  const author = session.user?.name ?? session.user?.email ?? '사용자'

  const { data, error } = await supabase
    .from('task_logs').insert({ task_id: taskId, author, content }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
