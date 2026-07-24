import { describe, it, expect } from 'vitest'
import {
  judgeWeek, pickBaseline, reviewCountOf, listReportWeeks, weekLabel,
  monthBucketOf, isThinSample, buildWeeklyReport, resolveHeadline,
  type PropertyRow, type DistRow, type ScoreSnapshotRow, type ComplaintRow, type VocRow,
} from './weeklyReport'

// 밴드 열을 채운 분포 행을 간단히 만든다. counts 는 score_1 부터 순서대로.
function dist(
  property_id: number, week_start: string, avg: number, counts: number[],
  opts: { granularity?: 'week' | 'month'; source?: 'manual' | 'derived' } = {},
): DistRow {
  const row: DistRow = {
    property_id, week_start,
    granularity: opts.granularity ?? 'week',
    source: opts.source ?? 'derived',
    weekly_avg_score: avg,
  }
  counts.forEach((c, i) => { row[`score_${i + 1}`] = c })
  return row
}

const snap = (property_id: number, recorded_at: string, overall_score: number): ScoreSnapshotRow =>
  ({ property_id, recorded_at, overall_score, review_count: 100 })

describe('judgeWeek — 두 척도와 경계', () => {
  it('10점제: 주 평균이 누적보다 낮으면 미달', () => {
    expect(judgeWeek(4.4, 8.9)).toBe('below')
  })
  it('10점제: 주 평균이 누적보다 높으면 이상', () => {
    expect(judgeWeek(9.5, 9.1)).toBe('onOrAbove')
  })
  it('5점제도 같은 규칙이 그대로 성립한다(같은 척도끼리 비교하므로 환산 불필요)', () => {
    expect(judgeWeek(3.8, 4.0)).toBe('below')   // 신설 NOL 기준선 4.00
    expect(judgeWeek(4.9, 4.87)).toBe('onOrAbove') // 고성 Airbnb 기준선 4.87
  })
  it('정확히 기준선과 같으면 이상(미달 아님)', () => {
    expect(judgeWeek(8.9, 8.9)).toBe('onOrAbove')
    expect(judgeWeek(4.87, 4.87)).toBe('onOrAbove')
  })
  it('부동소수 잔차로 경계가 미달로 뒤집히지 않는다', () => {
    expect(judgeWeek(0.1 + 0.2 + 8.6, 8.9)).toBe('onOrAbove')
  })
  it('기준선이 없으면 통과도 미달도 아닌 unknown', () => {
    expect(judgeWeek(9.9, null)).toBe('unknown')
  })
})

describe('pickBaseline — 기준선 스냅샷 선택', () => {
  const snaps = [snap(1, '2026-06-01', 8.4), snap(1, '2026-07-20', 8.6), snap(1, '2026-07-13', 8.5)]

  it('버킷 종료일 이전의 마지막 스냅샷을 쓴다(최신이 아니라)', () => {
    const r = pickBaseline(snaps, '2026-07-19')
    expect(r.score).toBe(8.5)
    expect(r.recordedAt).toBe('2026-07-13')
    expect(r.isFallback).toBe(false)
  })
  it('최신 주에서는 최신 스냅샷과 같은 답이 나온다', () => {
    expect(pickBaseline(snaps, '2026-07-26').score).toBe(8.6)
  })
  it('버킷보다 이른 스냅샷이 없으면 최초 스냅샷을 빌려 쓰고 fallback 표시', () => {
    const r = pickBaseline(snaps, '2026-04-05')
    expect(r.score).toBe(8.4)
    expect(r.isFallback).toBe(true)
  })
  it('스냅샷이 하나도 없으면 기준선 없음', () => {
    expect(pickBaseline([], '2026-07-26')).toEqual({ score: null, recordedAt: null, isFallback: false })
  })
})

