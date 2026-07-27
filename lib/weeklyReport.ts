// 주간 OTA 리포트 계산 로직 (FO Weekly 260721 결정 반영)
//
// 왜 만들었나: 월 평균 점수로는 아무것도 못 한다. 채널의 종합 점수는 누적값이라
// 몇 달을 봐도 소수점 한 자리가 겨우 움직이고, 움직인 뒤에는 이미 손쓸 시점이 지났다.
// 미팅에서 합의한 축은 '그 주에 리뷰를 쓴 사람들' — 몇 명이 썼고 몇 점을 줬는가다.
//
// 판정 규칙: 그 주 리뷰어들의 평균이 그 채널 자신의 누적 점수보다 낮으면 점수를
// 끌어내리는 주 → 원인 확인 대상. 같거나 높으면 그 주는 논의하지 않는다.
//
// 🔴 기준선은 반드시 '그 채널 자신의 누적 점수'다. 고정 상수(예: 9.0)를 쓰면 안 된다 —
//    실측 폭이 4.00(신설 NOL, 5점제)부터 9.30(제주시티 Trip.com, 10점제)까지다.
//    같은 채널의 두 값을 비교하므로 5점제·10점제가 섞여도 환산이 필요 없다.

// 상대 경로로 가져온다 — vitest 는 '@/' 별칭을 풀지 않아, 별칭으로 쓰면
// 이 모듈을 import 하는 순간 테스트 파일 전체가 로드조차 되지 않는다.
import type { Granularity } from './otaDetail'
import { distColumnsFor, bucketPeriodStart, bucketPeriodEnd, monthStartOf, addDaysIso, granularityForOtaName } from './otaDetail'

// ── 입력 행 (DB 표 모양 그대로) ────────────────────────────────────

export interface PropertyRow {
  property_id: number
  branch: string
  ota_name: string
  score_max: number
}

export interface DistRow {
  property_id: number
  week_start: string
  granularity: Granularity
  source: 'manual' | 'derived'
  weekly_avg_score: number | string | null
  [scoreCol: string]: unknown
}

export interface ScoreSnapshotRow {
  property_id: number
  overall_score: number | string | null
  review_count: number | null
  recorded_at: string
}

export interface ComplaintRow {
  property_id: number
  week_start: string
  granularity: Granularity
  headline: string | null
  memo: string | null
}

export interface VocRow {
  property_id: number
  week_start: string
  granularity: Granularity
  sentiment: string | null
  keyword: string | null
  band: string | null
}

// ── 출력 타입 ──────────────────────────────────────────────────────

// 'unknown' = 기준선(스냅샷)이 없어 판정 자체가 불가능한 상태.
// 통과로도 미달로도 세지 않는다 — 스냅샷 수집이 안 된 채널을 '이상 없음'으로 읽으면
// 바로 그 채널이 영영 리뷰 대상에서 빠진다.
export type WeeklyVerdict = 'below' | 'onOrAbove' | 'unknown'

export const VERDICT_LABEL: Record<WeeklyVerdict, string> = {
  below:     '기준선 미달',
  onOrAbove: '기준선 이상',
  unknown:   '기준선 없음',
}

// weekly_avg_score 를 누가 어떻게 냈는가.
//   exact  — 파생 배치(derived)가 실제 rating 의 산술 평균으로 계산한 값
//   approx — 사람이 UI로 넣은 행(manual). 밴드 개수만 알고 원 rating 을 모르므로
//            밴드 대표값 가중 근사다. 같은 열에 담겨 있지만 추정량이 다르다.
// 소비자(화면)가 이걸 알아야 하는 이유: 근사값은 밴드 폭(10점제 1점)만큼 흔들릴 수 있어
// 기준선과 0.1~0.5 차이로 갈리는 판정을 근사값 하나로 단정하면 안 된다.
export type AvgEstimator = 'exact' | 'approx'

export const ESTIMATOR_LABEL: Record<AvgEstimator, string> = {
  exact:  '실측 평균',
  approx: '밴드 근사(수기)',
}

// 표본이 얇다고 판정에서 빼지 않는다. 1건 4.4점은 진짜 나쁜 리뷰 한 건이고,
// 그걸 감추면 리포트가 존재할 이유가 없다. 다만 그 -4.5 격차는 '추세'가 아니므로
// 화면이 건수를 격차만큼 크게 보여 줄 수 있도록 플래그만 내려보낸다.
// 🔴 이 값을 필터로 쓰지 말 것 — 최소 표본 컷을 두는 순간 진짜 악평이 조용히 사라진다.
export const THIN_SAMPLE_MAX = 2

