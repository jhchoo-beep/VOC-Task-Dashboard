export const revalidate = 60 // 60초 캐시

import { supabase, calcCLX } from '@/lib/supabase'
import ReportClient from '@/components/ReportClient'

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams

  const { data: all = [] } = await supabase.from('reviews').select('review_month').order('review_month', { ascending: false }).range(0, 9999)
  const months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))].sort().reverse() as string[]
  const currentMonth = month ?? months[0] ?? ''

  const { data: reviews = [] } = await supabase.from('reviews').select('*').eq('review_month', currentMonth)
  const rv = reviews ?? []

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

  return <ReportClient metrics={metrics} cci={cci} triggers={triggers} months={months} currentMonth={currentMonth} />
}