describe('reviewCountOf — 채널 만점에 맞는 밴드 열만 합산', () => {
  it('10점제는 score_1~10을 더한다', () => {
    expect(reviewCountOf(dist(1, '2026-07-20', 9.2, [0,0,0,0,0,0,0,2,0,3]), 10)).toBe(5)
  })
  it('5점제는 score_1~5만 더한다(6~10에 값이 있어도 무시)', () => {
    const row = dist(1, '2026-07-20', 4.5, [0,0,0,1,1,9,9,9,9,9])
    expect(reviewCountOf(row, 5)).toBe(2)
  })
})

describe('보조 함수', () => {
  it('weekLabel 은 한국어 주차 + 기간', () => {
    expect(weekLabel('2026-07-20')).toBe('7월 3주차 (07/20~07/26)')
  })
  it('monthBucketOf 는 그 달 1일', () => {
    expect(monthBucketOf('2026-07-20')).toBe('2026-07-01')
  })
  it('listReportWeeks 는 주 단위 행만, 최신 우선', () => {
    const rows = [
      dist(1, '2026-07-13', 8, [1]), dist(2, '2026-07-20', 8, [1]),
      dist(3, '2026-07-01', 8, [1], { granularity: 'month' }), dist(4, '2026-07-20', 8, [1]),
    ]
    expect(listReportWeeks(rows)).toEqual(['2026-07-20', '2026-07-13'])
  })
  it('isThinSample 은 1~2건에만 참, 0건은 거짓(0건은 silent 로 따로 다룬다)', () => {
    expect(isThinSample(0)).toBe(false)
    expect(isThinSample(1)).toBe(true)
    expect(isThinSample(2)).toBe(true)
    expect(isThinSample(3)).toBe(false)
  })
})

// ── buildWeeklyReport ──────────────────────────────────────────────

const PROPS: PropertyRow[] = [
  { property_id: 1,  branch: '신설',     ota_name: 'Agoda',    score_max: 10 },
  { property_id: 2,  branch: '신설',     ota_name: 'Trip.com', score_max: 10 },
  { property_id: 3,  branch: '신설',     ota_name: 'NOL',      score_max: 5  },
  { property_id: 4,  branch: '신설',     ota_name: 'Airbnb',   score_max: 5  },
  { property_id: 5,  branch: '동대문',   ota_name: 'Booking',  score_max: 10 },
  { property_id: 6,  branch: '제주시티', ota_name: 'Expedia',  score_max: 10 },
]

const SNAPS: ScoreSnapshotRow[] = [
  snap(1, '2026-07-13', 8.6), snap(1, '2026-07-20', 8.6),
  snap(2, '2026-07-20', 8.7),
  snap(3, '2026-07-20', 4.0),
  snap(4, '2026-07-20', 4.73),
  snap(5, '2026-07-20', 8.6),
  // property 6(제주시티 Expedia)은 스냅샷이 하나도 없다 → unknown
]

const DISTS: DistRow[] = [
  // 신설 Agoda: 5건 9.20 vs 8.60 → 이상. 수기 입력(manual) → approx
  dist(1, '2026-07-20', 9.2, [0,0,0,0,0,0,0,2,0,3], { source: 'manual' }),
  dist(1, '2026-07-13', 8.5, [0,0,0,0,0,0,0,3,0,1], { source: 'manual' }),
  // 신설 Trip.com: 1건 6.00 vs 8.70 → 미달, 원인 기록 없음
  dist(2, '2026-07-20', 6.0, [0,0,0,0,0,1,0,0,0,0]),
  // 신설 NOL(5점제): 2건 3.50 vs 4.00 → 미달
  dist(3, '2026-07-20', 3.5, [0,0,1,1,0]),
  // 신설 Airbnb(월 단위): 7월 버킷 4.80 vs 4.73 → 이상
  dist(4, '2026-07-01', 4.8, [0,0,0,2,8], { granularity: 'month' }),
  dist(4, '2026-06-01', 4.5, [0,0,1,3,6], { granularity: 'month' }),
  // 동대문 Booking: 밴드 합 0 → 리뷰 없음(silent)
  dist(5, '2026-07-20', 0, [0,0,0,0,0,0,0,0,0,0]),
  // 제주시티 Expedia: 1건 8.00, 스냅샷 없음 → unknown
  dist(6, '2026-07-20', 8.0, [0,0,0,0,0,0,0,1,0,0]),
]

