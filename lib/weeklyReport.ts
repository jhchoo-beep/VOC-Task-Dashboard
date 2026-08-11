// 주간 OTA 리포트 계산 로직 (FO Weekly 260721 결정 + 2026-08-11 기준 점수 전환)
//
// 왜 만들었나: 월 평균 점수로는 아무것도 못 한다. 채널의 종합 점수는 누적값이라
// 몇 달을 봐도 소수점 한 자리가 겨우 움직이고, 움직인 뒤에는 이미 손쓸 시점이 지났다.
// 미팅에서 합의한 축은 '그 주에 리뷰를 쓴 사람들' — 몇 명이 썼고 몇 점을 줬는가다.
//
// 판정 규칙: 그 주 리뷰어들의 평균이 **목표 점수(9.0)** 보다 낮으면 미달이다.
//
// 🔴 2026-08-11 재헌 결정 — 기준선을 '그 채널 자신의 누적 점수'에서 '고정 목표 9.0'으로 바꿨다.
//    누적 기준선은 채널이 못하면 기준도 같이 내려간다. 신설 Agoda 2026-08-10 주가 그 예다:
//    주 평균 8.7이 누적 8.6보다 높다는 이유로 통과 처리됐고, 같은 주에 달린 4.4점 리뷰
//    (샤워기 파손)가 논의에서 통째로 빠졌다. 우리가 지켜야 하는 선은 채널의 과거가 아니라
//    OKR 목표다. 척도가 다른 채널(에어비앤비·야놀자 5점제)은 환산해 4.5를 쓴다.
//    값의 출처는 ota_properties.okr_target — 코드 상수가 아니라 데이터다(현재 전 채널
//    9.00 / 4.50). 목표가 바뀌면 DB만 고치면 된다.
//
// 🔴 이전 규칙(누적 스냅샷 기준선·pickBaseline·verdict 'unknown')은 되살리지 말 것.
//    ota_scores 는 이 리포트가 더 이상 읽지 않는다.

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
  okr_target?: number | string | null
}

export interface DistRow {
  property_id: number
  week_start: string
  granularity: Granularity
  source: 'manual' | 'derived'
  weekly_avg_score: number | string | null
  [scoreCol: string]: unknown
}

// ── 출력 타입 ──────────────────────────────────────────────────────

export type WeeklyVerdict = 'below' | 'onOrAbove'

export const VERDICT_LABEL: Record<WeeklyVerdict, string> = {
  below:     '목표 미달',
  onOrAbove: '목표 달성',
}

// weekly_avg_score 를 누가 어떻게 냈는가.
//   exact  — 파생 배치(derived)가 실제 rating 의 산술 평균으로 계산한 값
//   approx — 사람이 UI로 넣은 행(manual). 밴드 개수만 알고 원 rating 을 모르므로
//            밴드 대표값 가중 근사다. 같은 열에 담겨 있지만 추정량이 다르다.
// 소비자(화면)가 이걸 알아야 하는 이유: 근사값은 밴드 폭(10점제 1점)만큼 흔들릴 수 있어
// 목표와 0.1~0.5 차이로 갈리는 판정을 근사값 하나로 단정하면 안 된다.
export type AvgEstimator = 'exact' | 'approx'

export const ESTIMATOR_LABEL: Record<AvgEstimator, string> = {
  exact:  '실측 평균',
  approx: '밴드 근사(수기)',
}

/** 회의에서 매주 같은 자리를 찾게 하려고 지점 순서를 고정한다. 격차 순으로 정렬하지 않는다. */
export const BRANCH_ORDER = ['신설', '동대문', '제주시티', '고성']

/** 모르는 지점은 맨 뒤로 보낸다. */
export function branchRank(branch: string): number {
  const i = BRANCH_ORDER.indexOf(branch)
  return i === -1 ? BRANCH_ORDER.length : i
}

/** 10점 척도 기준 목표. 5점제 채널은 절반(4.5)으로 환산한다. */
export const DEFAULT_TARGET_10 = 9.0

/**
 * 이 채널이 지켜야 하는 점수. ota_properties.okr_target 이 정본이고,
 * 비었거나 척도를 벗어난 값이면 9.0(5점제 4.5)으로 되돌린다.
 *
 * 🔴 여기서 척도를 환산하지 않는다 — 목표를 채널 자기 척도로 내려 준다.
 *    비교 상대(weekly_avg_score·raw_reviews.rating)가 채널 자기 척도이기 때문이다.
 *    반대로 리뷰를 10점 환산하면 5점제 채널 리뷰가 전부 미달로 뒤집힌다.
 */
export function targetScoreOf(scoreMax: number, okrTarget?: number | string | null): number {
  const max = scoreMax === 5 ? 5 : 10
  const t = Number(okrTarget)
  if (Number.isFinite(t) && t > 0 && t <= max) return t
  return max === 5 ? DEFAULT_TARGET_10 / 2 : DEFAULT_TARGET_10
}

