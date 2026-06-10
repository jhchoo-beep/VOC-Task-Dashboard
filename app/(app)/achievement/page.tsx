export const revalidate = 60

import { supabase } from '@/lib/supabase'
import AchievementClient from '@/components/AchievementClient'

export default async function AchievementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string }>
}) {
  const { month, branch } = await searchParams

  // 완료된 수행과제 전체 조회 (최근 12개월)
  let query = supabase
    .from('tasks')
    .select('id, branch, task_month, title, churn_trigger, problem_definition, solution, assignee, due_date, status, linked_review_ids, link_url, link_label, done_memo')
    .eq('status', '완료')
    .order('task_month', { ascending: false })

  if (month && month !== 'all') query = query.eq('task_month', month)
  if (branch && branch !== '전체') query = query.eq('branch', branch)

  const { data: tasks = [] } = await query

  // 전체 과제 목록 (월 목록 추출용)
  const { data: allTasks = [] } = await supabase
    .from('tasks')
    .select('task_month, branch')
    .order('task_month', { ascending: false })
    .range(0, 9999)

  const months = [...new Set((allTasks ?? []).map((t: any) => t.task_month).filter(Boolean))].sort().reverse() as string[]
  const branches = [...new Set((allTasks ?? []).map((t: any) => t.branch).filter(Boolean))] as string[]

  // 트리거별 그룹 집계
  const triggerMap: Record<string, any[]> = {}
  for (const t of tasks ?? []) {
    const triggers: string[] = t.churn_trigger ?? []
    if (triggers.length === 0) {
      if (!triggerMap['미분류']) triggerMap['미분류'] = []
      triggerMap['미분류'].push(t)
    } else {
      for (const tr of triggers) {
        if (!triggerMap[tr]) triggerMap[tr] = []
        triggerMap[tr].push(t)
      }
    }
  }

  // 트리거별: 총 완료 건수 내림차순 정렬, 미분류 맨 뒤
  const triggerGroups = Object.entries(triggerMap)
    .map(([trigger, items]) => ({
      trigger,
      tasks: items.sort((a, b) => (b.task_month ?? '').localeCompare(a.task_month ?? '')),
      totalLinkedReviews: items.reduce((s, t) => s + (t.linked_review_ids?.length ?? 0), 0),
      branches: [...new Set(items.map((t: any) => t.branch).filter(Boolean))],
    }))
    .sort((a, b) => {
      if (a.trigger === '미분류') return 1
      if (b.trigger === '미분류') return -1
      return b.tasks.length - a.tasks.length
    })

  // 월별 완료 현황
  const monthSummary: Record<string, { count: number; triggers: Set<string> }> = {}
  for (const t of tasks ?? []) {
    const m = t.task_month
    if (!m) continue
    if (!monthSummary[m]) monthSummary[m] = { count: 0, triggers: new Set() }
    monthSummary[m].count++
    for (const tr of t.churn_trigger ?? []) monthSummary[m].triggers.add(tr)
  }
  const monthSummaryList = Object.entries(monthSummary)
    .map(([m, s]) => ({ month: m, count: s.count, triggerCount: s.triggers.size }))
    .sort((a, b) => b.month.localeCompare(a.month))

  // 상단 통계
  const totalDone = (tasks ?? []).length
  const totalTriggers = new Set((tasks ?? []).flatMap((t: any) => t.churn_trigger ?? [])).size
  const totalBranches = new Set((tasks ?? []).map((t: any) => t.branch).filter(Boolean)).size

  return (
    <AchievementClient
      tasks={tasks ?? []}
      triggerGroups={triggerGroups}
      monthSummaryList={monthSummaryList}
      months={months}
      branches={branches}
      selectedMonth={month ?? 'all'}
      selectedBranch={branch ?? '전체'}
      stats={{ totalDone, totalTriggers, totalBranches }}
    />
  )
}