export function isThinSample(reviewCount: number): boolean {
  return reviewCount > 0 && reviewCount <= THIN_SAMPLE_MAX
}

// 미달 주의 원인. 원인이 기록되지 않은 미달 주는 실재하는 상태다(신설 Trip.com
// 2026-07-20: 6.00 vs 8.70인데 메모도 bad 키워드도 없다). null 로 접어 숨기지 않고
// hasCause=false 로 내려보내 화면이 '원인 미기록'을 그대로 띄우게 한다.

// 결론 한 줄이 어디서 왔는가. 화면이 근사도를 알 필요는 없지만, 폴백이 걸린 주를
// 디버깅할 때 '저장된 값이 없어서 memo를 잘랐다'가 데이터로 남아 있어야 한다.
export type HeadlineSource = 'headline' | 'memoHead' | 'keywords'

// 한 줄이 이보다 길면 회의 화면에서 두 줄로 접히고, 그 순간 카드가 목록이 된다.
export const HEADLINE_MAX = 60

export interface WeeklyCause {
  headline: string | null              // 결론 자리에 그대로 출력
  headlineSource: HeadlineSource | null
  detail: string | null                // memo 전문 — 펼침 안
  badKeywords: string[]                // 펼침 안 보조
  hasCause: boolean
}

/** 여러 줄·연속 공백을 한 칸으로 접고, max를 넘으면 잘라 '…'을 붙인다. */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.substring(0, max) + '…'
}

/**
 * 결론 한 줄을 고른다. 저장된 headline이 없는 과거 주를 깨뜨리지 않기 위한 폴백이다.
 *
 * 1) headline 이 있으면 그대로
 * 2) memo 의 첫 '—'(em dash) 앞부분 — 파생 배치가 「원인 — 처방」으로 쓰므로 앞이 원인이다
 * 3) bad 키워드 상위 2개
 * 4) 없음 → 원인 미기록
 *
 * 🔴 2)를 정본으로 삼지 말 것. LLM이 memo 형식을 바꾸면 조용히 깨지고, 수기 memo는
 *    애초에 '—' 구조가 아닌 리뷰어별 서술 문단이다. 그래서 headline 컬럼을 만들었다.
 *    여기서는 잘라서라도 한 줄을 만들어 과거 주가 빈 카드로 뜨지 않게만 한다.
 */
export function resolveHeadline(
  headline: string | null | undefined,
  memo: string | null | undefined,
  badKeywords: string[],
): { headline: string | null; headlineSource: HeadlineSource | null } {
  const h = (headline ?? '').trim()
  if (h) return { headline: oneLine(h, HEADLINE_MAX), headlineSource: 'headline' }

  const m = (memo ?? '').trim()
  if (m) {
    // '—'로 시작하는 memo면 앞부분이 빈 문자열이 된다 — 그때는 전문을 쓴다.
    const head = m.split('—')[0].trim() || m
    return { headline: oneLine(head, HEADLINE_MAX), headlineSource: 'memoHead' }
  }

  const k = badKeywords.map(s => s.trim()).filter(Boolean).slice(0, 2)
  if (k.length > 0) return { headline: k.join(' · '), headlineSource: 'keywords' }

  return { headline: null, headlineSource: null }
}

export interface WeeklyChannelRow {
  propertyId: number
  branch: string
  otaName: string
  scoreMax: number
  granularity: Granularity
  weekStart: string          // 주 버킷은 그 주 월요일, 월 버킷은 그 달 1일
  bucketEnd: string          // 버킷이 덮는 마지막 날

  reviewCount: number        // 그 주에 쓰인 리뷰 수 (밴드 열 합)
  weekAvg: number            // 그 주 리뷰어들의 평균
  estimator: AvgEstimator
  thinSample: boolean

  baseline: number | null    // 그 채널의 누적 종합 점수
  baselineRecordedAt: string | null
  baselineIsFallback: boolean // 버킷 종료일 이전 스냅샷이 없어 최초 스냅샷을 빌려 씀
  gap: number | null         // weekAvg - baseline (소수 2자리)
  verdict: WeeklyVerdict

