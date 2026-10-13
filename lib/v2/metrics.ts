/**
 * V2 지표 화면 — 조립된 우주(계약 JSON) + DB 행 → 지표 6장·은하 9칸·추이·패널 목록
 * ────────────────────────────────────────────────────────────────
 * 🔴 새 정의를 만들지 않는다. 값은 전부 이미 있는 함수로 낸다.
 *    북극성        northStarFromMetrics (compute-metrics.ts aggregate 와 같은 합산) — 월별 막대도 같은 함수를 달마다 부른다
 *    핵심 3개      coreFrom (build-universe 와 같은 정의) — 지점 값은 그 지점 별자리만 넘긴다
 *    VOC 비율      voiceRatioFromMetrics + voiceRatioSummary — 주별 막대는 같은 채널 주 행(inputs.weeks)을 주마다 더한다
 *    OTA 평점      채널 값 = otaRatingFrom(기준일 이전 최신 스냅샷), 지점 값 = lib/otaTrend.branchIntegratedScore
 *                  (V1 종합 현황의 지점 통합 점수: 10점 환산 · 누적 리뷰 수 가중 평균)
 * 🔴 시계열이 없는 지표(구조 해결 수, 재발률, 성과 유지율 — 별자리 상태 스냅샷)는 막대를 만들지 않는다(series 없음).
 * 🔴 지점 필터는 6장·은하 9칸·보조 줄 전부에 적용된다(scopes[전체|지점]).
 * ────────────────────────────────────────────────────────────────
 */
import {
  GALAXIES, coreFrom, northStarFromMetrics, voiceRatioFromMetrics, voiceRatioSummary, checkoutSourceOf, otaRatingFrom,
  type DbSnapshot, type Universe, type MetricRow, type ScoreRow, type PropertyRow, type OtaRating,
} from './universeFromDb'
import { branchIntegratedScore, normalizeTo10 } from '../otaTrend'

export const ALL = '전체'
/** OTA 평점 보조 줄 「9.0 미만 채널 수」의 기준(10점 환산). 5점 만점 채널은 4.5 와 같다. */
export const OTA_LINE = 9.0

export interface Bar { label: string; value: number | null; weeks?: number }

export interface ScopeMetrics {
  north: {
    value: number | null
    checkouts: number
    est_neg: number | null
    text_reviews: number
    neg_reviews: number
    reviews_delta: number
    channels: number
    period: { from: string; to: string; weeks: number } | null
    series: Bar[]                 // 월별
    by_channel: { branch: string; channel: string; texts: number; neg: number; delta: number; checkouts: number }[]
    /** 이 범위의 북극성에 들어간 지점 / 체크아웃 데이터가 없어 빠진 지점(전체 = 체크아웃 있는 지점만으로 계산) */
    included: string[]
    excluded: string[]
  }
  solved: { value: number; observing: number; ids: string[]; observing_ids: string[] }
  relapse: { num: number; den: number; ids: string[]; relapsed_ids: string[] }
  keep: { num: number; den: number; ids: string[]; kept_ids: string[] }
  ota: { value: number | null; below: number; channels: OtaRating[]; series: Bar[] }  // 주별
  voc: {
    ratio: number | null; reviews: number; checkouts: number
    series: (Bar & { reviews: number; checkouts: number })[]  // 주별
    by_channel: { branch: string; channel: string; ratio: number | null; reviews: number; checkouts: number; weeks: number }[]
  }
  galaxies: { name: string; neg: number; pos: number; neg_constellations: number }[]
}

export interface MetricsView {
  as_of: string
  last_week: string | null       // 데이터 마지막 주 라벨(월요일, 화~월 구간의 끝)
  checkout_source: string | null // 북극성 체크아웃 출처(wings | ota_channel_checkouts)
  branches: string[]
  scopes: Record<string, ScopeMetrics>
  // 패널용(우주 화면과 같은 칸)
  constellations: {
    id: string; branch: string; galaxy: string; name: string; polarity: 'neg' | 'pos'; status: string
    star_ids: string[]; first_date: string; last_date: string; recent_4w: number; relapse_count: number
    observation_start: string | null; summary: string; owner: string; channels: Record<string, number>
    task: { title: string; status: string } | null
  }[]
  stars: Universe['stars']
  reviews: Universe['reviews']
}

const round = (v: number, d: number) => { const k = 10 ** d; return Math.round(v * k) / k }
const num = (v: unknown) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0 }

/** 채널 주 행을 (지점|채널)마다 주 라벨로 모은다 — channelAggregates 와 같은 중복 제거(같은 주는 뒤 행이 덮음). */
function weekRows(rows: MetricRow[]) {
  const by = new Map<string, Map<string, { reviews: number; checkouts: number }>>()
  for (const r of rows) {
    if (r.channel === ALL || !r.inputs || typeof r.inputs.text_reviews !== 'number') continue
    const k = `${r.branch}|${r.channel}`
    if (!by.has(k)) by.set(k, new Map())
    for (const w of r.inputs.weeks ?? []) by.get(k)!.set(w.week, { reviews: num(w.reviews), checkouts: num(w.checkouts) })
  }
  return by
}

