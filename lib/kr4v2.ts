// KR4 STAY VOC 2.0 주간 리포트 — 순수 계산 모듈(화면 없음, DB 호출 없음).
// 원천: voc_review_analysis(LLM이 V2 별 추출 지침으로 읽은 리뷰 = 분모) + voc_stars 중 불편 별(= 분자).
// 불편 지수 = 불편 별 수 ÷ 분석한 리뷰 수 × 100. 점수와 무관하게 세고, 경중 가중치는 없다(STAY VOC 2.0 기획).
// 🔴 분모는 일우님 KR4 주간 점수(kr4_reviews)의 리뷰 수가 아니다. 분자를 센 리뷰와 같은 리뷰여야 목표 50이 성립한다.
// 🔴 vitest 가 '@/' 별칭을 못 풀어 이 파일은 상대 경로 import 만 쓴다.

export const V2_BRANCHES = ['신설', '동대문', '제주시티', '고성'] as const
export const V2_TARGET = 50          // 불편 지수 목표: 50 미만
export const V2_SCORE_TARGET = 9.0   // 결과 목표: 신규 리뷰 평균 9.0
export const V2_FIRST_MONTH = '2026-06'

export interface V2Review {
  review_id: string
  branch: string
  review_date: string     // YYYY-MM-DD
  week_label: string      // 화~월 주의 끝(월요일)
  score10: number | null
  neg_count: number
}
export interface V2NegStar {
  review_id: string
  branch: string
  galaxy: string
  phenomenon: string
  owner: string
}

export interface V2Cell { idx: number | null; n: number; neg: number; avg: number | null }

export const cellOf = (rs: V2Review[]): V2Cell => {
  const n = rs.length
  const neg = rs.reduce((a, r) => a + r.neg_count, 0)
  const sc = rs.filter(r => r.score10 != null)
  return {
    n, neg,
    idx: n ? +(neg / n * 100).toFixed(1) : null,
    avg: sc.length ? +(sc.reduce((a, r) => a + Number(r.score10), 0) / sc.length).toFixed(2) : null,
  }
}

export const monthOf = (d: string) => d.slice(0, 7)

/** 데이터에 있는 주 라벨(오래된 순) */
export const weeksOf = (rs: V2Review[]) => [...new Set(rs.map(r => r.week_label))].sort()

/** V2_FIRST_MONTH 부터 마지막 리뷰의 달까지(오래된 순) */
export function monthsOf(rs: V2Review[]): string[] {
  const last = rs.reduce((a, r) => (r.review_date > a ? r.review_date : a), '')
  if (!last) return []
  const out: string[] = []
  const d = new Date(`${V2_FIRST_MONTH}-01T00:00:00Z`)
  while (d.toISOString().slice(0, 7) <= last.slice(0, 7)) {
    out.push(d.toISOString().slice(0, 7))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

/** 그 주의 시작(화요일) */
export const weekStart = (label: string) => {
  const d = new Date(`${label}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 6)
  return d.toISOString().slice(0, 10)
}

/** 고른 주가 끝나는 날까지의 그 달 누적(주 라벨이 속한 달 기준) */
export const monthToDate = (rs: V2Review[], branch: string, week: string) =>
  rs.filter(r => r.branch === branch && monthOf(r.review_date) === monthOf(week) && r.review_date <= week)

export const inWeek = (rs: V2Review[], branch: string, week: string) =>
  rs.filter(r => r.branch === branch && r.week_label === week)

export const inMonth = (rs: V2Review[], branch: string, month: string) =>
  rs.filter(r => r.branch === branch && monthOf(r.review_date) === month)

export interface TopComplaint { phenomenon: string; galaxy: string; owner: string; count: number; avg: number | null }

/**
 * 가장 많은 불편. 정렬 = 건수 많은 순 → 같은 건수면 그 불편이 나온 리뷰의 평균 점수 낮은 순(11/8 결정) → 이름 순.
 * reviews 는 이미 기간·지점으로 거른 리뷰다.
 */
export function topComplaints(reviews: V2Review[], stars: V2NegStar[], limit = 5): TopComplaint[] {
  const byId = new Map(reviews.map(r => [r.review_id, r]))
  const g = new Map<string, { galaxy: string; owner: string; count: number; ids: Set<string> }>()
  for (const s of stars) {
    if (!byId.has(s.review_id)) continue
    const e = g.get(s.phenomenon) ?? { galaxy: s.galaxy, owner: s.owner, count: 0, ids: new Set<string>() }
    e.count++
    e.ids.add(s.review_id)
    g.set(s.phenomenon, e)
  }
  return [...g.entries()].map(([phenomenon, e]) => {
    const sc = [...e.ids].map(id => byId.get(id)!.score10).filter((x): x is number => x != null).map(Number)
    return { phenomenon, galaxy: e.galaxy, owner: e.owner, count: e.count, avg: sc.length ? +(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2) : null }
  }).sort((a, b) => b.count - a.count || (a.avg ?? 99) - (b.avg ?? 99) || a.phenomenon.localeCompare(b.phenomenon, 'ko'))
    .slice(0, limit)
}

export type V2Tone = 'none' | 'over' | 'ok'
export const v2Tone = (idx: number | null): V2Tone => (idx == null ? 'none' : idx < V2_TARGET ? 'ok' : 'over')