const COMPLAINTS: ComplaintRow[] = [
  { property_id: 3, week_start: '2026-07-20', granularity: 'week', headline: null, memo: '온수 지연 반복' },
  { property_id: 2, week_start: '2026-07-20', granularity: 'week', headline: null, memo: '   ' }, // 공백뿐 → 원인 없음
]

const VOC: VocRow[] = [
  { property_id: 3, week_start: '2026-07-20', granularity: 'week', sentiment: 'bad',  keyword: '온수', band: '3점' },
  { property_id: 3, week_start: '2026-07-20', granularity: 'week', sentiment: 'bad',  keyword: '온수', band: '4점' }, // 중복 제거
  { property_id: 3, week_start: '2026-07-20', granularity: 'week', sentiment: 'good', keyword: '위치', band: '4점' },
  { property_id: 2, week_start: '2026-07-20', granularity: 'week', sentiment: 'good', keyword: '욕조', band: '6점대 이하' },
]

const report = buildWeeklyReport({
  weekStart: '2026-07-20', properties: PROPS, dist: DISTS,
  scores: SNAPS, complaints: COMPLAINTS, voc: VOC,
})

describe('buildWeeklyReport', () => {
  it('미달·이상·unknown·월단위·silent 로 정확히 한 번씩만 분류한다', () => {
    expect(report.below.map(r => r.otaName)).toEqual(['Trip.com', 'NOL'])   // 격차 -2.70, -0.50
    expect(report.onOrAbove.map(r => r.otaName)).toEqual(['Agoda'])
    expect(report.unknown.map(r => r.otaName)).toEqual(['Expedia'])
    expect(report.monthly.map(r => r.otaName)).toEqual(['Airbnb'])
    expect(report.silent.map(r => r.otaName)).toEqual(['Booking'])
  })

  it('요약은 silent 를 통과에 합치지 않는다', () => {
    expect(report.summary).toEqual({
      belowCount: 2, onOrAboveCount: 1, unknownCount: 1,
      monthlyCount: 1, silentCount: 1, reviewTotal: 9, // 5 + 1 + 2 + 1
    })
  })

  it('5점제 채널도 자기 기준선으로 판정된다', () => {
    const nol = report.below.find(r => r.otaName === 'NOL')!
    expect(nol.scoreMax).toBe(5)
    expect(nol.baseline).toBe(4.0)
    expect(nol.gap).toBe(-0.5)
  })

  it('원인이 기록된 미달 주는 메모와 bad 키워드를 싣는다(중복 제거, good 제외)', () => {
    const nol = report.below.find(r => r.otaName === 'NOL')!
    expect(nol.cause).toEqual({
      headline: '온수 지연 반복', headlineSource: 'memoHead',
      detail: '온수 지연 반복', badKeywords: ['온수'], hasCause: true,
    })
  })

  it('원인이 기록되지 않은 미달 주도 상태로 남긴다(숨기지 않는다)', () => {
    const trip = report.below.find(r => r.otaName === 'Trip.com')!
    expect(trip.cause).toEqual({
      headline: null, headlineSource: null,
      detail: null, badKeywords: [], hasCause: false,
    })
    expect(trip.reviewCount).toBe(1)
    expect(trip.thinSample).toBe(true) // 1건 -2.70은 추세가 아니라는 표시
  })

  it('기준선 이상인 주는 원인을 조회하지 않는다', () => {
    expect(report.onOrAbove[0].cause).toBeNull()
  })

  it('스냅샷이 없는 채널은 unknown 이고 기준선·격차가 null', () => {
    const u = report.unknown[0]
    expect(u.verdict).toBe('unknown')
    expect(u.baseline).toBeNull()
    expect(u.gap).toBeNull()
    expect(u.reviewCount).toBe(1)
  })

  it('전주 대비 이동(wow)을 낸다. 전주 행이 없으면 null', () => {
    const agoda = report.onOrAbove[0]
    expect(agoda.prevWeekStart).toBe('2026-07-13')
    expect(agoda.prevWeekAvg).toBe(8.5)
    expect(agoda.prevReviewCount).toBe(4)
    expect(agoda.wow).toBe(0.7)
    expect(report.below.find(r => r.otaName === 'Trip.com')!.wow).toBeNull()
  })

  it('수기 입력 행은 근사 추정량으로 표시된다', () => {
    expect(report.onOrAbove[0].estimator).toBe('approx')
    expect(report.below.find(r => r.otaName === 'NOL')!.estimator).toBe('exact')
  })

  it('월 단위 채널은 그 달 버킷으로 판정하고 주간 목록과 분리한다', () => {
    const air = report.monthly[0]
    expect(air.granularity).toBe('month')
    expect(air.weekStart).toBe('2026-07-01')
    expect(air.bucketEnd).toBe('2026-07-31')
    expect(air.verdict).toBe('onOrAbove')
    expect(air.prevWeekStart).toBe('2026-06-01')  // 직전 달 버킷
    expect(air.wow).toBe(0.3)
  })

  it('주 라벨·기간을 함께 낸다', () => {
    expect(report.weekStart).toBe('2026-07-20')
    expect(report.weekEnd).toBe('2026-07-26')
    expect(report.label).toBe('7월 3주차 (07/20~07/26)')
  })

  it('분포 행 자체가 없는 채널도 silent 다(행 없음 = 리뷰 없음)', () => {
    const r = buildWeeklyReport({
      weekStart: '2026-07-20', properties: PROPS, dist: [], scores: SNAPS, complaints: [], voc: [],
    })
    expect(r.silent).toHaveLength(PROPS.length)
    expect(r.summary.reviewTotal).toBe(0)
  })

  it('기준선을 과거 주에 맞춰 잡는다(최신 스냅샷을 끌어오지 않는다)', () => {
    const r = buildWeeklyReport({
      weekStart: '2026-07-13', properties: PROPS,
      dist: DISTS, scores: [...SNAPS, snap(1, '2026-07-13', 9.9)],
      complaints: [], voc: [],
    })
    const agoda = [...r.below, ...r.onOrAbove].find(x => x.otaName === 'Agoda')!
    expect(agoda.baselineRecordedAt).toBe('2026-07-13')
    expect(agoda.baseline).toBe(9.9)   // 07-20 의 8.6 이 아니다
    expect(agoda.verdict).toBe('below')
  })
})

