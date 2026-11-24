// STAY VOC 2.0 OTA 점수 — 화면에 쓰는 계산 조각(순수 함수, 서버·클라이언트 공용).
//
// 🔴 산식은 1.0 lib 를 그대로 부른다. 여기서 다시 짜지 않는다.
//    · 통합 점수 = 10점 환산(5점제 ×2) 뒤 누적 리뷰 수 가중 평균 → lib/otaTrend.branchIntegratedScore(buildTrendRows 안)
//    · Δ = 반올림하지 않은 원값끼리 뺀 값 → lib/otaTrend.fillDeltas(buildTrendRows·rollupMonthly 안). 표시할 때만 자릿수를 줄인다
//    · 목표 = ota_properties.okr_target 를 채널 척도로 → lib/weeklyReport.targetScoreOf (5점제 4.5, 10점제 9.0 폴백)
//    · 주 간격 판정 → lib/otaDetail.isWeeklyGap (14일 간격 = 두 주치 델타라 한 주로 보지 않는다)
//    · 작성률·분포·불만·VOC 원자료 조립 → lib/pageData.getOtaScoresProps (1000행 상한 페이징 포함)
// 아래 group* 은 1.0 화면(components/OtaScoresClient.tsx) 안에 있던 월 묶음을 옮긴 것이다(산식 동일).
import { buildTrendRows, rollupMonthly, weekOfMonthLabel, monthLabel, INTEGRATED, type History, type TrendOtaEntry, type TrendRow } from '../otaTrend'
import { isWeeklyGap } from '../otaDetail'
import { targetScoreOf } from '../weeklyReport'

export { INTEGRATED }
export type { TrendRow }

export const BRANCH_ORDER = ['신설', '동대문', '제주시티', '고성'] as const
export const ALL = '전체'
export const WEEKLY_WINDOW = 12          // 주별 추이에 보이는 스냅샷 수(1.0 종합 추이와 같음)
export const TARGET_INTEGRATED = targetScoreOf(10, null)   // 9.0 — 통합(10점 환산)의 목표

export type TimeMode = 'weekly' | 'monthly'

export interface DistWeek { week: string; scores: number[]; avgScore?: number; granularity?: 'week' | 'month' }
export interface ReviewRateWeek { week: string; reviewCount: number; checkoutCount: number; ratePct: number }
export interface ComplaintWeek { week: string; room: number; bathroom: number }
export interface VocRow { week_start: string; band: string; sentiment: string; keyword: string }

/** getOtaScoresProps() 가 돌려주는 모양 그대로 */
export interface OtaProps {
  recordedAt: string
  scoreHistory: History
  reviewHistory: History
  dateLabels: string[]
  dates: string[]
  snapshotDatesByChannel: Record<string, Record<string, string[]>>
  otaList: TrendOtaEntry[]
  scoreDist: Record<string, Record<string, DistWeek[]>>
  complaints: Record<string, Record<string, ComplaintWeek[]>>
  complaintMemos: Record<string, Record<string, string>>
  voc: Record<string, Record<string, VocRow[]>>
  reviewRate: Record<string, Record<string, ReviewRateWeek[]>>
  scoreMaxByBranchOta: Record<string, Record<string, number>>
  branchOtaToId: Record<string, Record<string, number>>
}

/** 화면에 나오는 지점(1.0 과 같은 규칙: 점수나 분포가 하나라도 있는 지점, 고정 순서) */
export function branchesOf(p: Pick<OtaProps, 'scoreHistory' | 'scoreDist'>): string[] {
  return BRANCH_ORDER.filter(b => b in p.scoreHistory || b in p.scoreDist)
}

/** 한 지점의 채널(1.0 사이드바와 같은 규칙: 점수가 한 번이라도 있는 채널, otaList 순서) */
export function channelsOf(p: Pick<OtaProps, 'otaList' | 'scoreHistory'>, branch: string): string[] {
  return p.otaList.filter(o => (p.scoreHistory[branch]?.[o.name] ?? []).some(v => v > 0)).map(o => o.name)
}

/** 채널 척도(10 또는 5). 통합은 10점 환산이라 10 */
export function scaleOf(p: Pick<OtaProps, 'otaList' | 'scoreMaxByBranchOta'>, branch: string, ota: string): number {
  if (ota === INTEGRATED) return 10
  const m = p.scoreMaxByBranchOta[branch]?.[ota] ?? p.otaList.find(o => o.name === ota)?.max ?? 10
  return m === 5 ? 5 : 10
}