  prevWeekStart: string | null
  prevWeekAvg: number | null
  prevReviewCount: number | null
  wow: number | null         // 이번 주 평균 - 직전 버킷 평균 (소수 2자리)

  cause: WeeklyCause | null  // 미달 주에만 채운다
}

// 그 주에 리뷰가 한 건도 없는 채널. 통과도 미달도 아니다 —
// silent 를 통과 쪽에 합치면 '이번 주 이상 없는 채널 20개'처럼 읽혀
// 실제로는 아무 목소리도 없었다는 사실이 통과로 둔갑한다.
export interface SilentChannel {
  propertyId: number
  branch: string
  otaName: string
  granularity: Granularity
}

export interface WeeklyReportSummary {
  belowCount: number
  onOrAboveCount: number
  unknownCount: number
  monthlyCount: number
  silentCount: number
  reviewTotal: number        // 주간 채널이 그 주에 받은 리뷰 총 건수
}

export interface WeeklyReport {
  weekStart: string
  weekEnd: string
  label: string              // '7월 3주차 (07/20~07/26)'
  below: WeeklyChannelRow[]      // 미달 — 격차 큰 순
  onOrAbove: WeeklyChannelRow[]  // 이상 — 격차 큰 순
  unknown: WeeklyChannelRow[]    // 기준선 없음
  monthly: WeeklyChannelRow[]    // 월 단위 채널(주간 분해 불가) — 참고용
  silent: SilentChannel[]        // 리뷰 0건
  summary: WeeklyReportSummary
}

export interface WeeklyReportInput {
  weekStart: string
  properties: PropertyRow[]      // active=true 만 넘긴다
  dist: DistRow[]
  scores: ScoreSnapshotRow[]
  complaints: ComplaintRow[]
  voc: VocRow[]
}

// ── 보조 ───────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * 'YYYY-MM-DD' → '7월 3주차 (07/14~07/20)'
 *
 * 🔴 인자는 버킷 라벨이고, 라벨은 구간의 **끝**(월요일)이다 — `weekLabelOf()` 참조.
 * 구간의 시작은 라벨-6일(화요일)이므로 표기도 `시작~라벨` 순이다.
 * 라벨에 +6일을 더해 끝으로 쓰면 화면에만 한 주 뒤 기간이 찍힌다.
 */
export function weekLabel(weekStart: string): string {
  const [, m, d] = weekStart.split('-').map(Number)
  const start = bucketPeriodStart(weekStart, 'week')
  const md = (iso: string) => iso.substring(5).replace('-', '/')
  return `${m}월 ${Math.ceil(d / 7)}주차 (${md(start)}~${md(weekStart)})`
}

/** 그 주가 속한 달의 버킷 키(그 달 1일). 월 단위 채널이 쓰는 버킷이다. */
export function monthBucketOf(weekStart: string): string {
  return monthStartOf(weekStart.substring(0, 7))
}

/** 직전 월 버킷. */
function prevMonthBucket(bucket: string): string {
  return monthBucketOf(addDaysIso(bucket, -1))
}

/**
 * 판정. 기준선이 없으면 'unknown'.
 *
 * 경계(정확히 같은 값)는 'onOrAbove' 다 — 미팅 합의가 '미만이면 확인'이었다.
 * 격차는 2자리로 반올림한 뒤 판정한다. 두 값 모두 DB에 소수 2자리로 들어 있어
 * 부동소수 잔차(8.9 - 8.9 = -1.7e-15)가 미달로 뒤집히는 것을 막는다.
 */
export function judgeWeek(weekAvg: number, baseline: number | null): WeeklyVerdict {
  if (baseline == null) return 'unknown'
  return round2(weekAvg - baseline) < 0 ? 'below' : 'onOrAbove'
}