describe('resolveHeadline — 저장된 한 줄이 없으면 순서대로 내려간다', () => {
  it('headline이 있으면 그대로 쓴다', () => {
    expect(resolveHeadline('주차비 사전 고지 부재', '아주 긴 memo 전문 — 처방', ['키워드']))
      .toEqual({ headline: '주차비 사전 고지 부재', headlineSource: 'headline' })
  })

  it('headline이 없으면 memo의 첫 em dash 앞부분을 쓴다', () => {
    // 실측(제주시티 Agoda 2026-07-20). 뒤쪽 '— … 정비 필요'는 처방이라 결론에서 뺀다.
    const memo = '투숙객 주차 유료(1박 15,000원) 예약 단계 사전 고지 부재 — 현장 응대·사후 CS 통화까지 이어진 저평점 컴플레인 1건, 고지 문구 및 응대 스크립트 정비 필요'
    expect(resolveHeadline(null, memo, ['주차비 유료 정책'])).toEqual({
      headline: '투숙객 주차 유료(1박 15,000원) 예약 단계 사전 고지 부재',
      headlineSource: 'memoHead',
    })
  })

  it('em dash가 없는 memo는 전문을 60자로 자른다', () => {
    // 실측(신설 Agoda 2026-07-06 수기). 리뷰어별 서술 문단이라 자르지 않으면 결론 줄이 무너진다.
    const memo = '[객실] Jiaqi(중): 배수구 냄새 다소 있으나 환풍 켜면 해결, 냉장고 간헐 소음. Wu(대만): 선반 먼지, 소파 얼룩 심해 앉기 꺼려짐. [욕실] 真吾(일): 변기 간헐 막힘 반복(재방문 고객).'
    const r = resolveHeadline(null, memo, [])
    expect(r.headlineSource).toBe('memoHead')
    expect(r.headline!.length).toBeLessThanOrEqual(61)   // 60자 + '…'
    expect(r.headline!.endsWith('…')).toBe(true)
  })

  it('em dash가 섞인 수기 문단 memo는 그 앞부분이 한 줄이 된다', () => {
    // 수기 memo는 「원인 — 처방」 구조가 아니라 리뷰어별 서술이라, em dash가 있어도
    // 앞부분이 곧 원인은 아니다. 그래도 읽히는 한 줄이 나오면 폴백의 목적(과거 주가
    // 빈 카드로 뜨지 않게)은 달성된다 — 최선의 한 줄은 headline 필드가 담당한다.
    const memo = 'YURI(일본, 3박, 8.0): 이른 아침 도착 시 체크인 에러 발생 — 상주 스태프가 현장 대응해 해결.'
    expect(resolveHeadline(null, memo, [])).toEqual({
      headline: 'YURI(일본, 3박, 8.0): 이른 아침 도착 시 체크인 에러 발생',
      headlineSource: 'memoHead',
    })
  })

  it('memo 전문에 줄바꿈이 있어도 한 줄로 접는다', () => {
    const r = resolveHeadline(null, '첫 줄\n둘째 줄', [])
    expect(r.headline).toBe('첫 줄 둘째 줄')
  })

  it('memo가 비면 bad 키워드 상위 2개를 쓴다', () => {
    // 실측(동대문 Expedia 2026-07-20)은 memo가 빈 문자열이다.
    expect(resolveHeadline(null, '', ['욕실 협소', '침대 불편', '베개 납작함'])).toEqual({
      headline: '욕실 협소 · 침대 불편',
      headlineSource: 'keywords',
    })
  })

  it('셋 다 없으면 null — 원인 미기록이 실재 상태다', () => {
    // 실측(신설 Trip.com 2026-07-20): 6.00 vs 8.70인데 메모도 bad 키워드도 없다.
    expect(resolveHeadline(null, null, [])).toEqual({ headline: null, headlineSource: null })
  })

  it('공백만 있는 headline은 값이 없는 것으로 본다', () => {
    expect(resolveHeadline('   ', '', ['욕실 협소']).headlineSource).toBe('keywords')
  })
})

