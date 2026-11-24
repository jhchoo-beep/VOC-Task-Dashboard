/**
 * KR4 2.0 — 불편 분석 대상 리뷰 고르기 (읽기 전용)
 * ────────────────────────────────────────────────────────────────
 * reviews(정본 모집단)에 raw 날짜를 붙이고(lib/weeklyReviews.datedReviewsFor — 주간 리포트와 같은 규칙),
 * 아직 voc_review_analysis 에 없는 리뷰만 골라 LLM 배치 입력(40건씩)을 만든다.
 *
 *   SUPABASE_URL=… SUPABASE_KEY=… npx tsx scripts/kr4v2/prepare.ts <출력 폴더> [--from YYYY-MM-DD(기본 기준일-28일)] [--as-of YYYY-MM-DD(기본 오늘)]
 *
 * 출력: <폴더>/targets.json(전체 대상, 날짜·주 라벨 포함), <폴더>/batch-NN.json(LLM 입력), <폴더>/phenomena.json(현상 사전)
 * 🔴 키는 환경변수로만 받는다. 파일에 남기지 않는다.
 * ────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { datedReviewsFor, type ReviewRow, type RawReviewRow } from '../../lib/weeklyReviews'
import { OTA_SITE_BY_NAME, weekLabelOf, reviewKey } from '../../lib/otaDetail'

const argv = process.argv.slice(2)
const out = argv[0]
if (!out) { console.error('사용법: prepare.ts <출력 폴더> [--from YYYY-MM-DD] [--as-of YYYY-MM-DD]'); process.exit(1) }
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const AS_OF = opt('--as-of', new Date().toISOString().slice(0, 10))
// 기본 창 = 기준일 28일 전부터. 주간 루틴은 지난 4주에 늦게 들어온 리뷰까지 줍는다.
// 더 옛 리뷰는 이미 분석한 리뷰의 번역 사본일 가능성이 커서 기본으로는 보지 않는다(필요하면 --from 으로 연다).
const FROM = opt('--from', new Date(Date.parse(AS_OF) - 28 * 864e5).toISOString().slice(0, 10))
const BRANCHES = ['신설', '동대문', '제주시티', '고성']

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!)

async function all<T>(table: string, cols: string, f: (q: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await f(sb.from(table).select(cols)).range(i, i + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data as T[]))
    if (!data || data.length < 1000) break
  }
  return rows
}

const months = (() => {
  const a: string[] = []
  const d = new Date(FROM.slice(0, 7) + '-01T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() - 1)                      // 짝짓기 창 = 앞 한 달까지
  while (d.toISOString().slice(0, 7) <= AS_OF.slice(0, 7)) { a.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1) }
  return a
})()

const main = async () => {
  const reviews = await all<ReviewRow>('reviews', 'id,branch,ota_site,review_month,rating,content,content_ko',
    q => q.in('branch', BRANCHES).in('review_month', months))
  const raw = await all<RawReviewRow>('raw_reviews', 'id,branch,ota_site,review_month,raw_date,rating,country,room_type,content,reviewer,created_at',
    q => q.in('branch', BRANCHES).in('review_month', months))
  const done = new Set((await all<{ review_id: string }>('voc_review_analysis', 'review_id', q => q)).map(r => r.review_id))

  const targets: any[] = []
  // 중복 = 같은 지점·채널에서 공백 뺀 본문 앞 60자가 같은 리뷰(원문·번역본 두 행). 이미 분석한 리뷰의 본문으로 먼저 채운다 —
  // 그래야 분석이 끝난 리뷰의 사본이 새 리뷰로 다시 분모에 들어가지 않는다.
  const keyOf = (rv: ReviewRow) => `${rv.branch}|${rv.ota_site}|${reviewKey(rv.content).slice(0, 60)}`
  const seenKey = new Set<string>(reviews.filter(r => done.has(r.id) && (r.content ?? '').trim()).map(keyOf))
  let dupSkipped = 0
  for (const b of BRANCHES) for (const ch of Object.keys(OTA_SITE_BY_NAME)) {
    for (const d of datedReviewsFor(reviews, raw, b, ch)) {
      const rv = d.review
      // 일자를 못 정한 리뷰(월 단위 채널·raw 미매칭) = 그 달 15일, 기준일보다 늦으면 기준일(V2 백필 resolve-dates 와 같은 규칙)
      const month = d.month ?? rv.review_month
      let date = d.date
      let src = 'raw'
      if (!date) { date = `${month}-15`; if (date > AS_OF) date = AS_OF; src = 'month' }
      if (date < FROM || date > AS_OF || done.has(rv.id)) continue
      const text = (rv.content ?? '').trim()
      const k = keyOf(rv)
      // 🔴 중복은 대상에서 아예 뺀다 — voc_review_analysis 에 넣으면 불편 지수 분모가 사본만큼 부푼다.
      if (text && seenKey.has(k)) { dupSkipped++; continue }
      if (text) seenKey.add(k)
      targets.push({
        id: rv.id, branch: b, channel: ch, date, date_source: src, week_label: weekLabelOf(date),
        score10: rv.rating == null ? null : Number(rv.rating), has_text: text !== '', dup: false,
        ko: (rv.content_ko ?? rv.content ?? '').trim(), orig: text,
      })
    }
  }
  targets.sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id))
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'targets.json'), JSON.stringify(targets, null, 1))
  const llm = targets.filter(t => t.has_text && !t.dup)
  for (let i = 0; i < llm.length; i += 40) {
    const batch = llm.slice(i, i + 40).map(t => ({ id: t.id, branch: t.branch, channel: t.channel, date: t.date, rating: t.score10, scale: 10, ko: t.ko, orig: t.orig }))
    writeFileSync(join(out, `batch-${String(i / 40 + 1).padStart(2, '0')}.json`), JSON.stringify(batch, null, 1))
  }
  // 현상 사전 — 같은 현상에는 이미 쓴 이름을 그대로 쓰게 LLM 에 함께 준다(star-extraction-prompt.md 2절).
  // 형식: [극성 p|n, 은하 코드, 현상, 받는 쪽 CM|FM|CR|X, 건수]. build-sql.ts 가 이 파일로 은하·받는 쪽 충돌을 검사한다.
  const GC: Record<string, string> = { 청결: '청', 소음: '소', 시설: '시', '응대/환대/커뮤니티': '응', '체크인/체크아웃': '체', '위치/접근성': '위', 어메니티: '어', 가격: '가', 기타: '기' }
  const st = await all<{ polarity: string; galaxy: string; phenomenon: string; owner: string }>('voc_stars', 'polarity,galaxy,phenomenon,owner', q => q)
  const dict = new Map<string, [string, string, string, string, number]>()
  for (const s of st) {
    const p = s.polarity === 'neg' ? 'n' : 'p'
    const k = `${p}|${s.phenomenon}`
    const cur = dict.get(k) ?? [p, GC[s.galaxy] ?? '기', s.phenomenon, s.owner === '운영 밖' ? 'X' : s.owner, 0]
    cur[4]++
    dict.set(k, cur)
  }
  writeFileSync(join(out, 'phenomena.json'), JSON.stringify([...dict.values()].sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]) || b[4] - a[4])))

  const by: Record<string, number> = {}
  for (const t of targets) by[`${t.branch} ${t.date.slice(0, 7)}`] = (by[`${t.branch} ${t.date.slice(0, 7)}`] ?? 0) + 1
  console.log(JSON.stringify({ months, reviews: reviews.length, raw: raw.length, done: done.size, targets: targets.length, llm: llm.length, noText: targets.filter(t => !t.has_text).length, dupSkipped, from: FROM, asOf: AS_OF, by }, null, 1))
}
main().catch(e => { console.error(e); process.exit(1) })
