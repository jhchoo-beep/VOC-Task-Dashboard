export const revalidate = 60 // 60초 캐시

import { supabase, calcCLX } from '@/lib/supabase'
import AnalyticsClient from '@/components/AnalyticsClient'

export default async function AnalyticsPage() {
  const [{ data: reviews = [] }, { data: allTasks = [] }] = await Promise.all([
    supabase.from('reviews').select('review_month, branch, rating, categories, severity, churn_triggers').order('review_month', { ascending: false }).range(0, 9999),
    supabase.from('tasks').select('id, churn_trigger, status, task_month').order('task_month', { ascending: false }),
  ])
  const rv = reviews ?? []
  const tasks = allTasks ?? []

  const months  = [...new Set(rv.map((r: any) => r.review_month).filter(Boolean))].sort() as string[]
  const branches = [...new Set(rv.map((r: any) => r.branch).filter(Boolean))] as string[]

  // 월별 CLX
  const monthlyRaw = months.flatMap(month =>
    branches.map(branch => {
      const br = rv.filter((r: any) => r.review_month === month && r.branch === branch)
      if (!br.length) return null
      const total = br.length
      const lp = Math.round(br.filter((r: any) => r.rating >= 9).length / total * 1000) / 10
      const sp = Math.round(br.filter((r: any) => r.rating >= 7 && r.rating < 9).length / total * 1000) / 10
      const ap = Math.round(br.filter((r: any) => r.rating >= 5 && r.rating < 7).length / total * 1000) / 10
      const cp = Math.round(br.filter((r: any) => r.rating < 5).length / total * 1000) / 10
      return { review_month: month, branch, total, loyal_pct: lp, satisfied_pct: sp, at_risk_pct: ap, churned_pct: cp, clx: calcCLX(lp, sp, ap, cp) }
    }).filter(Boolean)
  )

  // 카테고리 집계
  const catMap: Record<string, number> = {}
  rv.forEach((r: any) => (r.categories ?? []).forEach((c: string) => { catMap[c] = (catMap[c] ?? 0) + 1 }))
  const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, cnt]) => ({ category, cnt }))

  // 월별 severity 트렌드
  const severityData = months.map(month => {
    const mr = rv.filter((r: any) => r.review_month === month)
    return {
      month,
      Critical: mr.filter((r: any) => r.severity === 'Critical').length,
      High:     mr.filter((r: any) => r.severity === 'High').length,
      Medium:   mr.filter((r: any) => r.severity === 'Medium').length,
      Low:      mr.filter((r: any) => r.severity === 'Low').length,
    }
  })

  // 트리거별 수행과제 해결률
  const triggerTaskMap: Record<string, { total: number; done: number }> = {}
  for (const t of tasks) {
    for (const tr of t.churn_trigger ?? []) {
      if (!triggerTaskMap[tr]) triggerTaskMap[tr] = { total: 0, done: 0 }
      triggerTaskMap[tr].total++
      if (t.status === '완료') triggerTaskMap[tr].done++
    }
  }
  const triggerResolution = Object.entries(triggerTaskMap)
    .map(([trigger, { total, done }]) => ({
      trigger,
      total,
      done,
      rate: total > 0 ? Math.round(done / total * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // 월별 트리거 발생 건수 (리뷰 기준)
  const taskMonths = [...new Set(tasks.map((t: any) => t.task_month).filter(Boolean))].sort() as string[]
  const allMonths = [...new Set([...months, ...taskMonths])].sort() as string[]

  const triggerNames = [...new Set([
    ...rv.flatMap((r: any) => r.churn_triggers ?? []),
    ...tasks.flatMap((t: any) => t.churn_trigger ?? []),
  ])] as string[]

  const triggerMonthlyData = allMonths.map(month => {
    const entry: Record<string, any> = { month }
    for (const tr of triggerNames) {
      entry[`review_${tr}`] = rv.filter((r: any) => r.review_month === month && (r.churn_triggers ?? []).includes(tr)).length
      entry[`done_${tr}`]   = tasks.filter((t: any) => t.task_month === month && t.status === '완료' && (t.churn_trigger ?? []).includes(tr)).length
    }
    return entry
  })

  return (
    <AnalyticsClient
      monthlyRaw={monthlyRaw}
      catData={catData}
      severityData={severityData}
      triggerResolution={triggerResolution}
      triggerMonthlyData={triggerMonthlyData}
      triggerNames={triggerNames}
    />
  )
}
