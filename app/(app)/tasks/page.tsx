export const revalidate = 60 // 60초 캐시

import { supabase } from '@/lib/supabase'
import TasksClient from '@/components/TasksClient'

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams

  const { data: allTasks = [] } = await supabase.from('tasks').select('task_month').order('task_month', { ascending: false })
  const months = [...new Set((allTasks ?? []).map((t: any) => t.task_month).filter(Boolean))] as string[]
  const currentMonth = month ?? months[0] ?? ''

  const { data: tasks = [] } = await supabase
    .from('tasks').select('*')
    .eq('task_month', currentMonth)
    .order('severity', { ascending: true })
    .order('priority_score', { ascending: false })

  return <TasksClient tasks={tasks ?? []} months={months} currentMonth={currentMonth} />
}