/**
 * 이 버킷에 쓸 기준선 스냅샷을 고른다.
 *
 * 최신 스냅샷이 아니라 '버킷 종료일 이전의 마지막 스냅샷'을 쓴다. 지난 주를 되짚어 볼 때
 * 최신 스냅샷을 쓰면 4월 리뷰어를 7월 누적 점수와 비교하게 된다 — 그 사이에 쌓인
 * 석 달치 리뷰가 기준선을 옮겨 놓았으므로 당시 판정과 다른 답이 나오고,
 * 같은 주를 다음 달에 다시 열면 판정이 또 바뀐다(재현되지 않는 리포트).
 * 최신 주를 볼 때는 두 방식의 답이 같다 — 최신 스냅샷이 곧 그 주의 스냅샷이다.
 *
 * 버킷보다 이른 스냅샷이 하나도 없으면(수집 시작 전 구간) 가장 이른 스냅샷을 빌려 쓰고
 * fallback 플래그를 세운다. 판정을 포기하는 것보다 낫지만, 미래 값으로 과거를 재는
 * 것이므로 화면이 그 사실을 밝힐 수 있어야 한다.
 */
export function pickBaseline(
  snapshots: ScoreSnapshotRow[],
  bucketEnd: string,
): { score: number | null; recordedAt: string | null; isFallback: boolean } {
  if (snapshots.length === 0) return { score: null, recordedAt: null, isFallback: false }
  // ISO 'YYYY-MM-DD'는 사전순 비교가 곧 날짜 비교다.
  const sorted = [...snapshots].sort((a, b) => (a.recorded_at < b.recorded_at ? -1 : 1))
  const inRange = sorted.filter(s => s.recorded_at <= bucketEnd)
  const chosen = inRange.length > 0 ? inRange[inRange.length - 1] : sorted[0]
  const score = Number(chosen.overall_score)
  if (!Number.isFinite(score) || score <= 0) return { score: null, recordedAt: null, isFallback: false }
  return { score, recordedAt: chosen.recorded_at, isFallback: inRange.length === 0 }
}

/** 밴드 열 합 = 그 버킷의 리뷰 건수. 채널 만점에 맞는 열만 더한다. */
export function reviewCountOf(row: DistRow, scoreMax: number): number {
  return distColumnsFor(scoreMax).reduce((s, c) => s + num(row[c]), 0)
}

/** 리포트를 낼 수 있는 주 목록(주 단위 행 기준, 최신 우선). */
export function listReportWeeks(dist: DistRow[]): string[] {
  const weeks = dist.filter(d => (d.granularity ?? 'week') === 'week').map(d => d.week_start)
  return [...new Set(weeks)].sort().reverse()
}

// ── 본체 ───────────────────────────────────────────────────────────

function buildRow(
  p: PropertyRow,
  row: DistRow,
  granularity: Granularity,
  bucket: string,
  snapshots: ScoreSnapshotRow[],
  prevRow: DistRow | undefined,
  complaint: ComplaintRow | undefined,
  vocRows: VocRow[],
): WeeklyChannelRow {
  const scoreMax = p.score_max === 5 ? 5 : 10
  const bucketEnd = bucketPeriodEnd(bucket, granularity)
  const reviewCount = reviewCountOf(row, scoreMax)
  const weekAvg = round2(num(row.weekly_avg_score))

  const base = pickBaseline(snapshots, bucketEnd)
  const verdict = judgeWeek(weekAvg, base.score)

  const prevAvg = prevRow ? round2(num(prevRow.weekly_avg_score)) : null

  let cause: WeeklyCause | null = null
  if (verdict === 'below') {
    const detail = (complaint?.memo ?? '').trim() || null
    const badKeywords = [...new Set(
      vocRows
        .filter(v => v.sentiment === 'bad')
        .map(v => (v.keyword ?? '').trim())
        .filter(Boolean)
    )]
    const { headline, headlineSource } = resolveHeadline(complaint?.headline, detail, badKeywords)
    cause = { headline, headlineSource, detail, badKeywords, hasCause: headline !== null }
  }

  return {
    propertyId: p.property_id,
    branch: p.branch,
    otaName: p.ota_name,
    scoreMax,
    granularity,
    weekStart: bucket,
    bucketEnd,
    reviewCount,
    weekAvg,
    estimator: row.source === 'manual' ? 'approx' : 'exact',
    thinSample: isThinSample(reviewCount),
    baseline: base.score,
    baselineRecordedAt: base.recordedAt,
    baselineIsFallback: base.isFallback,
    gap: base.score == null ? null : round2(weekAvg - base.score),
    verdict,
    prevWeekStart: prevRow ? prevRow.week_start : null,
    prevWeekAvg: prevAvg,
    prevReviewCount: prevRow ? reviewCountOf(prevRow, scoreMax) : null,
    wow: prevAvg == null ? null : round2(weekAvg - prevAvg),
    cause,
  }
}

