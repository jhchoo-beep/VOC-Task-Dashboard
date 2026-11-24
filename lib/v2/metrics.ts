// STAY VOC 2.0 — 순수 계산 모듈(화면 없음, DB 호출 없음).
// 원천: voc_review_analysis(LLM이 읽은 리뷰 = 분모) + voc_stars 중 불편 별(= 분자).
// 불편 지수 = 불편 건수 합 ÷ 분석한 리뷰 수 × 100. 점수와 무관하게 세고 경중 가중치는 없다(11/24 Ongoing 승인 기획).
// 저점 칭찬 지수 = 9점 미만이면서 글에 칭찬만 있는(불편 0, 칭찬 1 이상) 리뷰 수 ÷ 분석한 리뷰 수 × 100. 낮을수록 좋다.
// 🔴 vitest 가 '@/' 별칭을 못 풀어 이 파일은 상대 경로 import 만 쓴다.

export const BRANCHES = ['신설', '동대문', '제주시티', '고성'] as const
export type Branch = (typeof BRANCHES)[number]
export const ALL = '전체'
export type Scope = Branch | typeof ALL

export const TARGET_INDEX = 50      // 불편 지수 목표: 50 미만
export const TARGET_SCORE = 9.0     // 결과 목표: 신규 리뷰 평균 9.0
export const LOW_SCORE = 9          // 저점 칭찬: 이 점수 미만
export const FIRST_MONTH = '2026-06'
export const QUARTERLY: ReadonlySet<string> = new Set(['고성'])   // 리뷰가 적어 분기로 본다

export interface Rev {
  id: string
  branch: string
  channel: string
  date: string          // YYYY-MM-DD
  week?: string         // 주 라벨 = 화~월 주의 끝 월요일(voc_review_analysis.week_label)
  score: number | null  // 10점 환산
  hasText: boolean
  neg: number
  pos: number
}
export interface Star {
  id: string
  reviewId: string
  branch: string
  channel: string
  date: string
  galaxy: string
  phenomenon: string
  owner: string
  quote: string
}

export const monthOf = (d: string) => d.slice(0, 7)
export const isLowPraise = (r: Rev) => r.hasText && r.score != null && r.score < LOW_SCORE && r.neg === 0 && r.pos > 0

/** 분기 키(2026-Q4)와 그 분기의 달 3개 */
export const quarterOf = (month: string) => `${month.slice(0, 4)}-Q${Math.floor((+month.slice(5, 7) - 1) / 3) + 1}`
export function monthsOfQuarter(q: string): string[] {
  const y = q.slice(0, 4), n = +q.slice(6)
  return [1, 2, 3].map(i => `${y}-${String((n - 1) * 3 + i).padStart(2, '0')}`)
}

/** 지점이 그 달을 볼 때 실제로 묶는 달들(고성은 분기) */
export const periodMonths = (scope: Scope, month: string) =>
  QUARTERLY.has(scope) ? monthsOfQuarter(quarterOf(month)) : [month]

export const periodLabel = (scope: Scope, month: string) =>
  QUARTERLY.has(scope) ? `${quarterOf(month).slice(6)}분기` : `${+month.slice(5, 7)}월`