/** 채널 자기 척도의 목표(5점제를 10점으로 올려 판정하지 않는다) */
export function targetOf(p: Pick<OtaProps, 'otaList' | 'scoreMaxByBranchOta'>, branch: string, ota: string): number {
  if (ota === INTEGRATED) return TARGET_INTEGRATED
  return targetScoreOf(scaleOf(p, branch, ota), p.otaList.find(o => o.name === ota)?.okr ?? null)
}

/** 표시 자릿수: 통합·5점제는 소수 둘째 자리(4.82), 10점제 채널은 첫째 자리(8.6) */
export const digitsOf = (scale: number, ota: string) => (ota === INTEGRATED || scale === 5 ? 2 : 1)

export const fmtScore = (v: number | null | undefined, digits: number) => (v == null ? '–' : v.toFixed(digits))

/** Δ 표시. 값은 원값끼리 뺀 것을 받고, 여기서 자릿수만 줄인다. 줄인 결과가 0이면 ±0 */
export function fmtDelta(d: number | null | undefined, digits: number): string {
  if (d == null) return '–'
  const s = Math.abs(d).toFixed(digits)
  if (Number(s) === 0) return `±${(0).toFixed(digits)}`
  return `${d > 0 ? '+' : '−'}${s}`
}

export const deltaTone = (d: number | null | undefined, digits: number): 'up' | 'down' | 'flat' | 'none' => {
  if (d == null) return 'none'
  if (Number(Math.abs(d).toFixed(digits)) === 0) return 'flat'
  return d > 0 ? 'up' : 'down'
}

/** 스냅샷 전체의 추이 행(주별 원본). Δ 는 lib 가 원값으로 채운다 */
export function weeklyRows(p: Pick<OtaProps, 'otaList' | 'scoreHistory' | 'reviewHistory' | 'dates'>, branches: string[], ota: string): TrendRow[] {
  return buildTrendRows(branches, p.otaList, p.scoreHistory, p.reviewHistory, p.dates, ota)
}

/** 그래프에 그릴 행: 주별 = 최근 WEEKLY_WINDOW 개(Δ 는 잘리기 전 전체 기준), 월별 = 월말 스냅샷 */
export function visibleRows(all: TrendRow[], branches: string[], mode: TimeMode): TrendRow[] {
  return mode === 'monthly' ? rollupMonthly(all, branches) : all.slice(-WEEKLY_WINDOW)
}

export interface Now { cur: number | null; delta: number | null; date: string | null }

/** 마지막 스냅샷의 값과 직전 대비 Δ(그 날 값이 없으면 1.0 처럼 비어 있다) */
export function nowOf(rows: TrendRow[], branch: string): Now {
  const last = rows[rows.length - 1]
  if (!last) return { cur: null, delta: null, date: null }
  return { cur: last.values[branch] ?? null, delta: last.deltas[branch] ?? null, date: last.dateIso }
}

export interface ChannelNow extends Now {
  branch: string
  ota: string
  scale: number
  target: number
  digits: number
  met: boolean | null          // 목표 이상인가(점수가 없으면 null)
  reviews: number              // 마지막 스냅샷의 누적 리뷰 수
  newReviews: number | null    // 마지막 스냅샷의 주간 신규 리뷰(누적 차이, 한 주 간격일 때만)
  propertyId: number | null
}

export function channelNow(p: OtaProps, rows: TrendRow[], branch: string, ota: string): ChannelNow {
  const scale = scaleOf(p, branch, ota)
  const target = targetOf(p, branch, ota)
  const n = nowOf(rows, branch)
  const rh = p.reviewHistory[branch]?.[ota] ?? []
  const nr = newReviewSeries(rh, p.dates, 'weekly', p.dates.length)
  return {
    ...n, branch, ota, scale, target, digits: digitsOf(scale, ota),
    met: n.cur == null ? null : n.cur >= target,
    reviews: rh[rh.length - 1] ?? 0,
    newReviews: nr[nr.length - 1]?.n ?? null,
    propertyId: p.branchOtaToId[branch]?.[ota] ?? null,
  }
}

export interface NewReviewPoint { dateIso: string; label: string; n: number | null }

/**
 * 신규 리뷰 수 = 누적 리뷰 수의 증가분(1.0 기본 추이와 같은 산식: 앞뒤 값이 다 있어야 하고 음수는 0).
 * 주별은 두 스냅샷이 한 주 간격일 때만 낸다(14일 간격 = 두 주치라 한 주 막대로 그리지 않는다).
 * 월별은 월말 누적끼리 뺀다.
 */