/**
 * 한 주치 리포트를 조립한다.
 *
 * 월 단위 채널(에어비앤비·여기어때)은 원본이 일 단위 날짜를 주지 않아 주간으로 쪼갤 수
 * 없다. 조용히 빼면 '이번 주 에어비앤비는 문제 없었다'로 읽히므로, 그 주가 속한 달
 * 버킷으로 같은 규칙을 적용해 monthly 로 따로 담는다 — 같은 판정을 받되 주간 목록에
 * 섞이지 않으므로 '이 값은 그 주가 아니라 그 달의 값'이라는 사실이 구조로 남는다.
 */
export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { weekStart } = input
  const monthBucket = monthBucketOf(weekStart)

  const snapsByProp = new Map<number, ScoreSnapshotRow[]>()
  input.scores.forEach(s => {
    const arr = snapsByProp.get(s.property_id) ?? []
    arr.push(s)
    snapsByProp.set(s.property_id, arr)
  })

  const distKey = (r: { property_id: number; week_start: string; granularity?: Granularity }) =>
    `${r.property_id}|${r.week_start}|${r.granularity ?? 'week'}`
  const distByKey = new Map<string, DistRow>()
  input.dist.forEach(d => distByKey.set(distKey(d), d))

  const complaintByKey = new Map<string, ComplaintRow>()
  input.complaints.forEach(c => complaintByKey.set(distKey(c), c))

  const vocByKey = new Map<string, VocRow[]>()
  input.voc.forEach(v => {
    const k = distKey(v)
    const arr = vocByKey.get(k) ?? []
    arr.push(v)
    vocByKey.set(k, arr)
  })

  const weekly: WeeklyChannelRow[] = []
  const monthly: WeeklyChannelRow[] = []
  const silent: SilentChannel[] = []

  for (const p of input.properties) {
    const granularity = granularityForOtaName(p.ota_name)
    const bucket = granularity === 'month' ? monthBucket : weekStart
    const key = `${p.property_id}|${bucket}|${granularity}`
    const row = distByKey.get(key)

    // 분포 행이 없거나 밴드 합이 0이면 그 버킷에 리뷰가 없었다는 뜻이다.
    if (!row || reviewCountOf(row, p.score_max === 5 ? 5 : 10) === 0) {
      silent.push({ propertyId: p.property_id, branch: p.branch, otaName: p.ota_name, granularity })
      continue
    }

    const prevBucket = granularity === 'month' ? prevMonthBucket(bucket) : addDaysIso(bucket, -7)
    const prevRow = distByKey.get(`${p.property_id}|${prevBucket}|${granularity}`)

    const built = buildRow(
      p, row, granularity, bucket,
      snapsByProp.get(p.property_id) ?? [],
      prevRow,
      complaintByKey.get(key),
      vocByKey.get(key) ?? [],
    )
    ;(granularity === 'month' ? monthly : weekly).push(built)
  }

  // 격차가 큰 순 — 미달은 가장 많이 끌어내린 채널이 위로, 이상은 가장 밀어올린 채널이 위로.
  const byGapAsc  = (a: WeeklyChannelRow, b: WeeklyChannelRow) => (a.gap ?? 0) - (b.gap ?? 0)
  const byGapDesc = (a: WeeklyChannelRow, b: WeeklyChannelRow) => (b.gap ?? 0) - (a.gap ?? 0)

  const below     = weekly.filter(r => r.verdict === 'below').sort(byGapAsc)
  const onOrAbove = weekly.filter(r => r.verdict === 'onOrAbove').sort(byGapDesc)
  const unknown   = weekly.filter(r => r.verdict === 'unknown')

  return {
    weekStart,
    // 라벨이 곧 구간의 끝이다(화~월). 여기에 +6일을 더하면 한 주 뒤가 된다.
    weekEnd: bucketPeriodEnd(weekStart, 'week'),
    label: weekLabel(weekStart),
    below,
    onOrAbove,
    unknown,
    monthly: monthly.sort(byGapAsc),
    silent,
    summary: {
      belowCount:     below.length,
      onOrAboveCount: onOrAbove.length,
      unknownCount:   unknown.length,
      monthlyCount:   monthly.length,
      silentCount:    silent.length,
      reviewTotal:    weekly.reduce((s, r) => s + r.reviewCount, 0),
    },
  }
}
