import { describe, it, expect } from 'vitest'
import {
  judgeWeek, pickBaseline, reviewCountOf, listReportWeeks, weekLabel,
  monthBucketOf, buildWeeklyReport,
  type PropertyRow, type DistRow, type ScoreSnapshotRow,
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
    expect(weekLabel('2026-07-20')).toBe('7월 3주차 (07/14~07/20)')
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

const report = buildWeeklyReport({
  weekStart: '2026-07-20', properties: PROPS, dist: DISTS, scores: SNAPS,
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

  // 🔴 카드는 원인을 쓰지 않는다(2026-07-27). 원인 한 줄을 짓던 폴백이 밴드를 보지 않아
  //    기준선 위 리뷰의 팁을 미달 원인으로 내보냈다. 이 리포트가 내는 것은 판정과 수치뿐이다.
  it('리포트는 원인 문구를 만들지 않는다 — 판정 대상 채널도 수치만 싣는다', () => {
    const trip = report.below.find(r => r.otaName === 'Trip.com')!
    expect('cause' in trip).toBe(false)
    expect(trip.reviewCount).toBe(1)
  })

  it('스냅샷이 없는 채널은 unknown 이고 기준선·격차가 null', () => {
    const u = report.unknown[0]
    expect(u.verdict).toBe('unknown')
    expect(u.baseline).toBeNull()
    expect(u.gap).toBeNull()
    expect(u.reviewCount).toBe(1)
  })

  // 점수 보드의 재료 — '이번 주에 몇 점짜리가 몇 건'을 상세 탭 분포도 없이 보여 준다.
  it('버킷의 밴드별 건수를 싣는다 — 건수 0인 밴드는 담지 않는다', () => {
    const agoda = report.onOrAbove[0]
    expect(agoda.bands).toEqual([{ band: 8, count: 2 }, { band: 10, count: 3 }])
    const nol = report.below.find(r => r.otaName === 'NOL')!
    expect(nol.bands).toEqual([{ band: 3, count: 1 }, { band: 4, count: 1 }])
    const airbnb = report.monthly[0]
    expect(airbnb.bands).toEqual([{ band: 4, count: 2 }, { band: 5, count: 8 }])
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
    expect(report.weekEnd).toBe('2026-07-20')
    expect(report.label).toBe('7월 3주차 (07/14~07/20)')
  })

  it('분포 행 자체가 없는 채널도 silent 다(행 없음 = 리뷰 없음)', () => {
    const r = buildWeeklyReport({
      weekStart: '2026-07-20', properties: PROPS, dist: [], scores: SNAPS,
    })
    expect(r.silent).toHaveLength(PROPS.length)
    expect(r.summary.reviewTotal).toBe(0)
  })

  it('기준선을 과거 주에 맞춰 잡는다(최신 스냅샷을 끌어오지 않는다)', () => {
    const r = buildWeeklyReport({
      weekStart: '2026-07-13', properties: PROPS,
      dist: DISTS, scores: [...SNAPS, snap(1, '2026-07-13', 9.9)],
    })
    const agoda = [...r.below, ...r.onOrAbove].find(x => x.otaName === 'Agoda')!
    expect(agoda.baselineRecordedAt).toBe('2026-07-13')
    expect(agoda.baseline).toBe(9.9)   // 07-20 의 8.6 이 아니다
    expect(agoda.verdict).toBe('below')
  })
})

// ── baselines — 화면 오른쪽 '기준 점수' 패널 ───────────────────────
describe('buildWeeklyReport — baselines', () => {
  it('리뷰 0건 채널까지 활성 전 채널을 담는다', () => {
    // 기준 점수는 리뷰 유무와 무관한 채널의 속성이다. silent 를 빼면 표에 구멍이 생긴다.
    expect(report.baselines.map(b => b.propertyId)).toEqual([1, 2, 3, 4, 5, 6])
    const booking = report.baselines.find(b => b.otaName === 'Booking')!
    expect(report.silent.some(s => s.otaName === 'Booking')).toBe(true)
    expect(booking.score).toBe(8.6)
  })

  it('below 플래그가 report.below 와 정확히 일치한다', () => {
    const flagged = report.baselines.filter(b => b.below).map(b => b.otaName).sort()
    expect(flagged).toEqual(['NOL', 'Trip.com'])
    expect(flagged).toEqual(report.below.map(r => r.otaName).sort())
  })

  it('스냅샷이 없는 채널은 score=null — 0으로 채우지 않는다', () => {
    const expedia = report.baselines.find(b => b.otaName === 'Expedia')!
    expect(expedia.score).toBe(null)
    expect(expedia.recordedAt).toBe(null)
  })

  it('5점제 채널의 scoreMax 와 기준선을 그대로 싣는다', () => {
    const nol = report.baselines.find(b => b.otaName === 'NOL')!
    expect(nol.scoreMax).toBe(5)
    expect(nol.score).toBe(4.0)
  })

  it('카드가 쓴 기준선과 같은 값이다 — 좌우 숫자가 어긋나면 안 된다', () => {
    for (const row of [...report.below, ...report.onOrAbove, ...report.monthly]) {
      const b = report.baselines.find(x => x.propertyId === row.propertyId)!
      expect(b.score).toBe(row.baseline)
      expect(b.recordedAt).toBe(row.baselineRecordedAt)
    }
  })

  it('월 채널은 주 버킷이 아니라 자기 월 버킷 끝의 스냅샷을 쓴다', () => {
    // 주 버킷 끝(07-26) 이후·월 버킷 끝(07-31) 이전에 찍힌 스냅샷이 있으면
    // 월 채널은 그것을 써야 한다. 버킷 끝을 하나로 통일하면 이 케이스가 틀린다.
    const r = buildWeeklyReport({
      weekStart: '2026-07-20',
      properties: [{ property_id: 9, branch: '신설', ota_name: 'Airbnb', score_max: 5 }],
      dist: [{ property_id: 9, week_start: '2026-07-01', granularity: 'month', source: 'derived', weekly_avg_score: 4.8, score_5: 10 }],
      scores: [
        { property_id: 9, overall_score: 4.70, review_count: 100, recorded_at: '2026-07-20' },
        { property_id: 9, overall_score: 4.73, review_count: 105, recorded_at: '2026-07-29' },
      ],
    })
    expect(r.baselines[0].score).toBe(4.73)
    expect(r.baselines[0].recordedAt).toBe('2026-07-29')
    expect(r.monthly[0].baseline).toBe(4.73)
  })
})