/** FIRST_MONTH 부터 마지막 리뷰의 달까지(오래된 순) */
export function monthsOf(revs: Rev[]): string[] {
  const last = revs.reduce((a, r) => (r.date > a ? r.date : a), '')
  if (!last) return []
  const out: string[] = []
  const d = new Date(`${FIRST_MONTH}-01T00:00:00Z`)
  while (d.toISOString().slice(0, 7) <= last.slice(0, 7)) {
    out.push(d.toISOString().slice(0, 7))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

export function inScope<T extends { branch: string; date: string }>(rows: T[], scope: Scope, months: string[]): T[] {
  const ms = new Set(months)
  return rows.filter(r => (scope === ALL || r.branch === scope) && ms.has(monthOf(r.date)))
}

export interface Cell {
  n: number            // 분석한 리뷰
  neg: number          // 불편 건수
  idx: number | null   // 불편 지수
  avg: number | null   // 신규 리뷰 평균
  negReviews: number   // 불편이 하나라도 있는 리뷰
  low: number          // 저점 칭찬 리뷰
  lowIdx: number | null
}

const r1 = (x: number) => Math.round(x * 10) / 10
const r2 = (x: number) => Math.round(x * 100) / 100

export function cellOf(revs: Rev[]): Cell {
  const n = revs.length
  const neg = revs.reduce((a, r) => a + r.neg, 0)
  const sc = revs.filter(r => r.score != null)
  const low = revs.filter(isLowPraise).length
  return {
    n, neg, low,
    negReviews: revs.filter(r => r.neg > 0).length,
    idx: n ? r1(neg / n * 100) : null,
    avg: sc.length ? r2(sc.reduce((a, r) => a + (r.score as number), 0) / sc.length) : null,
    lowIdx: n ? r1(low / n * 100) : null,
  }
}

export type Tone = 'none' | 'over' | 'ok'
export const toneOf = (idx: number | null): Tone => (idx == null ? 'none' : idx < TARGET_INDEX ? 'ok' : 'over')
export const scoreTone = (avg: number | null): Tone => (avg == null ? 'none' : avg >= TARGET_SCORE ? 'ok' : 'over')

/** 지점별 달마다 값(오래된 순). 고성도 달 단위 값을 낸다(막대용) */
export const monthlySeries = (revs: Rev[], scope: Scope, months: string[]) =>
  months.map(m => ({ month: m, ...cellOf(inScope(revs, scope, [m])) }))

export interface Rank {
  phenomenon: string
  galaxy: string
  owner: string
  count: number          // 불편 건수
  reviews: number        // 그 불편이 나온 리뷰 수
  avg: number | null     // 그 리뷰들의 평균 점수
  contrib: number        // 불편 지수에 더한 몫 = 건수 ÷ 분석한 리뷰 × 100
  branches: string[]
}

/**
 * 불편 순위. 정렬 = 건수 많은 순 → 같은 건수면 그 불편이 나온 리뷰 평균 점수 낮은 순(11/8 결정) → 이름 순.
 * revs, stars 는 이미 같은 기간·지점으로 거른 값이다. 분모는 revs 전체.
 */
export function rankComplaints(revs: Rev[], stars: Star[]): Rank[] {
  const byId = new Map(revs.map(r => [r.id, r]))
  const n = revs.length
  const g = new Map<string, { galaxy: string; owner: string; count: number; ids: Set<string>; br: Set<string> }>()
  for (const s of stars) {
    if (!byId.has(s.reviewId)) continue
    const e = g.get(s.phenomenon) ?? { galaxy: s.galaxy, owner: s.owner, count: 0, ids: new Set<string>(), br: new Set<string>() }
    e.count++
    e.ids.add(s.reviewId)
    e.br.add(s.branch)
    g.set(s.phenomenon, e)
  }
  return [...g.entries()].map(([phenomenon, e]) => {
    const sc = [...e.ids].map(id => byId.get(id)!.score).filter((x): x is number => x != null)
    return {
      phenomenon, galaxy: e.galaxy, owner: e.owner, count: e.count, reviews: e.ids.size,
      avg: sc.length ? r2(sc.reduce((a, b) => a + b, 0) / sc.length) : null,
      contrib: n ? r1(e.count / n * 100) : 0,
      branches: BRANCHES.filter(b => e.br.has(b)),
    }
  }).sort((a, b) => b.count - a.count || (a.avg ?? 99) - (b.avg ?? 99) || a.phenomenon.localeCompare(b.phenomenon, 'ko'))
}

/** 이 불편이 없었다면의 불편 지수 */
export const indexWithout = (c: Cell, count: number) => (c.n ? r1((c.neg - count) / c.n * 100) : null)

/** 그 불편의 달별 건수(오래된 순) */
export function phenomenonSeries(stars: Star[], phenomenon: string, scope: Scope, months: string[]) {
  return months.map(m => ({ month: m, count: inScope(stars, scope, [m]).filter(s => s.phenomenon === phenomenon).length }))
}