/** VOC 비율 주별 막대 — 그 주에 체크아웃이 있는 채널의 리뷰 증가분 합 ÷ 체크아웃 합(voiceRatioSummary 와 같은 합산을 주마다). */
export function vocWeekly(rows: MetricRow[], branch: string | null) {
  const acc = new Map<string, { reviews: number; checkouts: number }>()
  for (const [k, weeks] of weekRows(rows)) {
    if (branch && !k.startsWith(`${branch}|`)) continue
    for (const [wk, v] of weeks) {
      const a = acc.get(wk) ?? { reviews: 0, checkouts: 0 }
      a.reviews += v.reviews; a.checkouts += v.checkouts
      acc.set(wk, a)
    }
  }
  return [...acc.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([label, v]) => ({ label, reviews: v.reviews, checkouts: v.checkouts, value: v.checkouts ? round(v.reviews / v.checkouts, 4) : null }))
}

/** 북극성 월별 막대 — 그 달 채널 행만 넘겨 northStarFromMetrics 를 그대로 부른다. */
export function northMonthly(rows: MetricRow[], properties: PropertyRow[], branches: string[], branch: string | null): Bar[] {
  const months = [...new Set(rows.filter(r => r.channel !== ALL).map(r => r.month))].sort()
  return months.map(m => {
    const ns = northStarFromMetrics(rows.filter(r => r.month === m), properties, { branches, checkoutSource: null })
    const v = branch ? ns.by_branch[branch]?.value ?? null : ns.value
    const ws = (branch ? [branch] : branches).map(b => ns.by_branch[b]?.period.weeks ?? 0)
    return { label: m, value: v, weeks: Math.max(0, ...ws) }
  })
}

/** OTA 평점 한 숫자 — V1 지점 통합 점수(branchIntegratedScore)와 같은 계산. */
export function otaIntegrated(ratings: OtaRating[]): number | null {
  const list = ratings.filter(r => r.score != null).map(r => ({ name: `${r.branch}|${r.channel}`, max: r.scale, okr: 0 }))
  const scores: Record<string, number[]> = {}
  const reviews: Record<string, number[]> = {}
  for (const r of ratings) {
    if (r.score == null) continue
    scores[`${r.branch}|${r.channel}`] = [r.score]
    reviews[`${r.branch}|${r.channel}`] = [r.review_count ?? 0]
  }
  const v = branchIntegratedScore(list, scores, reviews, 0)
  return v == null ? null : v
}

/** OTA 평점 주별 막대 — 스냅샷 날짜마다 그 날 이전 최신 스냅샷으로 같은 통합 점수. 기간 첫날 이후 날짜만. */
export function otaWeekly(properties: PropertyRow[], scores: ScoreRow[], branches: string[], from: string, asOf: string): Bar[] {
  const ids = new Set(properties.filter(p => branches.includes(p.branch) && p.active).map(p => p.property_id))
  const dates = [...new Set(scores.filter(s => ids.has(s.property_id) && s.recorded_at > from && s.recorded_at <= asOf).map(s => s.recorded_at))].sort()
  return dates.map(d => {
    const v = otaIntegrated(otaRatingFrom(properties, scores, branches, d))
    return { label: d, value: v == null ? null : round(v, 4) }
  })
}

