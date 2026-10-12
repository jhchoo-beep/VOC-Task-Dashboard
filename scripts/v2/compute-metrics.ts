/**
 * V2 백필 A7 — 북극성·가드레일 지표 (DB 접속 없음)
 * ────────────────────────────────────────────────────────────────
 * 입력(<data>): source/ota_properties.json, source/ota_scores.json, source/ota_channel_checkouts.json,
 *              reviews.resolved.json, stars.extracted.json
 * 출력: <data>/metrics.json (build-universe.ts 가 읽어 universe.json 에 넣는다)
 *
 * 🔴 목소리 비율 = V1 리뷰 작성률과 같은 계산(lib/pageData.ts):
 *    채널별로 연속 두 스냅샷의 review_count 차이(음수는 0) ÷ 그 스냅샷 날짜(week_start)의 채널 체크아웃 수.
 *    직전 스냅샷과 간격이 10일을 넘으면 그 주는 뺀다(isWeeklyGap). 체크아웃이 없는 주는 계산하지 않는다.
 * 🔴 북극성(첫 가동 추정, 재헌 2026-10-12 확정):
 *    1 − (원문 있는 리뷰 중 부정 별이 1개 이상인 리뷰 비율 × 그 기간 채널 전체 리뷰 수(스냅샷 증가분)) ÷ 그 기간 채널 체크아웃 수
 *    분모는 지점 전체 체크아웃이 아니라 OTA 채널 체크아웃. 체크아웃이 있는 채널만 계산한다(지금은 신설 Agoda).
 *
 *   npx tsx scripts/v2/compute-metrics.ts <data 폴더> [--from 2026-06-01] [--as-of 2026-10-12]
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { isWeeklyGap, addDaysIso } from '../../lib/otaDetail'

const argv = process.argv.slice(2)
const dataDir = argv[0]
const from = argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : '2026-06-01'
const asOf = argv.includes('--as-of') ? argv[argv.indexOf('--as-of') + 1] : '2026-10-12'
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))

const props: any[] = read('source/ota_properties.json')
const scores: any[] = read('source/ota_scores.json')
const checkouts: any[] = read('source/ota_channel_checkouts.json')
const resolved: any[] = read('reviews.resolved.json')
const extracted = read('stars.extracted.json')
const BRANCHES = ['신설', '동대문']

const negReviewIds = new Set(extracted.stars.filter((s: any) => s.polarity === 'neg').map((s: any) => s.review_id))
const dupIds = new Set(Object.keys(extracted.duplicate_of))

interface Week { ws: string; prev: string; delta: number; checkouts: number }

/** pageData.ts 의 reviewRate 루프와 같은 판정. 구간(prev, ws] 이 백필 시작일 이후인 주만 쓴다. */
function weeksFor(propertyId: number): Week[] {
  const snaps = scores.filter(s => s.property_id === propertyId).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const co = new Map(checkouts.filter(c => c.property_id === propertyId).map(c => [c.week_start, c.checkout_count]))
  const out: Week[] = []
  for (let i = 1; i < snaps.length; i++) {
    const ws = snaps[i].recorded_at
    const c = co.get(ws)
    if (!c) continue
    if (!isWeeklyGap(snaps[i - 1].recorded_at, ws)) continue
    if (addDaysIso(snaps[i - 1].recorded_at, 1) < from || ws > asOf) continue
    out.push({ ws, prev: snaps[i - 1].recorded_at, delta: Math.max(0, (snaps[i].review_count ?? 0) - (snaps[i - 1].review_count ?? 0)), checkouts: c })
  }
  return out
}

const OTA_SITE: Record<string, string> = { Agoda: '아고다', Booking: '부킹닷컴', 'Trip.com': '트립닷컴', Expedia: '익스피디아', Airbnb: '에어비앤비', NOL: '야놀자', '여기어때': '여기어때' }

function northStarFor(p: any, weeks: Week[]) {
  if (weeks.length === 0) return null
  const first = addDaysIso(weeks[0].prev, 1)
  const last = weeks[weeks.length - 1].ws
  const texts = resolved.filter(r => r.branch === p.branch && r.ota_site === OTA_SITE[p.ota_name] && r.has_text
    && !dupIds.has(r.id) && r.date >= first && r.date <= last)
  const neg = texts.filter(r => negReviewIds.has(r.id))
  const totalReviews = weeks.reduce((a, w) => a + w.delta, 0)
  const totalCheckouts = weeks.reduce((a, w) => a + w.checkouts, 0)
  const negRatio = texts.length ? neg.length / texts.length : null
  const estNeg = negRatio == null ? null : negRatio * totalReviews
  const value = estNeg == null ? null : 1 - estNeg / totalCheckouts
  return {
    period: { from: first, to: last, weeks: weeks.length, week_labels: weeks.map(w => w.ws) },
    text_reviews: texts.length, text_reviews_with_neg_star: neg.length, neg_ratio: negRatio,
    channel_reviews_delta: totalReviews, channel_checkouts: totalCheckouts,
    est_neg_stays: estNeg, value,
  }
}

