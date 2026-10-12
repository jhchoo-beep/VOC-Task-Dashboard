/**
 * V2 백필 A6 — 알려진 사례 대조용 숫자 뽑기 (DB 접속 없음)
 * 입력: <data>/universe.json, reviews.resolved.json, source/review_triage.json, source/tasks.json
 * 출력: <data>/validation.local.json (engineering/validation.md·facts.json 의 근거)
 *
 *   npx tsx scripts/v2/validate-cases.ts <data 폴더>
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = process.argv[2]
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))
const u = read('universe.json')
const resolved: any[] = read('reviews.resolved.json')
const triage: any[] = read('source/review_triage.json')
const rv = new Map(resolved.map(r => [r.id, r]))
const tri = new Map(triage.map(t => [t.review_id, t]))
const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

const starsOf = (branch: string, names: string[], polarity = 'neg') =>
  u.stars.filter((s: any) => s.branch === branch && s.polarity === polarity && names.includes(s.phenomenon))

/** 리뷰 단위로 센다(한 리뷰에 같은 계열 별이 여럿이어도 1). month 기준 = review_month(V1과 같은 축) 또는 별 날짜 월. */
function reviewsByMonth(stars: any[], opts: { below9?: boolean; by: 'review_month' | 'date' }) {
  const ids = [...new Set(stars.map((s: any) => s.review_id))].filter(id => {
    const r = rv.get(id)!
    return opts.below9 ? Number(r.rating10) < 9 : true
  })
  const out: Record<string, number> = Object.fromEntries(MONTHS.map(m => [m, 0]))
  for (const id of ids) {
    const r = rv.get(id)!
    const m = opts.by === 'review_month' ? r.review_month : r.date.substring(0, 7)
    out[m] = (out[m] ?? 0) + 1
  }
  return { total: ids.length, monthly: out, review_ids: ids }
}

function triageOf(ids: string[]) {
  const out: Record<string, number> = { 종결: 0, 조치: 0, 이월: 0, 판단없음: 0 }
  for (const id of ids) {
    const t = tri.get(id)
    out[t ? t.verdict : '판단없음']++
  }
  return out
}

const SHOWER = ['욕실 샤워 후 바닥 젖음', '욕실 샤워 공간 분리 없음', '욕실 샤워 커튼 달라붙음', '욕실 샤워 커튼 봉 빠짐', '젖은 슬리퍼 미끄러움', '욕실 샤워 커튼 오염']
const showerFam = starsOf('신설', SHOWER)
const showerWet = starsOf('신설', ['욕실 샤워 후 바닥 젖음'])
const famBelow9 = reviewsByMonth(showerFam, { below9: true, by: 'review_month' })
const famAll = reviewsByMonth(showerFam, { by: 'review_month' })

const constOf = (branch: string, name: string, polarity = 'neg') =>
  u.constellations.find((c: any) => c.branch === branch && c.name === name && c.polarity === polarity) ?? null
const brief = (c: any) => c && ({
  id: c.id, status: c.status, stars: c.star_ids.length, monthly: c.monthly, first: c.first_date, last: c.last_date,
  distinct_weeks: c.distinct_weeks, recent_4w: c.recent_4w, relapse_count: c.relapse_count, observation_start: c.observation_start,
  task: c.task, formed_at: c.formed_at,
})

// 9.0 이상 리뷰 안의 불편 / 9.0 미만 리뷰 안의 칭찬 (V1이 읽지 않던 목소리)
function crossCheck(branch: string) {
  const reviews = resolved.filter(r => r.branch === branch && r.has_text)
  const negBy = new Set(u.stars.filter((s: any) => s.branch === branch && s.polarity === 'neg').map((s: any) => s.review_id))
  const posBy = new Set(u.stars.filter((s: any) => s.branch === branch && s.polarity === 'pos').map((s: any) => s.review_id))
  const ge9 = reviews.filter(r => Number(r.rating10) >= 9)
  const lt9 = reviews.filter(r => Number(r.rating10) < 9)
  return {
    text_reviews: reviews.length,
    ge9: ge9.length, ge9_with_neg_star: ge9.filter(r => negBy.has(r.id)).length,
    lt9: lt9.length, lt9_with_pos_star: lt9.filter(r => posBy.has(r.id)).length,
    lt9_without_neg_star: lt9.filter(r => !negBy.has(r.id)).length,
  }
}

const STAFF_POS = ['직원 친절·환대', '셀프 이용이 막힐 때 직원 도움', '직원 외국어 응대 좋음', '요청 사항 기억·반영', '문의 응대 빠름', '로비 직원 상주 안심']
function staffPraise(branch: string) {
  const st = u.stars.filter((s: any) => s.branch === branch && s.polarity === 'pos' && STAFF_POS.includes(s.phenomenon))
  const byName: Record<string, number> = {}
  for (const s of st) byName[s.phenomenon] = (byName[s.phenomenon] ?? 0) + 1
  return { stars: st.length, reviews: new Set(st.map((s: any) => s.review_id)).size, by_phenomenon: byName }
}