export function buildMetricsView(u: Universe, db: DbSnapshot): MetricsView {
  const branches = u.meta.branches
  const ratings = u.guardrails.ota_rating
  const checkoutSource = checkoutSourceOf(db.metrics, db.properties, db.channelCheckouts)
  const vrAll = voiceRatioFromMetrics(db.metrics, db.properties)
  const vrSum = voiceRatioSummary(vrAll, branches)
  const lastWeek = db.metrics.flatMap(r => (r.channel === ALL ? [] : (r.inputs?.weeks ?? []).map(w => w.week))).sort().pop() ?? null

  const scope = (branch: string | null): ScopeMetrics => {
    const inB = <T extends { branch: string }>(x: T) => !branch || x.branch === branch
    // 북극성
    const ns = northStarFromMetrics(db.metrics, db.properties, { branches, checkoutSource })
    const nb = branch ? ns.by_branch[branch] ?? null : (ns.value != null && ns.inputs ? { value: ns.value, ...ns.inputs } : null)
    const nsPeriod = branch ? ns.by_branch[branch]?.period ?? null : (() => {
      const ps = branches.map(b => ns.by_branch[b]?.period).filter((p): p is { from: string; to: string; weeks: number } => !!p)
      if (!ps.length) return null
      return { from: ps.map(p => p.from).sort()[0], to: ps.map(p => p.to).sort().pop()!, weeks: Math.max(...ps.map(p => p.weeks)) }
    })()
    const byCh = new Map<string, { branch: string; channel: string; texts: number; neg: number; delta: number; checkouts: number }>()
    for (const r of db.metrics) {
      if (r.channel === ALL || !r.inputs || typeof r.inputs.text_reviews !== 'number' || !inB(r)) continue
      const k = `${r.branch}|${r.channel}`
      const a = byCh.get(k) ?? { branch: r.branch, channel: r.channel, texts: 0, neg: 0, delta: 0, checkouts: 0 }
      a.texts += num(r.inputs.text_reviews); a.neg += num(r.inputs.text_reviews_with_neg_star)
      a.delta += num(r.inputs.channel_reviews_delta); a.checkouts += num(r.inputs.channel_checkouts)
      byCh.set(k, a)
    }
    const order = new Map(db.properties.map(p => [`${p.branch}|${p.ota_name}`, p.property_id]))
    const byChannel = [...byCh.values()].sort((a, b) => (order.get(`${a.branch}|${a.channel}`) ?? 1e9) - (order.get(`${b.branch}|${b.channel}`) ?? 1e9))

    // 핵심(별자리 상태)
    const cons = u.constellations.filter(inB)
    const core = coreFrom(cons)
    const formed = cons.filter(c => c.status !== '씨앗')
    const negC = formed.filter(c => c.polarity === 'neg')
    const posC = formed.filter(c => c.polarity === 'pos')
    const observed = negC.filter(c => c.observation_start)

    // OTA
    const rs = ratings.filter(inB)
    const otaV = otaIntegrated(rs)

    // VOC 비율
    const vs = branch ? vrSum[branch] : vrSum[ALL]

    // 은하
    const stars = u.stars.filter(inB)
    const galaxies = GALAXIES.map(name => ({
      name,
      neg: stars.filter(s => s.galaxy === name && s.polarity === 'neg').length,
      pos: stars.filter(s => s.galaxy === name && s.polarity === 'pos').length,
      neg_constellations: negC.filter(c => c.galaxy === name).length,
    }))

    return {
      north: {
        value: nb ? nb.value : null,
        checkouts: nb ? nb.channel_checkouts : 0,
        est_neg: nb ? nb.est_neg_stays : null,
        text_reviews: nb ? nb.text_reviews : 0,
        neg_reviews: nb ? nb.text_reviews_with_neg_star : 0,
        reviews_delta: nb ? nb.channel_reviews_delta : 0,
        channels: branch ? ns.by_branch[branch]?.channels ?? 0 : branches.reduce((s, b) => s + (ns.by_branch[b]?.channels ?? 0), 0),
        period: nsPeriod,
        series: northMonthly(db.metrics, db.properties, branches, branch),
        by_channel: byChannel,
        included: (branch ? [branch] : branches).filter(b => ns.by_branch[b]),
        excluded: (branch ? [branch] : branches).filter(b => !ns.by_branch[b]),
      },
      solved: {
        value: core.structural_solved,
        observing: negC.filter(c => c.status === '관찰').length,
        ids: negC.filter(c => c.status === '성운').map(c => c.id),
        observing_ids: negC.filter(c => c.status === '관찰').map(c => c.id),
      },
      relapse: {
        num: core.relapse_rate.num, den: core.relapse_rate.den,
        ids: observed.map(c => c.id), relapsed_ids: observed.filter(c => c.relapse_count > 0).map(c => c.id),
      },
      keep: {
        num: core.keep_rate.num, den: core.keep_rate.den,
        ids: posC.map(c => c.id), kept_ids: posC.filter(c => c.status === '유지').map(c => c.id),
      },
      ota: {
        value: otaV == null ? null : round(otaV, 4),
        below: rs.filter(r => r.score != null && normalizeTo10(r.score, r.scale) < OTA_LINE).length,
        channels: rs,
        series: otaWeekly(db.properties, db.scores, branch ? [branch] : branches, u.meta.period.from, u.meta.as_of),
      },
      voc: {
        ratio: vs ? vs.ratio : null, reviews: vs ? vs.reviews : 0, checkouts: vs ? vs.checkouts : 0,
        series: vocWeekly(db.metrics, branch),
        by_channel: vrAll.filter(inB).map(v => ({ branch: v.branch, channel: v.channel, ratio: v.ratio, reviews: v.reviews, checkouts: v.checkouts, weeks: v.weeks })),
      },
      galaxies,
    }
  }

  const scopes: Record<string, ScopeMetrics> = { [ALL]: scope(null) }
  for (const b of branches) scopes[b] = scope(b)

  return {
    as_of: u.meta.as_of,
    last_week: lastWeek,
    checkout_source: checkoutSource,
    branches,
    scopes,
    constellations: u.constellations.map(c => ({
      id: c.id, branch: c.branch, galaxy: c.galaxy, name: c.name, polarity: c.polarity, status: c.status,
      star_ids: c.star_ids, first_date: c.first_date, last_date: c.last_date, recent_4w: c.recent_4w,
      relapse_count: c.relapse_count, observation_start: c.observation_start, summary: c.summary, owner: c.owner,
      channels: c.channels, task: c.task ? { title: c.task.title, status: c.task.status } : null,
    })),
    stars: u.stars,
    reviews: u.reviews,
  }
}