export function newReviewSeries(hist: number[], dates: string[], mode: TimeMode, window = WEEKLY_WINDOW): NewReviewPoint[] {
  if (mode === 'monthly') {
    const ends = new Map<string, number>()
    dates.forEach((d, i) => ends.set(d.substring(0, 7), i))   // 뒤 스냅샷이 덮어씀 = 월 마지막
    const idx = [...ends.values()]
    return idx.map((i, k) => {
      const cur = hist[i] ?? 0
      const prev = k > 0 ? hist[idx[k - 1]] ?? 0 : 0
      return { dateIso: dates[i], label: monthLabel(dates[i]), n: cur > 0 && prev > 0 ? Math.max(0, cur - prev) : null }
    })
  }
  const out = dates.map((d, i) => {
    const cur = hist[i] ?? 0
    const prev = i > 0 ? hist[i - 1] ?? 0 : 0
    const ok = i > 0 && cur > 0 && prev > 0 && isWeeklyGap(dates[i - 1], d)
    return { dateIso: d, label: weekOfMonthLabel(d), n: ok ? Math.max(0, cur - prev) : null }
  })
  return out.slice(-window)
}

// ── 1.0 화면에서 옮긴 월 묶음(산식 그대로) ─────────────────────────────
// week 문자열은 pageData 가 'MM/DD' 로 만든다 → 앞 두 글자가 월.
const weekMonth = (week: string) => week.substring(0, 2)

export function groupDistByMonth(rows: DistWeek[]): DistWeek[] {
  const map = new Map<string, { scores: number[]; totalReviews: number; weightedSum: number }>()
  rows.forEach(({ week, scores, avgScore }) => {
    const m = weekMonth(week)
    // 밴드 수는 척도(10점/5점)에 따라 다르므로 행의 길이를 그대로 따른다
    if (!map.has(m)) map.set(m, { scores: new Array(scores.length).fill(0), totalReviews: 0, weightedSum: 0 })
    const acc = map.get(m)!
    scores.forEach((v, i) => { acc.scores[i] += v })
    const cnt = scores.reduce((s, v) => s + v, 0)
    if (avgScore && avgScore > 0 && cnt > 0) { acc.totalReviews += cnt; acc.weightedSum += avgScore * cnt }
  })
  return [...map.entries()].map(([m, { scores, totalReviews, weightedSum }]) => ({
    week: `${parseInt(m)}월`, scores,
    avgScore: totalReviews > 0 ? Math.round(weightedSum / totalReviews * 10) / 10 : undefined,
  }))
}

export function groupComplaintsByMonth(rows: ComplaintWeek[]): ComplaintWeek[] {
  const map = new Map<string, { room: number; bathroom: number }>()
  rows.forEach(({ week, room, bathroom }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { room: 0, bathroom: 0 })
    const acc = map.get(m)!; acc.room += room; acc.bathroom += bathroom
  })
  return [...map.entries()].map(([m, v]) => ({ week: `${parseInt(m)}월`, ...v }))
}

export function groupReviewRateByMonth(rows: ReviewRateWeek[]): ReviewRateWeek[] {
  const map = new Map<string, { reviewCount: number; checkoutCount: number }>()
  rows.forEach(({ week, reviewCount, checkoutCount }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { reviewCount: 0, checkoutCount: 0 })
    const acc = map.get(m)!; acc.reviewCount += reviewCount; acc.checkoutCount += checkoutCount
  })
  return [...map.entries()].map(([m, { reviewCount, checkoutCount }]) => ({
    week: `${parseInt(m)}월`, reviewCount, checkoutCount,
    ratePct: checkoutCount > 0 ? Math.round(reviewCount / checkoutCount * 1000) / 10 : 0,
  }))
}

/** scores[i] = 밴드 i(score_{i+1}) 건수, 대표값 i+1점. 쓰기 API(/api/ota/score-dist)와 같은 규약 */
export function calcWeekAvg(scores: number[]): number {
  let total = 0, count = 0
  scores.forEach((cnt, i) => { total += cnt * (i + 1); count += cnt })
  return count > 0 ? Math.round(total / count * 10) / 10 : 0
}

// reviews.ota_site 는 한글명, ota_properties.ota_name 은 영문명(1.0 드릴다운과 같은 대응표)
export const OTA_SITE_ALIAS: Record<string, string[]> = {
  Agoda: ['아고다'], Booking: ['부킹닷컴'], 'Trip.com': ['트립닷컴'],
  Expedia: ['익스피디아'], Airbnb: ['에어비앤비'], 여기어때: ['여기어때'], NOL: ['NOL', '야놀자'],
}
export const siteAliases = (ota: string) => OTA_SITE_ALIAS[ota] ?? [ota]

// 10점 척도 VOC 밴드 라벨은 기존 ota_voc 데이터와 맞춘다. 5점 척도는 1~5점 그대로(10점 환산 안 함)
export const VOC_BANDS_10 = ['10점', '9점대', '8점대', '7점대', '6점대 이하']