const voiceRatio: any[] = []
const northDetail: any[] = []
for (const p of props.filter(p => BRANCHES.includes(p.branch) && p.active)) {
  const weeks = weeksFor(p.property_id)
  if (weeks.length === 0) continue
  const d = weeks.reduce((a, w) => a + w.delta, 0)
  const c = weeks.reduce((a, w) => a + w.checkouts, 0)
  voiceRatio.push({ branch: p.branch, channel: p.ota_name, ratio: Math.round((d / c) * 10000) / 10000, weeks: weeks.length, reviews: d, checkouts: c, period: { from: addDaysIso(weeks[0].prev, 1), to: weeks[weeks.length - 1].ws } })
  // 월별(주 라벨의 달) 나눔도 함께 — 기준선 비교용
  const byMonth = new Map<string, Week[]>()
  for (const w of weeks) {
    const m = w.ws.substring(0, 7)
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m)!.push(w)
  }
  northDetail.push({
    branch: p.branch, channel: p.ota_name, property_id: p.property_id,
    all: northStarFor(p, weeks),
    monthly: [...byMonth.entries()].map(([m, ws]) => ({ month: m, ...northStarFor(p, ws) })),
    weekly_voice: weeks.map(w => ({ week: w.ws, reviews: w.delta, checkouts: w.checkouts, ratio: Math.round((w.delta / w.checkouts) * 1000) / 1000 })),
  })
}

// OTA 평점: 채널별 최신 스냅샷(목표로 쫓지 않음)
const otaRating = props.filter(p => BRANCHES.includes(p.branch) && p.active).map(p => {
  const ss = scores.filter(s => s.property_id === p.property_id).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const l = ss[ss.length - 1]
  return l ? { branch: p.branch, channel: p.ota_name, score: Number(l.overall_score), scale: p.score_max, recorded_at: l.recorded_at, review_count: l.review_count } : null
}).filter(Boolean)

const main = northDetail[0]?.all
const out = {
  north_star: {
    label: '불편 없이 끝난 체류 비율',
    value: main?.value == null ? null : Math.round(main.value * 10000) / 10000,
    scope: main ? `신설 Agoda만(체크아웃 데이터가 있는 유일한 채널) · ${main.period.from}~${main.period.to} ${main.period.weeks}주 · 리뷰 1건=체류 1건 추정` : '체크아웃 데이터가 있는 채널 없음',
    is_estimate: true,
    inputs: main ? {
      text_reviews: main.text_reviews, text_reviews_with_neg_star: main.text_reviews_with_neg_star,
      neg_ratio: main.neg_ratio == null ? null : Math.round(main.neg_ratio * 10000) / 10000,
      channel_reviews_delta: main.channel_reviews_delta, channel_checkouts: main.channel_checkouts,
      est_neg_stays: main.est_neg_stays == null ? null : Math.round(main.est_neg_stays * 10) / 10,
    } : null,
    not_computed: '동대문 전 채널·신설 Agoda 외 채널 — ota_channel_checkouts 에 체크아웃 수 없음. 신설 Agoda도 2026-07-20 주 이후 체크아웃 미입력',
  },
  guardrails: {
    ota_rating: otaRating,
    voice_ratio: voiceRatio,
    voice_ratio_not_computed: '체크아웃 수가 있는 채널만 계산(V1 작성률과 같음). 지금은 신설 Agoda 2026-07-20 주까지',
  },
  detail: northDetail,
}
writeFileSync(join(dataDir, 'metrics.json.tmp'), JSON.stringify(out, null, 1), 'utf8')
renameSync(join(dataDir, 'metrics.json.tmp'), join(dataDir, 'metrics.json'))
console.log(JSON.stringify({ north_star: out.north_star, voice_ratio: voiceRatio, monthly: northDetail.map(d => d.monthly.map((m: any) => ({ m: m.month, v: m.value, neg: m.neg_ratio, tr: m.text_reviews }))) }, null, 1))
