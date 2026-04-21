export const revalidate = 60

import { supabase, calcCLX } from '@/lib/supabase'
import DashboardClient from '@/components/DashboardClient'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams

  // 리뷰 + 수행과제 병렬 조회
  const [{ data: reviews = [] }, { data: allTasks = [] }] = await Promise.all([
    supabase.from('reviews').select('*').order('review_month', { ascending: false }),
    supabase.from('tasks').select('branch, status, task_month'),
  ])

  // 리뷰 월 목록 + 수행과제 월 목록 합쳐서 전체 월 목록 생성
  const reviewMonths = (reviews ?? []).map((r: any) => r.review_month).filter(Boolean)
  const taskMonths   = (allTasks ?? []).map((t: any) => t.task_month).filter(Boolean)
  const months = [...new Set([...reviewMonths, ...taskMonths])].sort().reverse() as string[]

  const currentMonth = month ?? months[0] ?? ''
  const prevMonth    = months[months.indexOf(currentMonth) + 1] ?? ''

  // 지점 목록 (리뷰 + 수행과제 모두 포함)
  const reviewBranches = (reviews ?? []).map((r: any) => r.branch).filter(Boolean)
  const taskBranches   = (allTasks ?? []).map((t: any) => t.branch).filter(Boolean)
  const branches = [...new Set([...reviewBranches, ...taskBranches])] as string[]

  // CLX 계산
  function calcBranchMetrics(m: string) {
    return branches.map(branch => {
      const br = (reviews ?? []).filter((r: any) => r.review_month === m && r.branch === branch)
      if (!br.length) return null
      const total = br.length
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
    }).filter(Boolean)
  }

  const latest  = calcBranchMetrics(currentMonth)
  const prev    = calcBranchMetrics(prevMonth)
  const clxData = latest.map((m: any) => {
    const p = prev.find((x: any) => x?.branch === m.branch) as any
    return { ...m, diff: p ? m.clx - p.clx : null }
  }).sort((a: any, b: any) => b.clx - a.clx)

  // Critical/High 미처리
  const sevSort = (a: any, b: any) => (a.severity === 'Critical' ? 0 : 1) - (b.severity === 'Critical' ? 0 : 1)
  const criticals = (reviews ?? []).filter((r: any) =>
    ['Critical', 'High'].includes(r.severity) &&
    r.review_month === currentMonth &&
    !['완료', '문서화완료'].includes(r.status)
  ).sort(sevSort).slice(0, 10)

  // Critical/High 처리완료 (되돌리기용) - 항상 내려보냄
  const completedCriticals = (reviews ?? []).filter((r: any) =>
    ['Critical', 'High'].includes(r.severity) &&
    r.review_month === currentMonth &&
    ['완료', '문서화완료'].includes(r.status)
  ).sort(sevSort).slice(0, 10)

  // 수행과제 진행률 - currentMonth 필터링
  const monthTasks = (allTasks ?? []).filter((t: any) => t.task_month === currentMonth)

  // 수행과제가 있는 지점만 표시 (리뷰 없어도 수행과제 있으면 표시)
  const taskBranchSet = [...new Set(monthTasks.map((t: any) => t.branch).filter(Boolean))] as string[]
  const taskProgress = taskBranchSet.map(branch => {
    const bt = monthTasks.filter((t: any) => t.branch === branch)
    return { branch, total: bt.length, done: bt.filter((t: any) => t.status === '완료').length }
  }).filter(tp => tp.total > 0)

  return (
    <DashboardClient
      clxData={clxData}
      criticals={criticals}
      completedCriticals={completedCriticals}
      taskProgress={taskProgress}
      currentMonth={currentMonth}
      months={months}
    />
  )
}