// 🔴 미달 '원인'은 이 리포트가 만들지 않는다(2026-07-27 재헌 결정).
// 이전에는 ota_complaints.headline → memo 앞부분 → bad 키워드 순으로 폴백해 결론 한 줄을
// 지어냈다. 그 폴백이 밴드를 보지 않아, 신설 Trip.com 2026-07-27 주에서 기준선을 밀어올린
// 9.5점 리뷰의 팁('QR 코드 다크모드 인식 불편')이 미달 주의 원인 자리에 앉았다.
// 카드가 말하는 것은 '목표보다 낮은 리뷰가 났다'까지이고, 원인은 펼침의 리뷰 원문으로
// 사람이 읽는다. ota_complaints·ota_voc는 이 리포트가 더 이상 읽지 않는다.

// 그 버킷에 실제로 쓰인 리뷰의 점수 밴드(건수 있는 밴드만). band 는 1~scoreMax.
// 점수 보드가 '이번 주에 몇 점짜리가 몇 건 왔는가'를 상세 탭 분포도 없이 보여 주는 재료다.
export interface BandCount {
  band: number
  count: number
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
  bands: BandCount[]         // 밴드별 건수 — 건수 0인 밴드는 담지 않는다
  estimator: AvgEstimator

  target: number             // 이 채널의 목표 점수(9.0 · 5점제 4.5)
  gap: number                // weekAvg - target (소수 2자리)
  verdict: WeeklyVerdict

