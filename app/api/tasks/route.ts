import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    branch, task_month, title, severity, churn_trigger,
    problem_definition, solution, category, assignee, due_date,
    priority_score, link_url, link_label, review_content,
  } = body

  if (!title?.trim() || !branch) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const { data, error } = await supabase.from('tasks').insert({
    branch, task_month, title,
    severity: severity ?? 'High',
    churn_trigger: churn_trigger ?? [],
    problem_definition: problem_definition ?? null,
    solution: solution ?? null,
    category: category ?? [],
    assignee: assignee ?? null,
    due_date: due_date || null,
    priority_score: priority_score ?? 0,
    link_url: link_url ?? null,
    link_label: link_label ?? null,
    review_content: review_content ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month  = searchParams.get('month')
  const branch = searchParams.get('branch')

  let q = supabase.from('tasks').select('*')
  if (month)  q = q.eq('task_month', month)
  if (branch) q = q.eq('branch', branch)
  q = q.order('severity').order('priority_score', { ascending: false })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
