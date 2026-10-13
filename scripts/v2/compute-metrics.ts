/**
 * V2 백필 A7 — 북극성·가드레일 지표 (DB 접속 없음)
 * ────────────────────────────────────────────────────────────────
 * 입력(<data>): source/ota_properties.json, source/ota_scores.json,
 *              source/wings_channel_checkouts.json(있으면 우선, Wings 실 퇴실·연박 조각 제외) 또는 source/ota_channel_checkouts.json,
 *              reviews.resolved.json, stars.extracted.json
 * 출력: <data>/metrics.json (build-universe.ts 가 읽어 universe.json 에 넣는다)
 *
 * 🔴 목소리 비율 = V1 리뷰 작성률과 같은 계산(lib/pageData.ts):
 *    채널별로 연속 두 스냅샷의 review_count 차이(음수는 0) ÷ 그 스냅샷 날짜(week_start)의 채널 체크아웃 수.
 *    직전 스냅샷과 간격이 10일을 넘으면 그 주는 뺀다(isWeeklyGap). 체크아웃이 없는 주는 계산하지 않는다.
 * 🔴 북극성(첫 가동 추정, 재헌 2026-10-12 확정):
 *    1 − (원문 있는 리뷰 중 부정 별이 1개 이상인 리뷰 비율 × 그 기간 채널 전체 리뷰 수(스냅샷 증가분)) ÷ 그 기간 채널 체크아웃 수
 *    분모는 지점 전체 체크아웃이 아니라 OTA 채널 체크아웃. 채널별로 추정한 뒤 합산한다
 *    (추정 부정 체류 합 ÷ 체크아웃 합, 원문 리뷰 0건인 채널은 분자·분모에서 뺌). 지점별 값은 north_star.by_branch.
 *
 *   npx tsx scripts/v2/compute-metrics.ts <data 폴더> [--from 2026-06-01] [--as-of 2026-10-12]
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isWeeklyGap, addDaysIso } from '../../lib/otaDetail'

const argv = process.argv.slice(2)
const dataDir = argv[0]
const from = argv.includes('--from') ? argv[argv.indexOf('--from') + 1] : '2026-06-01'
const asOf = argv.includes('--as-of') ? argv[argv.indexOf('--as-of') + 1] : '2026-10-12'
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))

const props: any[] = read('source/ota_properties.json')
const scores: any[] = read('source/ota_scores.json')
// 체크아웃 원천: Wings 실 퇴실(연박 조각 제외, Output/.../engineering/wings_checkouts.py)이 있으면 그것을 쓴다.
// ota_channel_checkouts 는 신설 Agoda 수기 입력만 있어(재헌 2026-10-13 「손으로 쓴 거라 신뢰하기 어려워」) 대체 원천일 뿐이다.
const WINGS_FILE = 'source/wings_channel_checkouts.json'
const checkoutSource = existsSync(join(dataDir, WINGS_FILE)) ? 'wings' : 'ota_channel_checkouts'
const checkouts: any[] = read(checkoutSource === 'wings' ? WINGS_FILE : 'source/ota_channel_checkouts.json')
const resolved: any[] = read('reviews.resolved.json')
const extracted = read('stars.extracted.json')
const BRANCHES = argv.includes('--branches') ? argv[argv.indexOf('--branches') + 1].split(',') : ['신설', '동대문']

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

// 북극성 합산: 원문 리뷰가 있어 부정 비율을 낼 수 있는 채널만 분자·분모에 넣는다(추정 부정 체류 합 ÷ 체크아웃 합).
// 원문이 0건인 채널은 부정 비율을 모르므로 체크아웃도 분모에서 뺀다(넣으면 불편 없음으로 부풀려진다).
function aggregate(rows: any[]) {
  const ok = rows.filter(d => d.all && d.all.est_neg_stays != null)
  if (ok.length === 0) return null
  const est = ok.reduce((a, d) => a + d.all.est_neg_stays, 0)
  const co = ok.reduce((a, d) => a + d.all.channel_checkouts, 0)
  const froms = ok.map(d => d.all.period.from).sort(), tos = ok.map(d => d.all.period.to).sort()
  return {
    value: Math.round((1 - est / co) * 10000) / 10000,
    channels: ok.map(d => `${d.branch} ${d.channel}`),
    period: { from: froms[0], to: tos[tos.length - 1], weeks: Math.max(...ok.map(d => d.all.period.weeks)) },
    inputs: {
      text_reviews: ok.reduce((a, d) => a + d.all.text_reviews, 0),
      text_reviews_with_neg_star: ok.reduce((a, d) => a + d.all.text_reviews_with_neg_star, 0),
      channel_reviews_delta: ok.reduce((a, d) => a + d.all.channel_reviews_delta, 0),
      channel_checkouts: co,
      est_neg_stays: Math.round(est * 10) / 10,
    },
  }
}
const overall = aggregate(northDetail)
const byBranch = Object.fromEntries(BRANCHES.map(b => [b, aggregate(northDetail.filter(d => d.branch === b))]))
const skipped = northDetail.filter(d => !d.all || d.all.est_neg_stays == null).map(d => `${d.branch} ${d.channel}`)
const noCheckout = props.filter(p => BRANCHES.includes(p.branch) && p.active && !northDetail.some(d => d.property_id === p.property_id)).map(p => `${p.branch} ${p.ota_name}`)
const voiceSum = (rows: any[]) => { const r = rows.reduce((a, v) => a + v.reviews, 0), c = rows.reduce((a, v) => a + v.checkouts, 0); return c ? { ratio: Math.round((r / c) * 10000) / 10000, reviews: r, checkouts: c } : null }
const srcLabel = checkoutSource === 'wings' ? 'Wings 실 퇴실 체크아웃(연박 조각은 신설, 동대문, 제주시티만 제외)' : 'ota_channel_checkouts 수기 체크아웃'
const out = {
  north_star: {
    label: '불편 없이 끝난 체류 비율',
    value: overall?.value ?? null,
    scope: overall ? `${BRANCHES.join("·")} OTA ${overall.channels.length}채널 · ${overall.period.from}~${overall.period.to} ${overall.period.weeks}주 · ${srcLabel} · 리뷰 1건=체류 1건 추정` : '체크아웃 데이터가 있는 채널 없음',
    is_estimate: true,
    by_branch: Object.fromEntries(Object.entries(byBranch).map(([b, a]) => [b, a ? { value: a.value, channels: a.channels.length, period: a.period, ...a.inputs } : null])),
    inputs: overall ? overall.inputs : null,
    checkout_source: checkoutSource,
    not_computed: [skipped.length ? `원문 리뷰 0건이라 부정 비율 없음: ${skipped.join(', ')}` : '', noCheckout.length ? `체크아웃 없음: ${noCheckout.join(', ')}` : ''].filter(Boolean).join(' / ') || '없음',
  },
  guardrails: {
    ota_rating: otaRating,
    voice_ratio: voiceRatio,
    voice_ratio_summary: { 전체: voiceSum(voiceRatio), ...Object.fromEntries(BRANCHES.map(b => [b, voiceSum(voiceRatio.filter(v => v.branch === b))])) },
    voice_ratio_not_computed: noCheckout.length ? `체크아웃 없음: ${noCheckout.join(', ')}` : '없음',
  },
  detail: northDetail,
}
writeFileSync(join(dataDir, 'metrics.json.tmp'), JSON.stringify(out, null, 1), 'utf8')
renameSync(join(dataDir, 'metrics.json.tmp'), join(dataDir, 'metrics.json'))
console.log(JSON.stringify({ north_star: out.north_star, voice_ratio: voiceRatio, monthly: northDetail.map(d => d.monthly.map((m: any) => ({ m: m.month, v: m.value, neg: m.neg_ratio, tr: m.text_reviews }))) }, null, 1))
