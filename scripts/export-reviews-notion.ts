/**
 * 고성·제주시티 리뷰 → 노션 DB 「고성·제주시티 OTA 리뷰」 적재 준비 (읽기 전용)
 * ────────────────────────────────────────────────────────────────
 * 정해선 FO의 「고객 경험 프로그램 검증 (고성/제주)」 아티팩트가 이 노션 DB를 읽어
 * 프로그램 운영 전후 2주의 리뷰 수·평점·본문 언급을 계산한다(2026-09-30).
 * 아티팩트는 Supabase에 직접 붙을 수 없어서(외부 요청 불가, anon 키 노출 시 RLS 꺼진 표가
 * 삭제까지 열림) 노션을 거친다.
 *
 * 이 스크립트는 어디에도 쓰지 않는다. 노션 적재에 필요한 파일만 만든다.
 *   candidates.json — 후보 리뷰와 본문 체크섬
 *   pages.json      — { 리뷰 ID: notion-create-pages 에 넘길 { properties } }
 *   verify-N.sql    — 노션 값이 후보와 다른 행(없는 행 포함)만 돌려주는 대조 쿼리
 *   dupes.sql       — 노션에 같은 리뷰 ID가 두 번 이상 있는 행
 *
 * 🔴 날짜 규칙은 파생 배치와 같아야 한다 — 채널별 pairReviewsWithRaw → resolveReviewDate.
 *    짝짓기는 후보만이 아니라 조회 창 전체로 한다. 본문 없는 리뷰는 (월, 평점)으로 짝지어지므로
 *    후보만 넣으면 다른 리뷰의 raw 를 가져가 날짜가 바뀔 수 있다.
 * 🔴 키워드로 거르지 않는다. 리뷰 수·평점 변화의 모수가 그 기간 전체 리뷰다. 키워드는 아티팩트가 건다.
 * 🔴 MCP로 한글 본문을 옮겨 적으면 글자가 바뀐다(2026-09-30 백필 161건 중 1건에서 2글자).
 *    적재 뒤 verify 쿼리가 0행이 될 때까지 대조한다.
 *
 * 체크섬 = Σ 코드포인트 × ((위치 % 97) + 1), 위치는 1부터. 노션 SQL(SQLite)의
 * unicode(substr(s, i, 1))와 같은 값이 나오도록 코드포인트 단위로 센다(JS length 아님).
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<key> \
 *   npm run export:notion -- --since-days 14 --out /tmp/notion-export
 *
 *   --since-days N  reviews.created_at(파싱 시각)이 최근 N일인 리뷰만 후보로 (기본 14)
 *   --all           created_at 창 없이 범위 전체를 후보로 (백필·전수 재대조용)
 *   --out DIR       출력 폴더 (기본 ./tmp-notion-export)
 * ────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  pairReviewsWithRaw, resolveReviewDate, rawMonthOrCollectedFilter, collectedRangeUtc,
  granularityForSite, monthWindow,
} from '../lib/otaDetail'

const NOTION_DS = 'collection://1b555ab3-c446-495a-b2a4-43b495bdb352'
const BRANCHES = ['고성', '제주시티']
// 노션 DB 범위의 시작. 해선 FO 프로그램 중 가장 이른 7/14 제주시티 초복 이벤트의 운영 전 2주를 덮는다.
const FLOOR_DATE = '2026-06-01'
const FLOOR_MONTH = FLOOR_DATE.substring(0, 7)
const PAGE_SIZE = 1000
const VERIFY_CHUNK = 80

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

const argv = process.argv.slice(2)
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  if (i < 0) return undefined
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('--')) die(`--${n} 에는 값이 필요합니다 (받은 값: ${v ?? '없음'})`)
  return v
}
const all = argv.includes('--all')
const sinceDaysRaw = opt('since-days')
if (all && sinceDaysRaw) die('--all 과 --since-days 는 함께 쓸 수 없습니다')
const sinceDays = Number(sinceDaysRaw ?? 14)
if (!Number.isInteger(sinceDays) || sinceDays < 1) die(`--since-days 는 1 이상의 정수여야 합니다 (받은 값: ${sinceDaysRaw})`)
const outDir = opt('out') ?? 'tmp-notion-export'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / KEY 환경변수가 필요합니다')
const db = createClient(url, key)

const pad = (n: number) => String(n).padStart(2, '0')

// 조회 창 = 범위 시작 전달부터 다음 달까지. 투숙월로 적재된 아고다 행(review_month 가 작성월보다 이르다)과
// 월말 작성분이 다음 달로 파싱된 행을 놓치지 않게 양끝을 한 달씩 넓힌다(백필과 같은 창).
function readMonths(): string[] {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  const out: string[] = []
  const [fy, fm] = FLOOR_MONTH.split('-').map(Number)
  for (let d = new Date(Date.UTC(fy, fm - 2, 1)); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`)
  }
  return out
}

// 정렬을 고정하고 빈 페이지가 올 때까지 읽는다 — PostgREST 상한에 걸려 조용히 잘리지 않게.
async function fetchAll<T>(table: string, cols: string, filter: (q: any) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ;) {
    const { data, error } = await filter(db.from(table).select(cols))
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    if (page.length === 0) break
    out.push(...page)
    from += page.length
  }
  return out
}

function checksum(s: string): { ck: number; len: number } {
  let ck = 0
  let i = 0
  for (const c of s) {
    i++
    ck += c.codePointAt(0)! * ((i % 97) + 1)
  }
  return { ck, len: i }
}

const sqlStr = (v: string | null) => (v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`)

interface Candidate {
  id: string
  branch: string
  ota_site: string
  rating: number | null
  date: string | null
  month: string | null
  dateSource: string
  text: string
  ck: number
  len: number
}

function verifySql(rows: Candidate[]): string {
  const exp = rows.map((r, j) =>
    `${j ? 'UNION ALL ' : ''}SELECT ${sqlStr(r.id)} AS id, ${r.ck} AS ck, ${r.len} AS len, ${sqlStr(r.date)} AS dt, ` +
    `${sqlStr(r.month)} AS mo, ${sqlStr(r.branch)} AS br, ${sqlStr(r.ota_site)} AS ch, ${r.rating ?? 'NULL'} AS rt`,
  ).join(' ')
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, j) => (j ? `UNION ALL SELECT ${n}` : `SELECT ${n} AS n`)).join(' ')
  // 노션 SQL은 WITH RECURSIVE·VALUES 를 받지 않는다 — 숫자표는 UNION ALL 교차조인으로 만든다.
  return `WITH exp AS (${exp}), d AS (${digits}), ` +
    'nums AS (SELECT a.n + b.n * 10 + c.n * 100 + e.n * 1000 AS i FROM d a, d b, d c, d e), ' +
    `t AS (SELECT "리뷰 ID" AS id, "번역 본문" AS s, "date:작성일:start" AS dt, "작성월" AS mo, "지점" AS br, "채널" AS ch, "평점" AS rt FROM "${NOTION_DS}"), ` +
    'act AS (SELECT id, coalesce(sum(unicode(substr(s, i, 1)) * ((i % 97) + 1)), 0) AS ck, coalesce(max(length(s)), 0) AS len, ' +
    'max(dt) AS dt, max(mo) AS mo, max(br) AS br, max(ch) AS ch, max(rt) AS rt ' +
    'FROM t LEFT JOIN nums ON nums.i >= 1 AND nums.i <= length(t.s) GROUP BY id) ' +
    'SELECT e.id, e.ck AS eck, a.ck AS ack, e.len AS elen, a.len AS alen, e.dt AS edt, a.dt AS adt, e.mo AS emo, a.mo AS amo, ' +
    'e.br AS ebr, a.br AS abr, e.ch AS ech, a.ch AS ach, e.rt AS ert, a.rt AS art ' +
    'FROM exp e LEFT JOIN act a ON a.id = e.id ' +
    "WHERE a.id IS NULL OR a.ck <> e.ck OR a.len <> e.len OR coalesce(a.dt, '') <> coalesce(e.dt, '') " +
    "OR coalesce(a.mo, '') <> coalesce(e.mo, '') OR a.br <> e.br OR a.ch <> e.ch " +
    'OR (e.rt IS NULL) <> (a.rt IS NULL) OR abs(a.rt - e.rt) > 0.001'
}

async function main() {
  const months = readMonths()
  const sinceIso = all ? null : new Date(Date.now() - sinceDays * 86_400_000).toISOString()
  console.log(`조회 월 ${months.join(', ')} · 후보 = ${all ? '범위 전체(--all)' : `created_at ≥ ${sinceIso} (최근 ${sinceDays}일 파싱분)`}`)

  const reviews = await fetchAll<any>('reviews',
    'id,branch,ota_site,review_month,rating,content,content_ko,created_at',
    q => q.in('branch', BRANCHES).in('review_month', months))
  const collected = collectedRangeUtc(`${months[0]}-01`, monthWindow(months[months.length - 1]).lastDay)
  const rawAll = await fetchAll<any>('raw_reviews',
    'id,branch,ota_site,reviewer,raw_date,review_month,rating,content,created_at',
    q => q.in('branch', BRANCHES).or(rawMonthOrCollectedFilter(months, collected)))
  // derive-ota-detail fetchRawReviews 와 같은 거름: 달 목록에 들거나, 주 단위 채널이면 수집일 대체를 받는 행
  const raw = rawAll.filter(r =>
    (r.review_month != null && months.includes(r.review_month)) ||
    (granularityForSite(r.ota_site) === 'week' && resolveReviewDate(r).dateSource === 'collected'))

  const groups = new Map<string, { v: any[]; r: any[] }>()
  const group = (b: string, s: string) => {
    const k = `${b}|${s}`
    if (!groups.has(k)) groups.set(k, { v: [], r: [] })
    return groups.get(k)!
  }
  for (const v of reviews) group(v.branch, v.ota_site).v.push(v)
  for (const r of raw) group(r.branch, r.ota_site).r.push(r)

  const inScope: Candidate[] = []
  const sinceIds = new Set<string>()
  for (const { v, r } of groups.values()) {
    for (const p of pairReviewsWithRaw(v, r)) {
      const d = resolveReviewDate(p.raw, p.review.review_month)
      const keep = d.date ? d.date >= FLOOR_DATE : (d.month != null && d.month >= FLOOR_MONTH)
      if (!keep) continue
      const text = (p.review.content_ko ?? '').trim() || (p.review.content ?? '').trim()
      inScope.push({
        id: p.review.id,
        branch: p.review.branch,
        ota_site: p.review.ota_site,
        rating: p.review.rating == null ? null : Number(p.review.rating),
        date: d.date,
        month: d.month,
        dateSource: d.dateSource ?? (d.month ? 'month-only' : 'none'),
        text,
        ...checksum(text),
      })
      if (sinceIso && p.review.created_at >= sinceIso) sinceIds.add(p.review.id)
    }
  }
  const candidates = (all ? inScope : inScope.filter(c => sinceIds.has(c.id)))
    .sort((a, b) => a.id.localeCompare(b.id))

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(candidates, null, 1), 'utf8')
  const pages: Record<string, { properties: Record<string, string | number> }> = {}
  for (const c of candidates) {
    const props: Record<string, string | number> = {
      '리뷰 ID': c.id, '작성월': c.month ?? '', '지점': c.branch, '채널': c.ota_site, '번역 본문': c.text,
    }
    if (c.rating != null) props['평점'] = c.rating
    if (c.date) {
      props['date:작성일:start'] = c.date
      props['date:작성일:is_datetime'] = 0
    }
    pages[c.id] = { properties: props }
  }
  writeFileSync(join(outDir, 'pages.json'), JSON.stringify(pages, null, 1), 'utf8')
  const chunks = Math.ceil(candidates.length / VERIFY_CHUNK)
  for (let k = 0; k < chunks; k++) {
    writeFileSync(join(outDir, `verify-${k + 1}.sql`),
      verifySql(candidates.slice(k * VERIFY_CHUNK, (k + 1) * VERIFY_CHUNK)), 'utf8')
  }
  writeFileSync(join(outDir, 'dupes.sql'),
    `SELECT "리뷰 ID" AS id, count(*) AS n FROM "${NOTION_DS}" GROUP BY "리뷰 ID" HAVING count(*) > 1`, 'utf8')

  const byBranch: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  for (const c of candidates) {
    byBranch[c.branch] = (byBranch[c.branch] ?? 0) + 1
    bySource[c.dateSource] = (bySource[c.dateSource] ?? 0) + 1
  }
  console.log(JSON.stringify({
    범위내리뷰: inScope.length,
    후보: candidates.length,
    지점별: byBranch,
    날짜출처: bySource,
    본문2000자초과: candidates.filter(c => c.len > 2000).map(c => c.id),
    빈본문: candidates.filter(c => !c.text).map(c => c.id),
    대조쿼리: chunks,
    출력: outDir,
  }, null, 1))
}

main().catch(e => { console.error(e); process.exit(1) })
