/**
 * raw_reviews에서 OTA 상세 탭 데이터를 파생한다.
 *
 *   npm run derive:ota -- --weeks 4 --fill-empty            점수 분포 적재
 *   npm run derive:ota -- --weeks 4 --dry-run               적재 없이 출력만
 *   npm run derive:ota -- --weeks 4 --emit-text buckets.json  불만·VOC용 본문 묶음 출력
 *   npm run derive:ota -- --apply-text results.json         분석 결과 적재
 *
 * 점수 분포는 LLM을 타지 않는다 — 재실행 시 값이 같아야 하고 검산이 가능해야 한다.
 *
 * ── 실행 환경 주의 ──────────────────────────────────────────────
 * 이 리포의 `.env.local`에는 쓸 수 있는 Supabase 접속 정보가 없다.
 *   · NEXT_PUBLIC_SUPABASE_URL      — 줄 전체가 주석 처리되어 있다
 *   · NEXT_PUBLIC_SUPABASE_ANON_KEY — 줄이 주석 처리된 데다 값도 비어 있다
 * 따라서 이 스크립트는 `.env.local`만으로는 절대 뜨지 않는다.
 * 실행하는 사람이 호출 시점에 환경변수로 직접 넣어야 한다(파일에 적지 말 것):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<key> \
 *   npm run derive:ota -- --weeks 4 --dry-run
 * ────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  parseRawDate, weekStartOf, monthStartOf, distFromRatings, distColumnsFor,
  OTA_SITE_BY_NAME, type Granularity,
} from '../lib/otaDetail'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / KEY 환경변수가 필요합니다'); process.exit(1) }
const db = createClient(url, key)

// 일 단위 날짜를 제공하지 않는 채널 — 월 버킷으로만 적재한다
const MONTHLY_ONLY = new Set(['에어비앤비', '여기어때'])

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)
const opt  = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }

const weeks     = parseInt(opt('weeks') ?? '4')
const dryRun    = flag('dry-run')
const fillEmpty = flag('fill-empty')
const onlyBranch = opt('branch')
const onlyOta    = opt('ota')
const emitText   = opt('emit-text')
const applyText  = opt('apply-text')

interface Bucket {
  propertyId: number
  branch: string
  ota: string
  scoreMax: number
  weekStart: string
  granularity: Granularity
  ratings: number[]
  texts: string[]
}

function recentWeekStarts(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - i * 7)
    out.push(weekStartOf(d.toISOString().substring(0, 10)))
  }
  return [...new Set(out)].sort()
}

// PostgREST 기본 상한. 이보다 많은 행은 range 없이는 조용히 잘려 나간다.
const PAGE_SIZE = 1000

interface RawRow {
  reviewer?: string
  raw_date?: string
  review_month?: string
  rating?: number
  content?: string
}

// raw_reviews는 --weeks를 키우면 얼마든지 커진다. 상한에 걸려 조용히 잘리지 않도록
// 페이지가 PAGE_SIZE보다 적게 돌아올 때까지 range로 끝까지 읽는다.
// 페이지 경계가 흔들리지 않도록 정렬을 고정한다(정렬 없는 페이징은 행 누락·중복을 만든다).
async function fetchRawReviews(branch: string, site: string, months: string[]): Promise<RawRow[]> {
  const out: RawRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('raw_reviews')
      .select('reviewer,raw_date,review_month,rating,content')
      .eq('branch', branch).eq('ota_site', site)
      .in('review_month', months)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as RawRow[]
    out.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return out
}

function dedupe<T extends { reviewer?: string; raw_date?: string; rating?: number; content?: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter(r => {
    const k = `${r.reviewer ?? ''}|${r.raw_date ?? ''}|${r.rating ?? ''}|${(r.content ?? '').slice(0, 80)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function buildBuckets(): Promise<Bucket[]> {
  const targetWeeks  = recentWeekStarts(weeks)
  const targetMonths = [...new Set(targetWeeks.map(w => w.substring(0, 7)))]

  // ota_properties는 지점×채널 수준이라 구조적으로 수십 행 — 페이징 불필요
  const { data: props, error: pErr } = await db
    .from('ota_properties').select('property_id,branch,ota_name,score_max').eq('active', true)
  if (pErr) throw pErr

  const buckets: Bucket[] = []
  let unparsed = 0
  let scanned = 0
  // 주간 채널에서 일자를 못 구해 제외한 행 수 — 채널별로 따로 센다
  const droppedNoDay = new Map<string, number>

  for (const p of props ?? []) {
    if (onlyBranch && p.branch !== onlyBranch) continue
    if (onlyOta && p.ota_name !== onlyOta) continue
    const site = OTA_SITE_BY_NAME[p.ota_name]
    if (!site) { console.warn(`매핑 없는 채널: ${p.ota_name} — 건너뜀`); continue }

    const raw = await fetchRawReviews(p.branch, site, targetMonths)

    // 입도는 채널이 정한다 — 행 단위로 정하면 일자 못 구한 리뷰 하나가 주간 채널에
    // 월 버킷을 끼워 넣어, 한 채널에 '7월'과 '07/14' 라벨이 섞이고 월간 뷰에서
    // React 키가 중복된다. MONTHLY_ONLY만 월, 나머지는 무조건 주.
    const monthly  = MONTHLY_ONLY.has(site)
    const granularity: Granularity = monthly ? 'month' : 'week'
    const chanKey  = `${p.branch} ${p.ota_name}`
    const scoreMax = p.score_max === 5 ? 5 : 10
    const byKey    = new Map<string, Bucket>()

    // 부킹닷컴 raw에 중복 행이 실재한다(~14%) — 집계 전에 반드시 제거한다
    const rows = dedupe(raw)
    scanned += rows.length

    for (const r of rows) {
      const { date, month } = parseRawDate(r.raw_date, r.review_month)
      if (!date && !month) { unparsed++; continue }

      // 주간 채널인데 일자를 복원 못 한 행: 월로 강등하지 않고 제외하고 센다.
      // 조용한 강등이야말로 막으려는 실패 모드다 — 아래에서 채널별로 크게 알린다.
      if (granularity === 'week' && !date) {
        droppedNoDay.set(chanKey, (droppedNoDay.get(chanKey) ?? 0) + 1)
        continue
      }

      const weekStart = granularity === 'month' ? monthStartOf(month!) : weekStartOf(date!)
      if (granularity === 'week' && !targetWeeks.includes(weekStart)) continue
      if (granularity === 'month' && !targetMonths.includes(month!)) continue

      const k = `${weekStart}|${granularity}`
      if (!byKey.has(k)) {
        byKey.set(k, {
          propertyId: p.property_id, branch: p.branch, ota: p.ota_name,
          scoreMax, weekStart, granularity, ratings: [], texts: [],
        })
      }
      const b = byKey.get(k)!
      if (r.rating != null) b.ratings.push(Number(r.rating))
      if (r.content && r.content.trim().length > 5) b.texts.push(r.content.trim())
    }
    buckets.push(...byKey.values())
  }

  if (unparsed > 0) {
    const pct = scanned > 0 ? ((unparsed / scanned) * 100).toFixed(2) : '0.00'
    console.warn(`날짜 해석 실패로 제외한 리뷰: ${unparsed}건 / 대상 ${scanned}건 (${pct}%)`)
  } else {
    console.log(`날짜 해석 실패 0건 / 대상 ${scanned}건 (0.00%)`)
  }

  // '날짜 해석 실패'(월조차 못 구함)와는 다른 사유다 — 반드시 따로 보고한다.
  const droppedTotal = [...droppedNoDay.values()].reduce((a, b) => a + b, 0)
  if (droppedTotal > 0) {
    console.warn(`주간 채널 일자 미확인으로 제외한 리뷰: ${droppedTotal}건 (월 버킷으로 강등하지 않음)`)
    for (const [k, n] of [...droppedNoDay.entries()].sort((a, b) => b[1] - a[1])) {
      console.warn(`  · ${k} — ${n}건 제외`)
    }
  } else {
    console.log('주간 채널 일자 미확인 제외: 0건')
  }
  return buckets
}

// ota_score_dist·ota_complaints는 주·채널이 쌓일수록 커진다 — 여기도 끝까지 페이징한다.
// 조용히 1000행에서 잘리면 --fill-empty가 기존 행을 '없다'고 보고 덮어쓴다.
async function existingKeys(table: string): Promise<Set<string>> {
  const keys = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table)
      .select('property_id,week_start,granularity')
      .order('property_id', { ascending: true })
      .order('week_start', { ascending: true })
      .order('granularity', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    page.forEach((r: any) => keys.add(`${r.property_id}|${r.week_start}|${r.granularity ?? 'week'}`))
    if (page.length < PAGE_SIZE) break
  }
  return keys
}

async function runDist(buckets: Bucket[]) {
  const have = fillEmpty ? await existingKeys('ota_score_dist') : new Set<string>()
  let wrote = 0, skipped = 0

  for (const b of buckets) {
    if (b.ratings.length === 0) continue
    const k = `${b.propertyId}|${b.weekStart}|${b.granularity}`
    if (have.has(k)) { skipped++; continue }

    const { counts, avg, total } = distFromRatings(b.ratings, b.scoreMax)
    const row = {
      property_id: b.propertyId, week_start: b.weekStart, granularity: b.granularity,
      ...counts, weekly_avg_score: avg,
    }
    console.log(`${b.branch} ${b.ota} ${b.weekStart}(${b.granularity}) — ${total}건 avg ${avg} ` +
      distColumnsFor(b.scoreMax).map(c => `${c.replace('score_','')}:${counts[c]}`).filter(s => !s.endsWith(':0')).join(' '))

    if (!dryRun) {
      const { error } = await db.from('ota_score_dist').upsert(row, { onConflict: 'property_id,week_start,granularity' })
      if (error) throw error
      wrote++
    }
  }
  console.log(`\n점수 분포 — 기록 ${wrote}건 · 기존 보존 ${skipped}건${dryRun ? ' (dry-run)' : ''}`)
}

async function runEmitText(buckets: Bucket[], path: string) {
  const have = fillEmpty ? await existingKeys('ota_complaints') : new Set<string>()
  const payload = buckets
    .filter(b => b.texts.length > 0)
    .filter(b => !have.has(`${b.propertyId}|${b.weekStart}|${b.granularity}`))
    .map(b => ({
      propertyId: b.propertyId, branch: b.branch, ota: b.ota,
      weekStart: b.weekStart, granularity: b.granularity,
      scoreMax: b.scoreMax, reviews: b.texts,
    }))
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`분석 대상 ${payload.length}개 버킷 · 리뷰 ${payload.reduce((s, p) => s + p.reviews.length, 0)}건 → ${path}`)
}

async function runApplyText(path: string) {
  const results = JSON.parse(readFileSync(path, 'utf8')) as {
    propertyId: number; weekStart: string; granularity: Granularity
    roomComplaints: number; bathroomComplaints: number; memo: string
    voc: { band: string; sentiment: 'good' | 'bad'; keyword: string }[]
  }[]

  for (const r of results) {
    if (dryRun) { console.log(`(dry-run) ${r.propertyId} ${r.weekStart} 객실 ${r.roomComplaints} 욕실 ${r.bathroomComplaints} VOC ${r.voc.length}`); continue }

    const { error: cErr } = await db.from('ota_complaints').upsert({
      property_id: r.propertyId, week_start: r.weekStart, granularity: r.granularity,
      room_complaints: r.roomComplaints, bathroom_complaints: r.bathroomComplaints, memo: r.memo,
    }, { onConflict: 'property_id,week_start,granularity' })
    if (cErr) throw cErr

    // VOC는 누적이 아니라 대체 — 같은 키의 기존 행을 지우고 다시 넣는다.
    // ota_voc는 unique 제약이 없어(키 하나에 여러 키워드 행이 정상) delete 실패를 놓치면
    // 기존 행이 남은 채 insert가 더해져 중복 데이터가 쌓인다. delete 에러는 반드시 확인한다.
    const { error: dErr } = await db.from('ota_voc').delete()
      .eq('property_id', r.propertyId).eq('week_start', r.weekStart).eq('granularity', r.granularity)
    if (dErr) throw new Error(`ota_voc 기존 행 삭제 실패 (property ${r.propertyId} ${r.weekStart}): ${dErr.message}`)

    // delete 성공 후 insert가 실패하면 기존 행은 이미 삭제된 상태로 복구되지 않는다(비원자적).
    // Supabase JS 클라이언트에 트랜잭션 수단이 없고, 데이터는 이 배치로 재생성 가능하므로 의도적으로 감수한다.
    if (r.voc.length > 0) {
      const { error: vErr } = await db.from('ota_voc').insert(
        r.voc.map(v => ({
          property_id: r.propertyId, week_start: r.weekStart, granularity: r.granularity,
          band: v.band, sentiment: v.sentiment, keyword: v.keyword,
        }))
      )
      if (vErr) throw vErr
    }
  }
  console.log(`불만·VOC ${results.length}개 버킷 적재 완료${dryRun ? ' (dry-run)' : ''}`)
}

async function main() {
  if (applyText) { await runApplyText(applyText); return }
  const buckets = await buildBuckets()
  console.log(`버킷 ${buckets.length}개 구성 (최근 ${weeks}주)\n`)
  if (emitText) { await runEmitText(buckets, emitText); return }
  await runDist(buckets)
}

main().catch(e => { console.error(e); process.exit(1) })
