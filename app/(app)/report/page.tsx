import { supabase, calcCLX } from '@/lib/supabase'
import ReportClient from '@/components/ReportClient'

// 🔴 unstable_cache로 감싸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
const getReportPageData = async (month?: string) => {
  const monthsQuery = supabase.from('reviews').select('review_month').order('review_month', { ascending: false }).range(0, 9999)

  let months: string[]
  let currentMonth: string
  let rv: any[]

  if (month) {
    // month가 URL에 있으면 병렬 실행
    const [{ data: all }, { data: reviews }] = await Promise.all([
      monthsQuery,
      supabase.from('reviews').select('branch, rating, severity, categories, churn_triggers').eq('review_month', month),
    ])
    months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))].sort().reverse() as string[]
    currentMonth = month
    rv = reviews ?? []
  } else {
    const { data: all = [] } = await monthsQuery
    months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))].sort().reverse() as string[]
    currentMonth = months[0] ?? ''
    const { data: reviews = [] } = await supabase
      .from('reviews')
      .select('branch, rating, severity, categories, churn_triggers')
      .eq('review_month', currentMonth)
    rv = reviews ?? []
  }

  const branches = [...new Set(rv.map((r: any) => r.branch).filter(Boolean))] as string[]

  const metrics = branches.map(branch => {
    const br = rv.filter((r: any) => r.branch === branch)
    const total = br.length
    if (!total) return null
    const lp = Math.round(br.filter((r: any) => r.rating >= 9).length / total * 1000) / 10
    const sp = Math.round(br.filter((r: any) => r.rating >= 7 && r.rating < 9).length / total * 1000) / 10
    const ap = Math.round(br.filter((r: any) => r.rating >= 5 && r.rating < 7).length / total * 1000) / 10
    const cp = Math.round(br.filter((r: any) => r.rating < 5).length / total * 1000) / 10
    return {
      branch, total,
      avg_rating: Math.round(br.reduce((s: number, r: any) => s + r.rating, 0) / total * 100) / 100,
      loyal_pct: lp, satisfied_pct: sp, at_risk_pct: ap, churned_pct: cp,
      clx: calcCLX(lp, sp, ap, cp),
    }
  }).filter(Boolean).sort((a: any, b: any) => b.clx - a.clx)

  // CCI
  const catMap: Record<string, { cnt: number; sevTotal: number }> = {}
  rv.filter((r: any) => r.rating < 7).forEach((r: any) => {
    const sev = r.severity === 'Critical' ? 4 : r.severity === 'High' ? 3 : r.severity === 'Medium' ? 2 : 1
    ;(r.categories ?? []).forEach((c: string) => {
      if (!catMap[c]) catMap[c] = { cnt: 0, sevTotal: 0 }
      catMap[c].cnt++; catMap[c].sevTotal += sev
    })
  })
  const cci = Object.entries(catMap)
    .map(([category, { cnt, sevTotal }]) => ({ category, cnt, avg_severity: Math.round(sevTotal / cnt * 10) / 10 }))
    .sort((a, b) => (b.cnt * b.avg_severity) - (a.cnt * a.avg_severity)).slice(0, 5)

  // 변심 트리거
  const trigMap: Record<string, { cnt: number; rTotal: number }> = {}
  rv.forEach((r: any) => {
    ;(r.churn_triggers ?? []).forEach((t: string) => {
      if (!trigMap[t]) trigMap[t] = { cnt: 0, rTotal: 0 }
      trigMap[t].cnt++; trigMap[t].rTotal += r.rating
    })
  })
  const triggers = Object.entries(trigMap)
    .map(([trigger, { cnt, rTotal }]) => ({ trigger, cnt, avg_rating: Math.round(rTotal / cnt * 100) / 100 }))
    .sort((a, b) => b.cnt - a.cnt)

  // 이번 달 완료 수행과제 조회
  const { data: completedTasksRaw = [] } = await supabase
    .from('tasks')
    .select('id, title, churn_trigger, problem_definition, solution, assignee, branch, status, task_month')
    .eq('task_month', currentMonth)
    .eq('status', '완료')

  // 트리거별 완료 과제 그룹
  const completedByTrigger: Record<string, any[]> = {}
  for (const t of completedTasksRaw ?? []) {
    const triggers_t: string[] = t.churn_trigger ?? []
    if (triggers_t.length === 0) {
      if (!completedByTrigger['미분류']) completedByTrigger['미분류'] = []
      completedByTrigger['미분류'].push(t)
    } else {
      for (const tr of triggers_t) {
        if (!completedByTrigger[tr]) completedByTrigger[tr] = []
        completedByTrigger[tr].push(t)
      }
    }
  }
  const completedTriggerGroups = Object.entries(completedByTrigger)
    .map(([trigger, tasks]) => ({ trigger, tasks }))
    .sort((a, b) => {
      if (a.trigger === '미분류') return 1
      if (b.trigger === '미분류') return -1
      return b.tasks.length - a.tasks.length
    })

  return { metrics, cci, triggers, months, currentMonth, completedTriggerGroups, completedTaskCount: (completedTasksRaw ?? []).length }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const { metrics, cci, triggers, months, currentMonth, completedTriggerGroups, completedTaskCount } = await getReportPageData(month)

  return (
    <ReportClient
      metrics={metrics}
      cci={cci}
      triggers={triggers}
      months={months}
      currentMonth={currentMonth}
      completedTriggerGroups={completedTriggerGroups}
      completedTaskCount={completedTaskCount}
    />
  )
}
