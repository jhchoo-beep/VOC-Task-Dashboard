// STAY VOC 2.0 — 리포트·분석용 순수 계산(화면 없음, DB 호출 없음). 기본 계산은 metrics.ts.
// 🔴 vitest 가 '@/' 별칭을 못 풀어 상대 경로 import 만 쓴다.
import { inScope, monthOf, type Rev, type Scope, type Star } from './metrics'

/** 반복 불편: 최근 N개월(기본 3) 안에서 같은 지점의 같은 현상이 서로 다른 리뷰 minReviews 건 이상(2.0 기획 「1.0 과제가 2.0에서 잡히는지」 기준) */
export interface Recurring {
  branch: string
  phenomenon: string
  galaxy: string
  owner: string
  reviews: number
  count: number
  byMonth: number[]   // window 달 순서대로 건수
  monthsHit: number   // 1건 이상 나온 달 수
}

export function recurring(stars: Star[], window: string[], minReviews = 3): Recurring[] {
  const ms = new Set(window)
  const g = new Map<string, { galaxy: string; owner: string; ids: Set<string>; count: number; byMonth: number[] }>()
  for (const s of stars) {
    const m = monthOf(s.date)
    if (!ms.has(m)) continue
    const k = `${s.branch}\u0000${s.phenomenon}`
    const e = g.get(k) ?? { galaxy: s.galaxy, owner: s.owner, ids: new Set<string>(), count: 0, byMonth: window.map(() => 0) }
    e.ids.add(s.reviewId)
    e.count++
    e.byMonth[window.indexOf(m)]++
    g.set(k, e)
  }
  return [...g.entries()]
    .map(([k, e]) => {
      const [branch, phenomenon] = k.split('\u0000')
      return { branch, phenomenon, galaxy: e.galaxy, owner: e.owner, reviews: e.ids.size, count: e.count, byMonth: e.byMonth, monthsHit: e.byMonth.filter(x => x > 0).length }
    })
    .filter(r => r.reviews >= minReviews)
    .sort((a, b) => b.reviews - a.reviews || b.monthsHit - a.monthsHit || a.phenomenon.localeCompare(b.phenomenon, 'ko'))
}

/** 카테고리(은하)별 달 건수 표. 행 = 카테고리(합계 많은 순), 열 = 달 */
export function galaxyByMonth(stars: Star[], scope: Scope, months: string[]) {
  const sc = inScope(stars, scope, months)
  const names = [...new Set(sc.map(s => s.galaxy))]
  const rows = names.map(galaxy => {
    const byMonth = months.map(m => sc.filter(s => s.galaxy === galaxy && monthOf(s.date) === m).length)
    return { galaxy, byMonth, total: byMonth.reduce((a, b) => a + b, 0) }
  })
  return rows.sort((a, b) => b.total - a.total || a.galaxy.localeCompare(b.galaxy, 'ko'))
}

/** 고칠 수 있는 주체별 건수와 비중 */
export function ownerShare(stars: Star[]) {
  const total = stars.length
  const m = new Map<string, number>()
  for (const s of stars) m.set(s.owner || '미정', (m.get(s.owner || '미정') ?? 0) + 1)
  return [...m.entries()].map(([owner, count]) => ({ owner, count, share: total ? Math.round(count / total * 1000) / 10 : 0 }))
    .sort((a, b) => Number(a.owner === '미정') - Number(b.owner === '미정') || b.count - a.count || a.owner.localeCompare(b.owner, 'ko'))
}

/** 주 라벨 목록(오래된 순). 주 라벨이 없는 리뷰는 뺀다 */
export const weeksOf = (revs: Rev[]) => [...new Set(revs.map(r => r.week).filter((w): w is string => !!w))].sort()

/** 주 라벨(끝 월요일) → 시작 화요일 */
export function weekStartOf(label: string) {
  const d = new Date(`${label}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 6)
  return d.toISOString().slice(0, 10)
}

export const inWeek = <T extends { branch: string }>(rows: (T & { week?: string })[], scope: Scope, week: string) =>
  rows.filter(r => (scope === '전체' || r.branch === scope) && r.week === week)

/** 별에는 주 라벨이 없어 리뷰의 주로 붙인다 */
export function starsOfReviews(stars: Star[], revs: Rev[]) {
  const ids = new Set(revs.map(r => r.id))
  return stars.filter(s => ids.has(s.reviewId))
}
