/**
 * raw_reviews에서 OTA 상세 탭 데이터를 파생한다.
 *
 *   npm run derive:ota -- --weeks 4 --fill-empty            점수 분포 적재
 *   npm run derive:ota -- --weeks 4 --dry-run               적재 없이 출력만
 *   npm run derive:ota -- --weeks 4 --emit-text buckets.json  불만·VOC용 본문 묶음 출력
 *   npm run derive:ota -- --apply-text results.json --fill-empty  분석 결과 적재
 *
 * --branch / --ota 는 '이것만' 고르는 필터고, --exclude 는 '이것만 빼는' 필터다.
 *   npm run derive:ota -- --weeks 12 --fill-empty --exclude 신설:Agoda
 *   npm run derive:ota -- --weeks 12 --fill-empty --exclude 신설:Agoda,동대문:Booking
 * 제외는 세 경로(분포·본문 추출·본문 적재)에 똑같이 걸린다 — 같은 명령이 경로마다
 * 다르게 동작하면 한 번은 비워 둔 구간을 다음 실행이 채워 버린다.
 *
 * 점수 분포는 LLM을 타지 않는다 — 재실행 시 값이 같아야 하고 검산이 가능해야 한다.
 *
 * --fill-empty 는 '수기 입력을 보호한다'는 뜻이다(행의 존재 여부가 아니라 출처로 판단).
 * 각 행은 source 컬럼에 'manual'(사람이 넣음) 또는 'derived'(이 배치가 씀)를 달고 있고,
 * 이 배치가 쓰는 행은 항상 'derived'다. --fill-empty를 붙이면:
 *   · source='manual' 행 — 절대 건드리지 않는다.
 *   · source='derived' 행 — 점수 분포는 매번 다시 계산해 덮어쓴다(LLM을 타지 않아 싸고 결정론적).
 *                           불만·VOC는 '미확정' 버킷일 때만 다시 분석한다(사람·LLM 비용).
 * 붙이지 않으면 수기 입력까지 덮어쓴다 — 몇 건이 걸리는지 경고로 알린다.
 *
 * 출처는 표마다 따로 읽고 따로 판정한다. UI가 불만(ota_complaints)과 VOC(ota_voc)를
 * 서로 다른 모달·라우트로 저장해 한쪽만 사람이 고쳐 놓을 수 있기 때문이다. 불만 행의 출처로
 * VOC 삭제까지 결정하면, 손으로 넣은 VOC가 '불만 행이 없다'는 남의 사정으로 통째로 지워진다.
 *
 * '행이 있으면 건너뛴다'로 하지 않는 이유: 대상 주에는 항상 아직 끝나지 않은 이번 주가 들어
 * 있어, 첫 실행이 쓴 부분값(7일 중 3일)이 영구히 굳는다. 뒤늦게 들어오는 리뷰도 같은 이유로
 * 영영 반영되지 않는다(에어비앤비 실측: 한 달치의 14~52%가 그 달이 끝난 뒤 적재됐다).
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
  recentWeekStarts, monthsCovering, isUnsettledBucket, SETTLE_GRACE_DAYS,
  mergeSource, planDetailWrite, isWriteAction, WRITE_ACTION_LABEL,
  OTA_SITE_BY_NAME, granularityForSite,
  parseExclusions, isExcludedPair, formatExclusion,
  type Granularity, type DetailSource, type WriteAction, type OtaExclusion,
} from '../lib/otaDetail'

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

// 인자 검증을 접속 정보 확인보다 먼저 한다 — 오타 난 명령이 접속 오류로만 보이지 않게.
const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)

// 값을 받는 옵션. 값이 없거나 다음 토큰이 또 다른 플래그면 즉시 종료한다.
// 조용히 undefined로 흘리면 `--weeks --dry-run`이 '--dry-run'을 주 수로 먹고,
// `--branch`만 쓴 실행은 필터 없이 전 지점을 도는 사고가 난다.
const opt = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  if (i < 0) return undefined
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('--')) {
    die(`--${n} 에는 값이 필요합니다 (받은 값: ${v ?? '없음'})`)
  }
  return v
}

// 여러 번 쓸 수 있는 옵션(--exclude). opt()는 첫 번째 것만 보므로 따로 모은다.
// 값 검사는 opt()와 같다 — `--exclude --dry-run` 같은 실수가 조용히 통과하면
// 제외했다고 믿은 조합이 그대로 파생 대상이 된다.
const optAll = (n: string): string[] => {
  const out: string[] = []
  argv.forEach((tok, i) => {
    if (tok !== `--${n}`) return
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) {
      die(`--${n} 에는 값이 필요합니다 (받은 값: ${v ?? '없음'})`)
    }
    out.push(v)
  })
  return out
}

// NaN이 흘러 들어가면 대상 주가 0개 → .in() 필터가 비어 0행 → "버킷 0개"가
// 성공처럼 보인다. 파싱 실패는 조용히 넘기지 않고 비정상 종료한다.
const weeksRaw = opt('weeks')
if (weeksRaw !== undefined && !/^\d+$/.test(weeksRaw)) {
  die(`--weeks 는 1 이상의 정수여야 합니다 (받은 값: ${weeksRaw})`)
}
const weeks = weeksRaw === undefined ? 4 : parseInt(weeksRaw, 10)
if (!Number.isFinite(weeks) || weeks < 1) {
  die(`--weeks 는 1 이상의 정수여야 합니다 (받은 값: ${weeksRaw})`)
}

const dryRun    = flag('dry-run')
const fillEmpty = flag('fill-empty')
const onlyBranch = opt('branch')
const onlyOta    = opt('ota')
const emitText   = opt('emit-text')
const applyText  = opt('apply-text')

// 형식·채널명 오타는 여기서 즉시 비정상 종료한다. 조용히 '아무것도 제외하지 않음'으로
// 떨어지면, 비워 두기로 한 구간 위에 파생 행이 그대로 쓰인다.
let exclusions: OtaExclusion[] = []
try {
  exclusions = parseExclusions(optAll('exclude'))
} catch (e) {
  die((e as Error).message)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / KEY 환경변수가 필요합니다')
const db = createClient(url, key)

interface Bucket {
  propertyId: number
  branch: string
  ota: string
  scoreMax: number
  weekStart: string
  granularity: Granularity
  ratings: number[]
  // 밴드(10점/9점대/…) 판정은 본문 톤이 아니라 이 rating으로 한다 — --emit-text가
  // 그대로 실어 내보내므로 분석자가 raw_reviews를 따로 조회할 필요가 없다.
  // rating이 없는 리뷰는 0으로 채우지 않고 필드 자체를 비운다(허위 0점 방지).
  texts: { content: string; rating?: number }[]
}

// 오늘 날짜는 실행자의 로컬 달력(KST)으로 정하고, 이후 주·월 계산은 전부 UTC로만 한다.
// new Date()(로컬)와 toISOString()(UTC)을 섞으면 KST 09시 이전 실행에서 '오늘'이
// 전날로 밀려, 월요일 오전 실행 시 이번 주가 대상에서 통째로 빠진다.
function todayIsoLocal(): string {
  const n = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}

// '오늘'은 실행당 한 번만 정한다. 대상 주 계산과 '미확정 버킷' 판정이 각자
// new Date()를 부르면, 자정을 걸친 실행에서 한 실행이 서로 다른 날짜를 믿게 된다.
const TODAY = todayIsoLocal()

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
// 빈 페이지가 올 때까지 range로 끝까지 읽는다.
// 종료 조건을 'PAGE_SIZE보다 적게 왔다'로 두면 서버 db-max-rows가 클라이언트
// 페이지 크기보다 작게 내려간 순간 첫 페이지에서 멈춰 또 조용히 잘린다.
// 실제로 받은 행 수만큼만 offset을 밀고, 빈 페이지에서만 끝낸다.
// 페이지 경계가 흔들리지 않도록 정렬을 고정한다(정렬 없는 페이징은 행 누락·중복을 만든다).
async function fetchRawReviews(branch: string, site: string, months: string[]): Promise<RawRow[]> {
  const out: RawRow[] = []
  for (let from = 0; ;) {
    const { data, error } = await db
      .from('raw_reviews')
      .select('reviewer,raw_date,review_month,rating,content')
      .eq('branch', branch).eq('ota_site', site)
      .in('review_month', months)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as RawRow[]
    if (page.length === 0) break
    out.push(...page)
    from += page.length
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

// 제외 지정이 실제로 무엇을 걸렀는지 조합별로 찍는다 — '걸렸겠지'를 믿지 않게.
// 어느 하나라도 ota_properties에서 짚이는 조합이 없으면 비정상 종료한다. 오타 난 제외는
// 아무것도 제외하지 못한 채 실행이 성공한 것처럼 끝나는 것이 가장 나쁜 결과다.
// 지점×채널 대조는 --branch/--ota 필터를 적용하기 전 전체 목록으로 한다
// (다른 필터에 이미 걸려 나간 조합을 '오타'로 오판하지 않기 위해서다).
function reportExclusions(props: { branch: string; ota_name: string }[]) {
  if (exclusions.length === 0) return
  console.log(`제외 지정 ${exclusions.length}건 — 이번 실행에서 건드리지 않습니다`)
  for (const e of exclusions) {
    const n = props.filter(p => p.branch === e.branch && p.ota_name === e.ota).length
    if (n === 0) {
      die(`--exclude ${formatExclusion(e)} 에 해당하는 지점×채널이 ota_properties에 없습니다 — ` +
          '오타로 아무것도 제외되지 않는 사고를 막기 위해 실행을 중단합니다')
    }
    console.log(`  · ${e.branch} ${e.ota} — 제외(대상 property ${n}개)`)
  }
}

async function buildBuckets(): Promise<Bucket[]> {
  const targetWeeks = recentWeekStarts(TODAY, weeks)
  // 주 시작일의 달만 모으면 최신 주가 월 경계를 걸칠 때 이번 달이 통째로 빠진다
  // (예: 8/1 실행 → 마지막 주 시작 7/27 → 2026-08이 review_month 필터에서 누락).
  // 주 구간 전체(월~일)가 닿는 달을 모두 대상으로 삼는다.
  const targetMonths = monthsCovering(targetWeeks)
  console.log(`대상 주 ${targetWeeks.join(', ')}`)
  console.log(`대상 월 ${targetMonths.join(', ')} (주 구간 전체 기준)`)

  // ota_properties는 지점×채널 수준이라 구조적으로 수십 행 — 페이징 불필요
  const { data: props, error: pErr } = await db
    .from('ota_properties').select('property_id,branch,ota_name,score_max').eq('active', true)
  if (pErr) throw pErr
  reportExclusions(props ?? [])

  const buckets: Bucket[] = []
  let unparsed = 0
  let scanned = 0
  // 주간 채널에서 일자를 못 구해 제외한 행 수 — 채널별로 따로 센다
  const droppedNoDay = new Map<string, number>()

  for (const p of props ?? []) {
    if (onlyBranch && p.branch !== onlyBranch) continue
    if (onlyOta && p.ota_name !== onlyOta) continue
    // 제외 조합은 raw 조회조차 하지 않는다 — 버킷이 만들어지지 않아야 쓰기 경로에
    // 흘러들 여지가 없다(분포·본문 추출이 모두 이 함수의 결과만 본다).
    if (isExcludedPair(exclusions, p.branch, p.ota_name)) continue
    const site = OTA_SITE_BY_NAME[p.ota_name]
    if (!site) { console.warn(`매핑 없는 채널: ${p.ota_name} — 건너뜀`); continue }

    const raw = await fetchRawReviews(p.branch, site, targetMonths)

    // 입도는 채널이 정한다 — 행 단위로 정하면 일자 못 구한 리뷰 하나가 주간 채널에
    // 월 버킷을 끼워 넣어, 한 채널에 '7월'과 '07/14' 라벨이 섞이고 월간 뷰에서
    // React 키가 중복된다. 규칙의 정본은 lib/otaDetail.ts — 입력 모달도 같은 함수를 쓴다.
    const granularity: Granularity = granularityForSite(site)
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
      if (r.content && r.content.trim().length > 5) {
        // rating이 없으면 키 자체를 넣지 않는다(undefined는 JSON.stringify가 드롭한다) —
        // 0점으로 채우면 실제 1점 리뷰와 구분이 안 돼 밴드 오판정을 만든다.
        const entry: { content: string; rating?: number } = { content: r.content.trim() }
        if (r.rating != null) entry.rating = Number(r.rating)
        b.texts.push(entry)
      }
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

// ota_score_dist·ota_complaints·ota_voc는 주·채널이 쌓일수록 커진다 — 여기도 끝까지 페이징한다.
// 조용히 1000행에서 잘리면 기존 수기 행을 '없다'고 보고 덮어쓴다.
// (fetchRawReviews와 같은 이유로 종료 조건은 '빈 페이지'다.)
//
// 키만이 아니라 출처(source)까지 읽는다 — 보호 여부는 '행이 있는가'가 아니라
// '누가 썼는가'로 정한다. source가 없거나 값이 이상하면 보수적으로 manual로 본다
// (사람이 넣은 값을 덮어쓰는 쪽이 훨씬 비싼 실수다).
//
// ota_voc는 키 하나에 키워드 행이 여러 개다 — 마지막 행이 이기게 두면 수기·파생이 섞인 키가
// 정렬 순서에 따라 derived로 보인다. mergeSource로 '한 행이라도 수기면 manual'로 합친다.
//
// 페이징 정렬은 반드시 '유일한' 키로 한다. (property_id, week_start, granularity)는
// ota_voc에서 전순서가 아니다 — 한 키에 키워드 행이 여럿이라 값이 같은 행들이 페이지
// 경계에 걸치면 서버가 그 안에서 어떤 순서로 돌려줘도 규격 위반이 아니라, 경계에 걸친
// 행이 통째로 건너뛰어질 수 있다. 그 키의 유일한 행이 건너뛰어지면 planDetailWrite가
// undefined를 받아 '신규'로 보고, 손으로 넣은 VOC를 지우고 파생값으로 덮어쓴다.
// fetchRawReviews와 같은 이유로 유일 컬럼인 id로 정렬한다.
async function existingSources(table: string): Promise<Map<string, DetailSource>> {
  const out = new Map<string, DetailSource>()
  for (let from = 0; ;) {
    const { data, error } = await db.from(table)
      .select('property_id,week_start,granularity,source')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    if (page.length === 0) break
    page.forEach((r: any) => {
      const k = `${r.property_id}|${r.week_start}|${r.granularity ?? 'week'}`
      out.set(k, mergeSource(out.get(k), r.source === 'derived' ? 'derived' : 'manual'))
    })
    from += page.length
  }
  return out
}

// --fill-empty 없이 수기 입력을 덮어쓰려 할 때 몇 건이 걸리는지 알린다.
// 파생 주 라벨은 손으로 넣은 아고다 라벨과 한 주 어긋나 있고 평균 산식도 다르다 —
// 플래그 하나 빠뜨린 실행이 수기 데이터를 다른 축의 값으로 덮어쓸 수 있다.
// (이 배치가 쓴 derived 행은 언제든 다시 만들 수 있으므로 경고 대상이 아니다.)
function warnOverwrite(table: string, manualCollide: number) {
  if (fillEmpty || manualCollide === 0) return
  const bar = '='.repeat(72)
  console.warn('')
  console.warn(bar)
  console.warn(`[경고] --fill-empty 없이 실행 중 — ${table} 수기 입력(source=manual) ${manualCollide}건을 덮어씁니다`)
  console.warn('       손으로 넣은 값(주 라벨·평균 산식이 다를 수 있음)이 파생값으로 대체됩니다.')
  console.warn('       수기 입력을 보존하려면 --fill-empty 를 붙여 다시 실행하세요.')
  if (dryRun) console.warn('       (dry-run이라 이번 실행은 쓰지 않습니다)')
  console.warn(bar)
  console.warn('')
}

// 판정별 건수. 판정이 서로 배타적이므로 이 다섯 칸의 합은 항상 '대상 버킷 수'와 같다.
type Tally = Record<WriteAction, number>
const newTally = (): Tally =>
  ({ 'new': 0, 'refresh': 0, 'overwrite': 0, 'skip-manual': 0, 'skip-settled': 0 })
const writtenOf = (t: Tally) => t['new'] + t.refresh + t.overwrite
const totalOf   = (t: Tally) => writtenOf(t) + t['skip-manual'] + t['skip-settled']

async function runDist(buckets: Bucket[]) {
  // --fill-empty 여부와 무관하게 기존 행의 출처를 읽는다 — 무엇을 덮어쓰는지 세어 알리기 위해서다.
  const have = await existingSources('ota_score_dist')
  const writable = buckets.filter(b => b.ratings.length > 0)
  warnOverwrite('ota_score_dist',
    writable.filter(b => have.get(`${b.propertyId}|${b.weekStart}|${b.granularity}`) === 'manual').length)

  // 점수 분포는 LLM을 타지 않아 재계산이 사실상 공짜다. 그래서 '확정/미확정'을 따지지 않고
  // (unsettled: true 고정) 자기가 쓴(derived) 행은 매 실행 다시 계산한다 — 끝나지 않은 구간의
  // 부분값도, 뒤늦게 들어온 리뷰도 다음 실행에서 저절로 교정된다.
  // 보호 대상은 오직 수기 입력(manual)이다.
  const tally = newTally()

  for (const b of writable) {
    const act = planDetailWrite(
      have.get(`${b.propertyId}|${b.weekStart}|${b.granularity}`),
      { fillEmpty, unsettled: true },
    )
    tally[act]++
    if (!isWriteAction(act)) continue

    // 부동소수점 덧셈은 결합법칙이 성립하지 않는다 — 반올림 경계에 걸린 버킷은
    // 더하는 순서만 바뀌어도 평균이 뒤집힌다. raw_reviews.id는 랜덤 UUID라
    // 재적재만으로 순서가 바뀌므로, 정렬로 '값의 집합'에만 의존하게 만든다.
    const ratings = [...b.ratings].sort((x, y) => x - y)
    const { counts, avg, total } = distFromRatings(ratings, b.scoreMax)
    const row = {
      property_id: b.propertyId, week_start: b.weekStart, granularity: b.granularity,
      ...counts, weekly_avg_score: avg, source: 'derived',
    }
    console.log(`${b.branch} ${b.ota} ${b.weekStart}(${b.granularity}) — ${total}건 avg ${avg} ` +
      distColumnsFor(b.scoreMax).map(c => `${c.replace('score_','')}:${counts[c]}`).filter(s => !s.endsWith(':0')).join(' '))

    if (!dryRun) {
      const { error } = await db.from('ota_score_dist').upsert(row, { onConflict: 'property_id,week_start,granularity' })
      if (error) throw error
    }
  }
  // 기록은 '신규 + 파생 재계산 + 수기 덮어씀'의 합이다 — 내역을 함께 적어 합이 맞는지 보이게 한다.
  // (분포는 확정 버킷을 건너뛰지 않으므로 skip-settled는 구조적으로 0이다.)
  console.log(`\n점수 분포 — ${dryRun ? '기록 예정' : '기록'} ${writtenOf(tally)}건` +
    `(신규 ${tally['new']} · 파생 재계산 ${tally.refresh} · 수기 덮어씀 ${tally.overwrite})` +
    ` · 수기 보존 ${tally['skip-manual']}건${dryRun ? ' (dry-run)' : ''}`)
}

async function runEmitText(buckets: Bucket[], path: string) {
  const empty = new Map<string, DetailSource>()
  const haveComplaints = fillEmpty ? await existingSources('ota_complaints') : empty
  const haveVoc        = fillEmpty ? await existingSources('ota_voc')        : empty
  const payload = buckets
    .filter(b => b.texts.length > 0)
    // 아래 --apply-text와 같은 규칙으로 걸러야 한다 — 여기서만 빼면 쓰기 경로의 조건이
    // 실제로는 한 번도 열리지 않고, 여기서만 넣으면 분석 비용만 치르고 버려진다.
    // 쓰기 경로가 불만·VOC를 따로 판정하므로, 한쪽이라도 쓸 수 있으면 분석 대상이다.
    .filter(b => {
      const key = `${b.propertyId}|${b.weekStart}|${b.granularity}`
      const unsettled = isUnsettledBucket(b.weekStart, b.granularity, TODAY)
      const cAct = planDetailWrite(haveComplaints.get(key), { fillEmpty, unsettled })
      const vAct = planDetailWrite(haveVoc.get(key), { fillEmpty, unsettled })
      const at = `${b.branch} ${b.ota} ${b.weekStart}(${b.granularity})`
      if (!isWriteAction(cAct) && !isWriteAction(vAct)) return false
      if (fillEmpty && (cAct === 'refresh' || vAct === 'refresh')) {
        console.log(`[미확정 재분석] ${at} — 구간이 끝난 지 ${SETTLE_GRACE_DAYS}일이 지나지 않아 다시 분석 대상에 넣습니다`)
      }
      if (isWriteAction(cAct) !== isWriteAction(vAct)) {
        console.log(`[분리 판정] ${at} — 불만 ${WRITE_ACTION_LABEL[cAct]} · VOC ${WRITE_ACTION_LABEL[vAct]} — 쓸 수 있는 쪽이 있어 분석 대상에 넣습니다`)
      }
      return true
    })
    .map(b => ({
      propertyId: b.propertyId, branch: b.branch, ota: b.ota,
      weekStart: b.weekStart, granularity: b.granularity,
      // reviews[]는 {content, rating} 쌍이다 — rating이 있어야 밴드(10점/9점대/…)를
      // 톤 추측이 아니라 실제 점수로 판정할 수 있다. rating 없는 리뷰는 필드가 비어 있다.
      scoreMax: b.scoreMax, reviews: b.texts,
    }))
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`분석 대상 ${payload.length}개 버킷 · 리뷰 ${payload.reduce((s, p) => s + p.reviews.length, 0)}건 → ${path}`)
}

interface TextResult {
  propertyId: number
  weekStart: string
  granularity?: Granularity
  roomComplaints?: number
  bathroomComplaints?: number
  memo?: string
  voc?: { band: string; sentiment: 'good' | 'bad'; keyword: string }[]
}

// 입도는 채널이 정한다 — 분포 경로와 같은 규칙(granularityForSite)을 여기서도 쓴다.
// JSON에 적힌 granularity를 그대로 믿으면, 손으로 고쳤거나 LLM이 만든 파일 하나가
// 주간 채널에 월 버킷을 되돌려 놓는다.
interface PropMeta {
  granularity: Granularity
  label: string
  branch: string
  ota: string
}

async function propertyMeta(): Promise<Map<number, PropMeta>> {
  const { data, error } = await db.from('ota_properties').select('property_id,branch,ota_name')
  if (error) throw error
  reportExclusions(data ?? [])
  const m = new Map<number, PropMeta>()
  for (const p of data ?? []) {
    const site = OTA_SITE_BY_NAME[p.ota_name]
    if (!site) continue
    m.set(p.property_id, {
      granularity: granularityForSite(site),
      label: `${p.branch} ${p.ota_name}`,
      branch: p.branch,
      ota: p.ota_name,
    })
  }
  return m
}

async function runApplyText(path: string) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed)) die(`${path} 의 최상위가 배열이 아닙니다`)
  const results = parsed as TextResult[]

  const meta = await propertyMeta()
  // 불만과 VOC는 UI에서 서로 다른 모달·라우트로 저장된다 — 두 표의 출처는 실제로 갈릴 수 있다.
  // 각자의 출처를 읽어 각자 판정한다(불만 행의 출처로 VOC 삭제를 결정하지 않는다).
  const haveComplaints = await existingSources('ota_complaints')
  const haveVoc        = await existingSources('ota_voc')

  // 1) 검증을 먼저 전부 끝낸다 — 한 건이라도 어긋나면 아무것도 쓰지 않고 종료한다.
  const allRows = results.map((r, i) => {
    const at = `${i + 1}번째 항목`
    if (typeof r?.propertyId !== 'number') die(`[${at}] propertyId 가 없거나 숫자가 아닙니다`)
    if (typeof r?.weekStart !== 'string' || !r.weekStart) die(`[${at}] weekStart 가 없습니다 (property ${r.propertyId})`)
    const info = meta.get(r.propertyId)
    if (!info) die(`[${at}] property_id ${r.propertyId} 를 ota_properties에서 찾을 수 없습니다`)
    if (r.granularity !== undefined && r.granularity !== info.granularity) {
      die(`[${info.label} ${r.weekStart}] JSON 입도 '${r.granularity}' 가 채널 입도 '${info.granularity}' 와 다릅니다 — ` +
          '입도는 채널이 정합니다. 파일을 고쳐 다시 실행하세요')
    }
    // voc 키가 아예 없는 JSON이 들어와도 중간에 TypeError로 터지지 않게 한다
    const voc = Array.isArray(r.voc) ? r.voc : []
    if (r.voc !== undefined && !Array.isArray(r.voc)) die(`[${info.label} ${r.weekStart}] voc 가 배열이 아닙니다`)
    return {
      propertyId: r.propertyId,
      weekStart: r.weekStart,
      granularity: info.granularity,
      label: info.label,
      branch: info.branch,
      ota: info.ota,
      roomComplaints: r.roomComplaints ?? 0,
      bathroomComplaints: r.bathroomComplaints ?? 0,
      memo: r.memo ?? '',
      voc,
    }
  })

  // 2) 제외 조합은 검증만 마친 뒤 여기서 통째로 뺀다 — 파일에 들어 있어도 쓰지 않는다.
  //    (분포·본문 추출과 같은 규칙이어야 한 번의 실행이 경로마다 다르게 동작하지 않는다.)
  const rows = allRows.filter(r => !isExcludedPair(exclusions, r.branch, r.ota))
  const droppedByExclude = allRows.length - rows.length
  if (droppedByExclude > 0) {
    console.log(`제외 지정으로 건너뛴 항목 ${droppedByExclude}개 (파일에는 있으나 쓰지 않습니다)`)
  }

  // 3) --fill-empty면 수기 입력을 건드리지 않는다. 아니면 덮어쓸 건수를 표별로 경고한다.
  //    VOC도 따로 경고한다 — 지워지는 것은 불만 행이 아니라 VOC 행이다.
  const keyOf = (r: { propertyId: number; weekStart: string; granularity: Granularity }) =>
    `${r.propertyId}|${r.weekStart}|${r.granularity}`
  warnOverwrite('ota_complaints', rows.filter(r => haveComplaints.get(keyOf(r)) === 'manual').length)
  warnOverwrite('ota_voc',        rows.filter(r => haveVoc.get(keyOf(r)) === 'manual').length)

  // 불만·VOC는 본문을 사람·LLM이 읽어야 나오는 값이라 재분석이 비싸다. 그래서 분포와 달리
  // 자기가 쓴(derived) 행도 '미확정'일 때만 다시 쓴다 — 구간이 아직 안 끝났거나 끝난 지
  // SETTLE_GRACE_DAYS일 이내라 뒤늦은 리뷰가 더 들어올 여지가 있는 버킷이다.
  // 확정된 버킷까지 매주 다시 분석하면 주간 루틴이 몇 달치 본문 값을 반복해서 치른다.
  //
  // 카운터는 표별로 따로 센다. 두 표의 판정이 갈릴 수 있으므로 합쳐 세면 어느 쪽이 몇 건
  // 걸렸는지 알 수 없고, 판정이 상호 배타적이라 각 표의 다섯 칸 합은 항상 대상 버킷 수와 같다.
  const cTally = newTally(), vTally = newTally()
  let diverged = 0

  for (const r of rows) {
    const key = keyOf(r)
    const unsettled = isUnsettledBucket(r.weekStart, r.granularity, TODAY)
    const cAct = planDetailWrite(haveComplaints.get(key), { fillEmpty, unsettled })
    const vAct = planDetailWrite(haveVoc.get(key), { fillEmpty, unsettled })
    cTally[cAct]++
    vTally[vAct]++

    const at = `${r.label} ${r.weekStart}(${r.granularity})`
    // '미확정이라 다시 쓴다'는 --fill-empty에서만 성립하는 사유다. 플래그가 없으면 확정 버킷도
    // 어차피 다시 쓰므로, 여기서 이 문구를 찍으면 확정된 구간에 거짓 사유가 붙는다.
    if (fillEmpty && (cAct === 'refresh' || vAct === 'refresh')) {
      console.log(`[미확정 재분석] ${at} — 구간이 끝난 지 ${SETTLE_GRACE_DAYS}일이 지나지 않아 기존 파생 행을 다시 씁니다`)
    }
    // 한쪽만 처리하고 조용히 넘어가지 않는다 — 반쪽만 쓴 실행은 로그에서 바로 보여야 한다.
    if (cAct !== vAct) {
      diverged++
      const half = isWriteAction(cAct) === isWriteAction(vAct) ? '' : ' — 한쪽만 처리합니다'
      console.log(`[분리 판정] ${at} — 불만 ${WRITE_ACTION_LABEL[cAct]} · VOC ${WRITE_ACTION_LABEL[vAct]} (두 표의 출처가 다릅니다)${half}`)
    }

    const desc = (act: WriteAction, body: string) =>
      isWriteAction(act) ? `${WRITE_ACTION_LABEL[act]}(${body})` : WRITE_ACTION_LABEL[act]
    console.log(`${dryRun ? '(dry-run) ' : ''}${at} ` +
      `불만 ${desc(cAct, `객실 ${r.roomComplaints} 욕실 ${r.bathroomComplaints}`)} · ` +
      `VOC ${desc(vAct, `${r.voc.length}건`)}`)

    if (dryRun) continue

    if (isWriteAction(cAct)) {
      const { error: cErr } = await db.from('ota_complaints').upsert({
        property_id: r.propertyId, week_start: r.weekStart, granularity: r.granularity,
        room_complaints: r.roomComplaints, bathroom_complaints: r.bathroomComplaints, memo: r.memo,
        source: 'derived',
      }, { onConflict: 'property_id,week_start,granularity' })
      if (cErr) throw cErr
    }

    // VOC 판정이 보류면 delete도 insert도 하지 않는다 — 사람이 넣은 키워드가 남아 있어야 한다.
    if (isWriteAction(vAct)) {
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
            band: v.band, sentiment: v.sentiment, keyword: v.keyword, source: 'derived',
          }))
        )
        if (vErr) throw vErr
      }
    }
  }

  // 표마다 '기록 = 신규 + 파생 재분석 + 수기 덮어씀', '보류 = 수기 보존 + 확정 버킷 건너뜀'.
  // 다섯 칸은 겹치지 않고 빠지지도 않으므로 합계가 대상 버킷 수와 같아야 한다 — 그 검산을 같이 찍는다.
  const line = (label: string, t: Tally) =>
    `${label} — ${dryRun ? '기록 예정' : '기록'} ${writtenOf(t)}건` +
    `(신규 ${t['new']} · 파생 재분석 ${t.refresh} · 수기 덮어씀 ${t.overwrite})` +
    ` · 수기 보존 ${t['skip-manual']}건 · 확정 버킷 건너뜀 ${t['skip-settled']}건` +
    ` · 합계 ${totalOf(t)}/${rows.length}`
  console.log(`\n대상 버킷 ${rows.length}개 · 불만/VOC 판정이 갈린 버킷 ${diverged}개${dryRun ? ' (dry-run)' : ''}`)
  console.log(line('불만', cTally))
  console.log(line('VOC ', vTally))
}

async function main() {
  if (applyText) { await runApplyText(applyText); return }
  const buckets = await buildBuckets()
  console.log(`버킷 ${buckets.length}개 구성 (최근 ${weeks}주)\n`)
  if (emitText) { await runEmitText(buckets, emitText); return }
  await runDist(buckets)
}

main().catch(e => { console.error(e); process.exit(1) })
