export const revalidate = 60 // 60초 캐시

import { supabase, calcCLX } from '@/lib/supabase'
import AnalyticsClient from '@/components/AnalyticsClient'

export default async function AnalyticsPage() {
  const { data: reviews = [] } = await supabase.from('reviews').select('review_month, branch, rating, categories').order('review_month', { ascending: false }).range(0, 9999)
  const rv = reviews ?? []

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

  return <AnalyticsClient monthlyRaw={monthlyRaw} catData={catData} />
}