  prevWeekStart: string | null
  prevWeekAvg: number | null
  prevReviewCount: number | null
  wow: number | null         // 이번 주 평균 - 직전 버킷 평균 (소수 2자리)
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

// 점수 보드(화면 첫 블록)가 쓰는 행. 활성 채널 전부를 담는다 —
// 그 주 리뷰가 0건인 채널도 뺀다. 목표는 리뷰 유무와 무관한 채널의 속성이고,
// 빠지면 표에 구멍이 생겨 '이 채널은 왜 없지'를 회의에서 묻게 된다.
export interface ChannelBoardRow {
  propertyId: number
  branch: string
  otaName: string
  scoreMax: number
  target: number
  below: boolean             // 이번 버킷 주 평균이 목표 미달인 채널
}

export interface WeeklyReportSummary {
  belowCount: number
  onOrAboveCount: number
  monthlyCount: number
  silentCount: number
  reviewTotal: number        // 주간 채널이 그 주에 받은 리뷰 총 건수
}

export interface WeeklyReport {
  weekStart: string
  weekEnd: string
  label: string              // '7월 3주차 (07/20~07/26)'
  below: WeeklyChannelRow[]      // 주 평균이 목표 미달 — 격차 큰 순
  onOrAbove: WeeklyChannelRow[]  // 목표 이상 — 격차 큰 순
  monthly: WeeklyChannelRow[]    // 월 단위 채널(주간 분해 불가)
  silent: SilentChannel[]        // 리뷰 0건
  board: ChannelBoardRow[]       // 활성 전 채널 — 점수 보드
  summary: WeeklyReportSummary
}

export interface WeeklyReportInput {
  weekStart: string
  properties: PropertyRow[]      // active=true 만 넘긴다
  dist: DistRow[]
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
 * 판정.
 *
 * 경계(정확히 같은 값)는 'onOrAbove' 다 — 목표가 '9.0 이상 유지'이므로 9.0은 달성이다.
 * 격차는 2자리로 반올림한 뒤 판정한다. 부동소수 잔차(9.0 - 9.0 = -1.7e-15)가
 * 미달로 뒤집히는 것을 막는다.
 */
export function judgeWeek(weekAvg: number, target: number): WeeklyVerdict {
  return round2(weekAvg - target) < 0 ? 'below' : 'onOrAbove'
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
  target: number,
  prevRow: DistRow | undefined,
): WeeklyChannelRow {
  const scoreMax = p.score_max === 5 ? 5 : 10
  const bucketEnd = bucketPeriodEnd(bucket, granularity)
  const reviewCount = reviewCountOf(row, scoreMax)
  const weekAvg = round2(num(row.weekly_avg_score))
  const bands = distColumnsFor(scoreMax)
    .map((c, i) => ({ band: i + 1, count: num(row[c]) }))
    .filter(b => b.count > 0)

  const prevAvg = prevRow ? round2(num(prevRow.weekly_avg_score)) : null

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
    bands,
    estimator: row.source === 'manual' ? 'approx' : 'exact',
    target,
    gap: round2(weekAvg - target),
    verdict: judgeWeek(weekAvg, target),
    prevWeekStart: prevRow ? prevRow.week_start : null,
    prevWeekAvg: prevAvg,
    prevReviewCount: prevRow ? reviewCountOf(prevRow, scoreMax) : null,
    wow: prevAvg == null ? null : round2(weekAvg - prevAvg),
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

  const distKey = (r: { property_id: number; week_start: string; granularity?: Granularity }) =>
    `${r.property_id}|${r.week_start}|${r.granularity ?? 'week'}`
  const distByKey = new Map<string, DistRow>()
  input.dist.forEach(d => distByKey.set(distKey(d), d))

  const weekly: WeeklyChannelRow[] = []
  const monthly: WeeklyChannelRow[] = []
  const silent: SilentChannel[] = []
  const board: ChannelBoardRow[] = []

  for (const p of input.properties) {
    const granularity = granularityForOtaName(p.ota_name)
    const bucket = granularity === 'month' ? monthBucket : weekStart
    const scoreMax = p.score_max === 5 ? 5 : 10
    const target = targetScoreOf(scoreMax, p.okr_target)
    const row = distByKey.get(`${p.property_id}|${bucket}|${granularity}`)

    // 목표는 리뷰가 있었는지와 무관한 채널의 속성이므로 silent 로 빠지기 전에 담는다.
    // below 는 아래에서 판정이 나온 뒤 되돌아와 채운다.
    const boardRow: ChannelBoardRow = {
      propertyId: p.property_id,
      branch: p.branch,
      otaName: p.ota_name,
      scoreMax,
      target,
      below: false,
    }
    board.push(boardRow)

    // 분포 행이 없거나 밴드 합이 0이면 그 버킷에 리뷰가 없었다는 뜻이다.
    if (!row || reviewCountOf(row, scoreMax) === 0) {
      silent.push({ propertyId: p.property_id, branch: p.branch, otaName: p.ota_name, granularity })
      continue
    }

    const prevBucket = granularity === 'month' ? prevMonthBucket(bucket) : addDaysIso(bucket, -7)
    const prevRow = distByKey.get(`${p.property_id}|${prevBucket}|${granularity}`)

    const built = buildRow(p, row, granularity, bucket, target, prevRow)
    boardRow.below = built.verdict === 'below'
    ;(granularity === 'month' ? monthly : weekly).push(built)
  }

  // 격차가 큰 순 — 미달은 가장 많이 끌어내린 채널이 위로, 이상은 가장 밀어올린 채널이 위로.
  const byGapAsc  = (a: WeeklyChannelRow, b: WeeklyChannelRow) => gapPer10(a) - gapPer10(b)
  const byGapDesc = (a: WeeklyChannelRow, b: WeeklyChannelRow) => gapPer10(b) - gapPer10(a)

  const below     = weekly.filter(r => r.verdict === 'below').sort(byGapAsc)
  const onOrAbove = weekly.filter(r => r.verdict === 'onOrAbove').sort(byGapDesc)

  return {
    weekStart,
    // 라벨이 곧 구간의 끝이다(화~월). 여기에 +6일을 더하면 한 주 뒤가 된다.
    weekEnd: bucketPeriodEnd(weekStart, 'week'),
    label: weekLabel(weekStart),
    below,
    onOrAbove,
    monthly: monthly.sort(byGapAsc),
    silent,
    board,
    summary: {
      belowCount:     below.length,
      onOrAboveCount: onOrAbove.length,
      monthlyCount:   monthly.length,
      silentCount:    silent.length,
      reviewTotal:    weekly.reduce((s, r) => s + r.reviewCount, 0),
    },
  }
}

/**
 * 격차를 10점 척도로 환산한다. 정렬에만 쓴다.
 *
 * 5점제 채널의 -0.5는 10점제의 -1.0과 같은 크기다. 환산하지 않고 한 줄로 세우면
 * 5점제 채널이 실제보다 가벼워 보여 늘 아래로 밀린다.
 */
function gapPer10(r: WeeklyChannelRow): number {
  return r.gap * (10 / r.scoreMax)
}

/**
 * 논의 대상 채널을 고른다.
 *
 * 🔴 조건이 둘이다(2026-08-11 재헌 결정) —
 *    ① 주 평균이 목표 미달인 채널
 *    ② 주 평균은 목표를 넘겼지만 **목표에 못 미친 리뷰가 한 건이라도 있는** 채널
 *
 *    ②가 이 전환의 핵심이다. 평균만 보면 신설 Agoda 8.7(8건) 안에 섞인 4.4점 리뷰가
 *    통째로 안 보인다 — 평균이 통과하는 순간 그 주 전체가 논의에서 빠지기 때문이다.
 *    회의가 읽어야 하는 것은 평균이 아니라 목표에 못 미친 리뷰 그 자체다.
 *
 *    ①을 남겨 두는 이유: raw 원문을 확보하지 못한 채널(아고다 커버리지 한계 등)은
 *    belowCounts가 0으로 온다. ②만 쓰면 '평균 6.3인데 논의에 없는' 채널이 생긴다.
 *
 * 정렬은 지점 고정 순 → 격차 큰 순이다. 격차 순으로만 세우면 매주 자리가 바뀌어
 * 회의에서 채널을 찾게 된다.
 *
 * @param belowCounts propertyId → 그 버킷의 목표 미달 리뷰 수(원문 기준)
 */
export function discussionRows(
  report: WeeklyReport,
  belowCounts: Record<number, number>,
): WeeklyChannelRow[] {
  const all = [...report.below, ...report.onOrAbove, ...report.monthly]
  return all
    .filter(r => r.verdict === 'below' || (belowCounts[r.propertyId] ?? 0) > 0)
    .sort((a, b) => {
      const ra = branchRank(a.branch), rb = branchRank(b.branch)
      if (ra !== rb) return ra - rb
      return gapPer10(a) - gapPer10(b)
    })
}
