export const revalidate = 60 // 60초 캐시

import { supabase } from '@/lib/supabase'
import TasksClient from '@/components/TasksClient'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; task?: string }>
}) {
  const { month, task } = await searchParams

  const monthsQuery = supabase.from('tasks').select('task_month').order('task_month', { ascending: false })

  let months: string[]
  let currentMonth: string
  let tasks: any[]

  if (month) {
    // month가 URL에 있으면 2개 쿼리 병렬 실행
    const [{ data: allTasks }, { data: tasksData }] = await Promise.all([
      monthsQuery,
      supabase.from('tasks').select('*').eq('task_month', month).order('priority_score', { ascending: false }),
    ])
    months = [...new Set((allTasks ?? []).map((t: any) => t.task_month).filter(Boolean))] as string[]
    currentMonth = month
    tasks = tasksData ?? []
  } else {
    const { data: allTasks = [] } = await monthsQuery
    months = [...new Set((allTasks ?? []).map((t: any) => t.task_month).filter(Boolean))] as string[]
    currentMonth = months[0] ?? ''
    const { data: tasksData = [] } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_month', currentMonth)
      .order('priority_score', { ascending: false })
    tasks = tasksData ?? []
  }

  return <TasksClient tasks={tasks} months={months} currentMonth={currentMonth} highlightTaskId={task ?? null} />
}