describe('buildWeeklyReport — cause', () => {
  it('미달 행의 cause가 headline·detail·키워드를 모두 싣는다', () => {
    const report = buildWeeklyReport({
      weekStart: '2026-07-20',
      properties: [{ property_id: 1, branch: '동대문', ota_name: 'Agoda', score_max: 10 }],
      dist: [{ property_id: 1, week_start: '2026-07-20', granularity: 'week', source: 'derived', weekly_avg_score: 8.0, score_8: 3 }],
      scores: [{ property_id: 1, overall_score: 8.9, review_count: 100, recorded_at: '2026-07-20' }],
      complaints: [{ property_id: 1, week_start: '2026-07-20', granularity: 'week', headline: '욕실 배수 불량 수리 요청 후 미조치', memo: '샤워 시 물이 차오르는 객실 배수 불량 — 대상 호실 특정 필요' }],
      voc: [{ property_id: 1, week_start: '2026-07-20', granularity: 'week', sentiment: 'bad', keyword: '욕실 배수 불량', band: '6점대 이하' }],
    })
    const row = report.below[0]
    expect(row.cause).toEqual({
      headline: '욕실 배수 불량 수리 요청 후 미조치',
      headlineSource: 'headline',
      detail: '샤워 시 물이 차오르는 객실 배수 불량 — 대상 호실 특정 필요',
      badKeywords: ['욕실 배수 불량'],
      hasCause: true,
    })
  })
})
