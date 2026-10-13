/**
 * V2 백필 A2 — 리뷰 날짜 확정 (읽기 전용, DB 접속 없음)
 * ────────────────────────────────────────────────────────────────
 * 입력: <data>/source/reviews.{신설,동대문}.json(범위 리뷰), reviews_pairing_extra.json(앞뒤 달 —
 *       짝짓기 풀에만 넣고 결과에서는 뺀다), raw_reviews.{신설,동대문}.json, ota_properties.json
 * 출력: <data>/reviews.resolved.json
 *
 * 🔴 날짜 규칙은 새로 만들지 않는다. lib/otaDetail.ts 의 pairReviewsWithRaw · reviewKey ·
 *    resolveReviewDate · ratingInChannelScale 을 그대로 쓴다. 조회 창과 raw 거름은
 *    scripts/export-reviews-notion.ts 와 같다(달 목록에 들거나, 주 단위 채널이면 수집일 대체를
 *    받는 행). 짝짓기는 지점·채널로 좁힌 뒤에 한다(lib/weeklyReviews.ts datedReviewsFor 주석).
 *
 * 일자를 못 정한 리뷰(raw 미매칭, 월 단위 채널)는 그 달 15일로 두고 date_source='month'.
 * 단 기준일(as_of)보다 늦어지면 기준일로 당긴다(10월 리뷰의 15일은 아직 오지 않은 날이다).
 *
 *   npx tsx scripts/v2/resolve-dates.ts <data 폴더> [--as-of 2026-10-12]
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  pairReviewsWithRaw, resolveReviewDate, ratingInChannelScale, reviewKey,
  granularityForSite, weekLabelOf, OTA_SITE_BY_NAME,
} from '../../lib/otaDetail'
import { isoWeekOf } from '../../lib/v2/isoWeek'

const argv = process.argv.slice(2)
const dataDir = argv[0]
if (!dataDir) {
  console.error('사용법: resolve-dates.ts <data 폴더> [--as-of YYYY-MM-DD]')
  process.exit(1)
}
const asOf = argv.includes('--as-of') ? argv[argv.indexOf('--as-of') + 1] : '2026-10-12'
const BRANCHES = argv.includes('--branches') ? argv[argv.indexOf('--branches') + 1].split(',') : ['신설', '동대문']   // 기본 = 첫 백필 두 지점, --branches 고성,제주시티 로 다른 지점을 따로 돌린다
const SCOPE_MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
// 짝짓기 창 = 범위 앞뒤 한 달까지(export-reviews-notion readMonths 와 같은 폭)
const READ_MONTHS = ['2026-05', ...SCOPE_MONTHS, '2026-11']

const read = (f: string) => JSON.parse(readFileSync(join(dataDir, 'source', f), 'utf8'))

interface Review {
  id: string; branch: string; ota_site: string; rating: number | null; review_month: string | null
  content: string | null; content_ko: string | null; categories?: string[]; severity?: string
  churn_triggers?: string[]; status?: string; created_at?: string
}
interface Raw {
  id: string; branch: string; ota_site: string; review_month: string | null; raw_date: string | null
  rating: number | null; created_at: string | null; content: string | null
}
interface Prop { property_id: number; branch: string; ota_name: string; score_max: number }

const scope: Review[] = BRANCHES.flatMap(b => read(`reviews.${b}.json`))
const extra: Review[] = read('reviews_pairing_extra.json')
const rawAll: Raw[] = BRANCHES.flatMap(b => read(`raw_reviews.${b}.json`))
const props: Prop[] = read('ota_properties.json')

// export-reviews-notion 과 같은 거름
const raw = rawAll.filter(r =>
  (r.review_month != null && READ_MONTHS.includes(r.review_month)) ||
  (granularityForSite(r.ota_site) === 'week' && resolveReviewDate(r).dateSource === 'collected'))

const NAME_BY_SITE: Record<string, string> = Object.fromEntries(
  Object.entries(OTA_SITE_BY_NAME).map(([name, site]) => [site, name]))

const scopeIds = new Set(scope.map(r => r.id))
const pool = [...scope, ...extra.filter(r => !scopeIds.has(r.id))]

const groups = new Map<string, { v: Review[]; r: Raw[] }>()
const group = (b: string, s: string) => {
  const k = `${b}|${s}`
  if (!groups.has(k)) groups.set(k, { v: [], r: [] })
  return groups.get(k)!
}
for (const v of pool) group(v.branch, v.ota_site).v.push(v)
for (const r of raw) group(r.branch, r.ota_site).r.push(r)

const out: any[] = []
const unknownChannel = new Set<string>()
for (const { v, r } of groups.values()) {
  for (const p of pairReviewsWithRaw(v, r)) {
    const rv = p.review
    if (!scopeIds.has(rv.id)) continue
    const d = resolveReviewDate(p.raw, rv.review_month)
    const channel = NAME_BY_SITE[rv.ota_site] ?? rv.ota_site
    if (!NAME_BY_SITE[rv.ota_site]) unknownChannel.add(rv.ota_site)
    const prop = props.find(x => x.branch === rv.branch && x.ota_name === channel)
    const scoreMax = prop?.score_max ?? 10

    let date: string
    let dateSource: 'raw' | 'collected' | 'month'
    if (d.date) {
      date = d.date
      dateSource = d.dateSource === 'collected' ? 'collected' : 'raw'
    } else {
      const month = d.month ?? rv.review_month!
      date = `${month}-15`
      if (date > asOf) date = asOf
      dateSource = 'month'
    }
    const text = (rv.content ?? '').trim()
    const ko = (rv.content_ko ?? '').trim()
    out.push({
      id: rv.id,
      branch: rv.branch,
      ota_site: rv.ota_site,
      channel,
      property_id: prop?.property_id ?? null,
      score_max: scoreMax,
      review_month: rv.review_month,
      date,
      date_source: dateSource,
      resolved_month: d.month,
      raw_id: p.raw?.id ?? null,
      raw_date: p.raw?.raw_date ?? null,
      iso_week: isoWeekOf(date),
      week_label: weekLabelOf(date),
      rating10: rv.rating,
      rating: ratingInChannelScale(rv.rating, scoreMax),
      has_text: text !== '',
      key: reviewKey(rv.content),
      content: rv.content,
      content_ko: rv.content_ko,
      categories: rv.categories ?? [],
      severity: rv.severity ?? null,
      churn_triggers: rv.churn_triggers ?? [],
    })
  }
}

out.sort((a, b) => a.branch.localeCompare(b.branch) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

const tmp = join(dataDir, 'reviews.resolved.json.tmp')
writeFileSync(tmp, JSON.stringify(out, null, 1), 'utf8')
renameSync(tmp, join(dataDir, 'reviews.resolved.json'))

const tally: Record<string, Record<string, number>> = {}
for (const x of out) {
  const k = `${x.branch}|${x.channel}`
  tally[k] ??= { raw: 0, collected: 0, month: 0, total: 0, text: 0, text_matched: 0 }
  tally[k][x.date_source]++
  tally[k].total++
  if (x.has_text) { tally[k].text++; if (x.raw_id) tally[k].text_matched++ }
}
const future = out.filter(x => x.date > asOf).length
console.log(JSON.stringify({
  scope: scope.length, resolved: out.length, raw_pool: raw.length, as_of: asOf, future_dates: future,
  unknown_channel: [...unknownChannel], by_branch_channel: tally,
}, null, 1))