const signals: Record<string, number> = {}
for (const s of u.stars) if (s.relation_signal) signals[`${s.branch}|${s.relation_signal}`] = (signals[`${s.branch}|${s.relation_signal}`] ?? 0) + 1

const dateSource: Record<string, number> = {}
for (const r of resolved) dateSource[`${r.branch}|${r.date_source}`] = (dateSource[`${r.branch}|${r.date_source}`] ?? 0) + 1

const result = {
  shower_family_sinseol: {
    phenomena: SHOWER,
    below9_reviews_by_review_month: famBelow9.monthly, below9_total: famBelow9.total,
    below9_triage: triageOf(famBelow9.review_ids),
    all_reviews_by_review_month: famAll.monthly, all_total: famAll.total,
    all_triage: triageOf(famAll.review_ids),
    wet_floor_only_stars_by_date: reviewsByMonth(showerWet, { by: 'date' }).monthly,
    constellations: SHOWER.map(n => brief(constOf('신설', n))).filter(Boolean),
  },
  checkin_path: {
    신설: ['셀프 체크인 어려움·오류', 'QR 출입 불편', '프론트 직원 부재', '셀프 이용이 막혀도 직원 도움 없음'].map(n => ({ name: n, c: brief(constOf('신설', n)) })),
    동대문: ['셀프 체크인 어려움·오류', 'QR 출입 불편', '프론트 직원 부재', '셀프 이용이 막혀도 직원 도움 없음'].map(n => ({ name: n, c: brief(constOf('동대문', n)) })),
  },
  hk_quality_sinseol: ['객실 먼지·오염', '객실 머리카락', '욕실 머리카락'].map(n => {
    const c = constOf('신설', n)
    const after = c ? c.star_ids.map((id: string) => u.stars.find((s: any) => s.id === id)).filter((s: any) => s.date > (c.observation_start ?? '9999')) : []
    return { name: n, c: brief(c), stars_after_completion: after.map((s: any) => ({ id: s.id, date: s.date, channel: s.channel, quote: s.quote })) }
  }),
  room_request_sinseol: (() => {
    const c = constOf('신설', '요청 사항 미반영')
    return { c: brief(c), stars: c ? c.star_ids.map((id: string) => { const s = u.stars.find((x: any) => x.id === id); return { date: s.date, quote: s.quote } }) : [] }
  })(),
  self_operation_sinseol: ['셀프 운영 번거로움', '투숙 중 객실 청소 미제공', '셀프 운영 사전 안내 없음', '짐 보관 유료'].map(n => ({ name: n, c: brief(constOf('신설', n)) })),
  positive_staff_help: { 신설: brief(constOf('신설', '셀프 이용이 막힐 때 직원 도움', 'pos')), 동대문: brief(constOf('동대문', '셀프 이용이 막힐 때 직원 도움', 'pos')) },
  positive_request_memory: {
    신설: brief(constOf('신설', '요청 사항 기억·반영', 'pos')), 동대문: brief(constOf('동대문', '요청 사항 기억·반영', 'pos')),
    신설_stars: u.stars.filter((s: any) => s.branch === '신설' && s.phenomenon === '요청 사항 기억·반영').map((s: any) => ({ date: s.date, quote: s.quote, constellation_id: s.constellation_id })),
    동대문_stars: u.stars.filter((s: any) => s.branch === '동대문' && s.phenomenon === '요청 사항 기억·반영').map((s: any) => ({ date: s.date, quote: s.quote, constellation_id: s.constellation_id })),
  },
  voices_v1_missed: { 신설: crossCheck('신설'), 동대문: crossCheck('동대문') },
  staff_praise: { 신설: staffPraise('신설'), 동대문: staffPraise('동대문') },
  relation_signals: signals,
  date_source: dateSource,
  counts: u.meta.counts,
  core: u.core,
}

const out = join(dataDir, 'validation.local.json')
writeFileSync(`${out}.tmp`, JSON.stringify(result, null, 1), 'utf8')
renameSync(`${out}.tmp`, out)
console.log(JSON.stringify({
  shower_below9: result.shower_family_sinseol.below9_reviews_by_review_month, shower_below9_triage: result.shower_family_sinseol.below9_triage,
  shower_all: result.shower_family_sinseol.all_reviews_by_review_month, shower_all_triage: result.shower_family_sinseol.all_triage,
  wet_only: result.shower_family_sinseol.wet_floor_only_stars_by_date,
  v1_missed: result.voices_v1_missed, staff: result.staff_praise, signals,
}, null, 1))
