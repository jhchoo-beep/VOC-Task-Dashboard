import { describe, it, expect } from 'vitest'
import {
  judgeWeek, targetScoreOf, reviewCountOf, listReportWeeks, weekLabel,
  monthBucketOf, buildWeeklyReport, discussionRows,
  type PropertyRow, type DistRow,
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

// 🔴 기준은 채널 누적 점수가 아니라 고정 목표다(2026-08-11). 누적 기준선에서는
//    채널이 못하면 기준도 같이 내려가, 신설 Agoda 주 평균 8.7이 누적 8.6을 넘겼다는
//    이유로 같은 주 4.4점 리뷰가 논의에서 통째로 빠졌다.
describe('targetScoreOf — 목표는 채널 척도로 내려온다', () => {
  it('10점제 기본값은 9.0', () => {
    expect(targetScoreOf(10, null)).toBe(9.0)
  })
  it('5점제 기본값은 환산한 4.5 — 리뷰를 10점 환산하지 않는다', () => {
    expect(targetScoreOf(5, null)).toBe(4.5)
  })
  it('okr_target 이 정본이다(문자열 숫자도 받는다)', () => {
    expect(targetScoreOf(10, '9.00')).toBe(9)
    expect(targetScoreOf(5, '4.50')).toBe(4.5)
    expect(targetScoreOf(10, 8.5)).toBe(8.5)
  })
  it('척도를 벗어나거나 못 쓸 값이면 기본값으로 되돌린다', () => {
    expect(targetScoreOf(5, 9.0)).toBe(4.5)      // 5점제에 10점 목표가 들어온 경우
    expect(targetScoreOf(10, 0)).toBe(9.0)
    expect(targetScoreOf(10, 'abc')).toBe(9.0)
    expect(targetScoreOf(10, undefined)).toBe(9.0)
  })
})

describe('judgeWeek — 두 척도와 경계', () => {
  it('10점제: 주 평균이 목표보다 낮으면 미달', () => {
    expect(judgeWeek(8.7, 9.0)).toBe('below')
  })
  it('10점제: 주 평균이 목표보다 높으면 달성', () => {
    expect(judgeWeek(9.5, 9.0)).toBe('onOrAbove')
  })
  it('5점제도 자기 척도 목표로 판정한다(환산 불필요)', () => {
    expect(judgeWeek(4.0, 4.5)).toBe('below')
    expect(judgeWeek(4.9, 4.5)).toBe('onOrAbove')
  })
  it('정확히 목표와 같으면 달성(미달 아님) — 목표가 9.0 이상 유지이기 때문', () => {
    expect(judgeWeek(9.0, 9.0)).toBe('onOrAbove')
    expect(judgeWeek(4.5, 4.5)).toBe('onOrAbove')
  })
  it('부동소수 잔차로 경계가 미달로 뒤집히지 않는다', () => {
    expect(judgeWeek(0.1 + 0.2 + 8.7, 9.0)).toBe('onOrAbove')
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
  { property_id: 1,  branch: '신설',     ota_name: 'Agoda',    score_max: 10, okr_target: '9.00' },
  { property_id: 2,  branch: '신설',     ota_name: 'Trip.com', score_max: 10, okr_target: '9.00' },
  { property_id: 3,  branch: '신설',     ota_name: 'NOL',      score_max: 5,  okr_target: '4.50' },
  { property_id: 4,  branch: '신설',     ota_name: 'Airbnb',   score_max: 5,  okr_target: '4.50' },
  { property_id: 5,  branch: '동대문',   ota_name: 'Booking',  score_max: 10, okr_target: '9.00' },
  { property_id: 6,  branch: '제주시티', ota_name: 'Expedia',  score_max: 10, okr_target: null   },
]

const DISTS: DistRow[] = [
  // 신설 Agoda: 5건 9.20 vs 9.00 → 달성. 수기 입력(manual) → approx
  dist(1, '2026-07-20', 9.2, [0,0,0,0,0,0,0,2,0,3], { source: 'manual' }),
  dist(1, '2026-07-13', 8.5, [0,0,0,0,0,0,0,3,0,1], { source: 'manual' }),
  // 신설 Trip.com: 1건 6.00 vs 9.00 → 미달
  dist(2, '2026-07-20', 6.0, [0,0,0,0,0,1,0,0,0,0]),
  // 신설 NOL(5점제): 2건 3.50 vs 4.50 → 미달
  dist(3, '2026-07-20', 3.5, [0,0,1,1,0]),
  // 신설 Airbnb(월 단위): 7월 버킷 4.80 vs 4.50 → 달성
  dist(4, '2026-07-01', 4.8, [0,0,0,2,8], { granularity: 'month' }),
  dist(4, '2026-06-01', 4.5, [0,0,1,3,6], { granularity: 'month' }),
  // 동대문 Booking: 밴드 합 0 → 리뷰 없음(silent)
  dist(5, '2026-07-20', 0, [0,0,0,0,0,0,0,0,0,0]),
  // 제주시티 Expedia: 1건 8.00, okr_target 없음 → 기본 9.0 으로 미달
  dist(6, '2026-07-20', 8.0, [0,0,0,0,0,0,0,1,0,0]),
]

const report = buildWeeklyReport({ weekStart: '2026-07-20', properties: PROPS, dist: DISTS })

describe('buildWeeklyReport', () => {
  it('미달·달성·월단위·silent 로 정확히 한 번씩만 분류한다', () => {
    // 정렬은 10점 척도로 환산한 격차 오름차순 — NOL 의 -1.00은 10점제로 -2.00이라
    // Expedia(-1.00)보다 앞이고 Trip.com(-3.00)보다 뒤다.
    expect(report.below.map(r => r.otaName)).toEqual(['Trip.com', 'NOL', 'Expedia'])
    expect(report.onOrAbove.map(r => r.otaName)).toEqual(['Agoda'])
    expect(report.monthly.map(r => r.otaName)).toEqual(['Airbnb'])
    expect(report.silent.map(r => r.otaName)).toEqual(['Booking'])
  })

  it('요약은 silent 를 통과에 합치지 않는다', () => {
    expect(report.summary).toEqual({
      belowCount: 3, onOrAboveCount: 1,
      monthlyCount: 1, silentCount: 1, reviewTotal: 9, // 5 + 1 + 2 + 1
    })
  })

  it('5점제 채널은 환산한 목표(4.5)로 판정된다', () => {
    const nol = report.below.find(r => r.otaName === 'NOL')!
    expect(nol.scoreMax).toBe(5)
    expect(nol.target).toBe(4.5)
    expect(nol.gap).toBe(-1)
  })

  it('okr_target 이 비면 기본 목표 9.0 으로 판정한다 — 판정을 포기하지 않는다', () => {
    const expedia = report.below.find(r => r.otaName === 'Expedia')!
    expect(expedia.target).toBe(9.0)
    expect(expedia.verdict).toBe('below')
    expect(expedia.reviewCount).toBe(1)
  })

  // 🔴 카드는 원인을 쓰지 않는다(2026-07-27). 원인 한 줄을 짓던 폴백이 밴드를 보지 않아
  //    기준선 위 리뷰의 팁을 미달 원인으로 내보냈다. 이 리포트가 내는 것은 판정과 수치뿐이다.
  it('리포트는 원인 문구를 만들지 않는다 — 판정 대상 채널도 수치만 싣는다', () => {
    const trip = report.below.find(r => r.otaName === 'Trip.com')!
    expect('cause' in trip).toBe(false)
    expect(trip.reviewCount).toBe(1)
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
    const r = buildWeeklyReport({ weekStart: '2026-07-20', properties: PROPS, dist: [] })
    expect(r.silent).toHaveLength(PROPS.length)
    expect(r.summary.reviewTotal).toBe(0)
  })

  it('같은 주를 다시 열어도 판정이 바뀌지 않는다 — 목표는 시점에 의존하지 않는다', () => {
    // 누적 스냅샷 기준선일 때는 그 사이 쌓인 리뷰가 기준선을 옮겨 과거 주 판정이 바뀌었다.
    const again = buildWeeklyReport({ weekStart: '2026-07-20', properties: PROPS, dist: DISTS })
    expect(again.below.map(r => r.otaName)).toEqual(report.below.map(r => r.otaName))
  })
})

// ── board — 점수 보드 ──────────────────────────────────────────────
describe('buildWeeklyReport — board', () => {
  it('리뷰 0건 채널까지 활성 전 채널을 담는다', () => {
    // 목표는 리뷰 유무와 무관한 채널의 속성이다. silent 를 빼면 표에 구멍이 생긴다.
    expect(report.board.map(b => b.propertyId)).toEqual([1, 2, 3, 4, 5, 6])
    expect(report.silent.some(s => s.otaName === 'Booking')).toBe(true)
    expect(report.board.find(b => b.otaName === 'Booking')!.target).toBe(9.0)
  })

  it('below 플래그가 report.below 와 정확히 일치한다', () => {
    const flagged = report.board.filter(b => b.below).map(b => b.otaName).sort()
    expect(flagged).toEqual(report.below.map(r => r.otaName).sort())
  })

  it('카드가 쓴 목표와 같은 값이다 — 좌우 숫자가 어긋나면 안 된다', () => {
    for (const row of [...report.below, ...report.onOrAbove, ...report.monthly]) {
      const b = report.board.find(x => x.propertyId === row.propertyId)!
      expect(b.target).toBe(row.target)
    }
  })

  it('5점제 채널의 scoreMax 와 목표를 그대로 싣는다', () => {
    const nol = report.board.find(b => b.otaName === 'NOL')!
    expect(nol.scoreMax).toBe(5)
    expect(nol.target).toBe(4.5)
  })
})

// ── discussionRows — 논의 대상 선정 ────────────────────────────────
// 🔴 이 규칙이 2026-08-11 개편의 본체다. 평균이 목표를 넘겨도 목표 미달 리뷰가 있으면
//    논의에 올린다 — 신설 Agoda 8.7(8건) 안의 4.4점 리뷰가 통째로 빠지던 문제를 없앤 것.
describe('discussionRows', () => {
  it('주 평균이 미달인 채널은 미달 리뷰 원문이 0건이어도 논의에 남는다', () => {
    // 원문 미확보(아고다 커버리지 한계 등)로 belowCounts 가 비어도 빠지면 안 된다 —
    // '평균 6.0인데 논의에 없는' 채널이 생긴다.
    const rows = discussionRows(report, {})
    expect(rows.map(r => r.otaName)).toEqual(['Trip.com', 'NOL', 'Expedia'])
  })

  it('평균이 목표를 넘긴 채널도 미달 리뷰가 1건이라도 있으면 논의에 오른다', () => {
    const rows = discussionRows(report, { 1: 1 })   // 신설 Agoda 평균 9.2, 미달 리뷰 1건
    expect(rows.map(r => r.otaName)).toContain('Agoda')
  })

  it('평균이 목표를 넘겼고 미달 리뷰도 0건이면 논의에 오르지 않는다', () => {
    const rows = discussionRows(report, { 1: 0, 4: 0 })
    expect(rows.map(r => r.otaName)).not.toContain('Agoda')
    expect(rows.map(r => r.otaName)).not.toContain('Airbnb')
  })

  it('월 단위 채널도 같은 규칙으로 논의에 오른다 — 참고로 접지 않는다', () => {
    // 접으면 '에어비앤비는 문제 없었다'로 읽힌다(2026-07-24 결정).
    const rows = discussionRows(report, { 4: 2 })
    expect(rows.map(r => r.otaName)).toContain('Airbnb')
  })

  it('지점 고정 순 → 10점 환산 격차 순으로 세운다', () => {
    const rows = discussionRows(report, { 1: 1 })
    // 신설 4채널(Trip.com -3.0, NOL -2.0, Agoda +0.2, Airbnb +0.6 중 해당분) 뒤에 제주시티.
    expect(rows.map(r => `${r.branch} ${r.otaName}`)).toEqual([
      '신설 Trip.com', '신설 NOL', '신설 Agoda', '제주시티 Expedia',
    ])
  })

  it('한 채널이 두 번 나오지 않는다', () => {
    const ids = discussionRows(report, { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1 }).map(r => r.propertyId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
