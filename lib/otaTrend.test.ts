import { describe, it, expect } from 'vitest'
import {
  normalizeTo10, branchIntegratedScore, weekOfMonthLabel, monthLabel,
  buildTrendRows, rollupMonthly, drilldownMonths, INTEGRATED,
} from './otaTrend'

const OTA_LIST = [
  { name: 'Agoda', max: 10, okr: 9.0 },
  { name: 'Booking', max: 10, okr: 8.8 },
  { name: '여기어때', max: 5, okr: 9.0 },
]

describe('normalizeTo10', () => {
  it('10점제는 그대로', () => {
    expect(normalizeTo10(8.7, 10)).toBe(8.7)
  })
  it('5점제는 10점으로 환산', () => {
    expect(normalizeTo10(4.5, 5)).toBe(9)
  })
})

describe('branchIntegratedScore', () => {
  it('리뷰 수 가중 평균을 10점 환산으로 계산한다', () => {
    // Agoda 8.0 × 리뷰300, 여기어때 4.5/5(=9.0) × 리뷰100 → (8*300+9*100)/400 = 8.25
    const scores  = { Agoda: [8.0], 여기어때: [4.5] }
    const reviews = { Agoda: [300], 여기어때: [100] }
    expect(branchIntegratedScore(OTA_LIST, scores, reviews, 0)).toBe(8.25)
  })

  it('점수 0(미수집) OTA는 제외한다', () => {
    const scores  = { Agoda: [8.0], Booking: [0] }
    const reviews = { Agoda: [300], Booking: [500] }
    expect(branchIntegratedScore(OTA_LIST, scores, reviews, 0)).toBe(8.0)
  })

  it('리뷰 수 0이면 가중치 1로 간주해 포함한다', () => {
    const scores  = { Agoda: [8.0], Booking: [9.0] }
    const reviews = { Agoda: [0], Booking: [0] }
    expect(branchIntegratedScore(OTA_LIST, scores, reviews, 0)).toBe(8.5)
  })

  it('데이터가 전혀 없으면 null', () => {
    expect(branchIntegratedScore(OTA_LIST, {}, {}, 0)).toBeNull()
    expect(branchIntegratedScore(OTA_LIST, undefined, undefined, 0)).toBeNull()
  })
})

describe('weekOfMonthLabel / monthLabel', () => {
  it('일자를 월내 주차로 변환한다', () => {
    expect(weekOfMonthLabel('2026-07-06')).toBe('7월 1주차')
    expect(weekOfMonthLabel('2026-07-13')).toBe('7월 2주차')
    expect(weekOfMonthLabel('2026-06-29')).toBe('6월 5주차')
    expect(weekOfMonthLabel('2026-03-18')).toBe('3월 3주차')
  })
  it('monthLabel은 N월', () => {
    expect(monthLabel('2026-03-18')).toBe('3월')
  })
})

describe('buildTrendRows', () => {
  const dates = ['2026-06-29', '2026-07-06', '2026-07-13']
  const scoreHistory = {
    신설:   { Agoda: [8.7, 8.5, 8.4] },
    동대문: { Agoda: [9.0, 9.1, 9.1] },
  }
  const reviewHistory = {
    신설:   { Agoda: [100, 110, 120] },
    동대문: { Agoda: [200, 205, 210] },
  }

  it('통합 모드에서 지점별 값과 Δ를 만든다', () => {
    const rows = buildTrendRows(['신설', '동대문'], OTA_LIST, scoreHistory, reviewHistory, dates, INTEGRATED)
    expect(rows).toHaveLength(3)
    expect(rows[0].label).toBe('6월 5주차')
    expect(rows[0].values['신설']).toBe(8.7)
    expect(rows[0].deltas['신설']).toBeNull()          // 첫 스냅샷은 Δ 없음
    expect(rows[1].deltas['신설']).toBeCloseTo(-0.2)   // 8.7 → 8.5 하락
    expect(rows[2].deltas['동대문']).toBe(0)
  })

  it('특정 OTA 모드는 원점수를 그대로 쓴다', () => {
    const rows = buildTrendRows(['신설'], OTA_LIST, scoreHistory, reviewHistory, dates, 'Agoda')
    expect(rows[2].values['신설']).toBe(8.4)
  })

  it('데이터 없는 지점은 null이고 Δ는 non-null 직전값 기준', () => {
    const sparse = { 고성: { Agoda: [0, 8.0, 8.3] } }
    const rows = buildTrendRows(['고성'], OTA_LIST, sparse, {}, dates, 'Agoda')
    expect(rows[0].values['고성']).toBeNull()
    expect(rows[1].deltas['고성']).toBeNull()
    expect(rows[2].deltas['고성']).toBeCloseTo(0.3)
  })
})

// 회귀: 2026-07-20 동대문이 실제로는 +0.0003 움직였는데 Δ+0.01로 표시된 사고.
// 원인은 스냅샷 값을 2자리로 반올림한 뒤 그 값끼리 뺀 것(8.96 − 8.95).
describe('통합 점수는 반올림 전 원값으로 Δ를 계산한다', () => {
  const PROD_OTA = [
    { name: 'Agoda',   max: 10, okr: 9.0 },
    { name: 'Airbnb',  max: 5,  okr: 9.0 },
    { name: 'Booking', max: 10, okr: 8.8 },
    { name: 'Trip',    max: 10, okr: 9.0 },
    { name: 'Expedia', max: 10, okr: 9.0 },
    { name: 'NOL',     max: 5,  okr: 9.0 },
    { name: '여기어때', max: 10, okr: 9.0 },
  ]
  // 실측: 07-06 → 07-13 → 07-20 (동대문). 07-13에 Agoda가 9.0→8.9로 실제 하락.
  const scores = {
    동대문: {
      Agoda: [9.0, 8.9, 8.9], Airbnb: [4.83, 4.83, 4.83], Booking: [8.6, 8.6, 8.6],
      Trip: [9.1, 9.1, 9.1], Expedia: [9.0, 9.0, 9.0], NOL: [4.2, 4.2, 4.2], 여기어때: [5.9, 5.9, 5.9],
    },
  }
  const reviews = {
    동대문: {
      Agoda: [7452, 7474, 7494], Airbnb: [944, 944, 945], Booking: [831, 825, 823],
      Trip: [690, 692, 708], Expedia: [114, 114, 114], NOL: [97, 97, 97], 여기어때: [5, 5, 5],
    },
  }
  const dates = ['2026-07-06', '2026-07-13', '2026-07-20']
  const rows = buildTrendRows(['동대문'], PROD_OTA, scores, reviews, dates, INTEGRATED)

  it('원값을 반올림 없이 보존한다', () => {
    expect(rows[1].values['동대문']).toBeCloseTo(8.9548, 4)
    expect(rows[2].values['동대문']).toBeCloseTo(8.95506, 4)
  })

  it('점수 무변동 + 리뷰 구성비만 바뀐 주는 Δ 0으로 본다', () => {
    // 채널 7개 점수가 전부 동일 → 표시상 8.95→8.96이어도 Δ는 0이어야 한다
    expect(rows[2].deltas['동대문']).toBe(0)
  })

  it('진짜 하락은 그대로 잡아낸다', () => {
    // Agoda 9.0 → 8.9 실제 하락은 Δ가 살아 있어야 (하락 마킹·드릴다운 근거)
    expect(rows[1].deltas['동대문']).toBeCloseTo(-0.07, 2)
    expect(rows[1].deltas['동대문']).toBeLessThan(0)
  })
})

describe('rollupMonthly', () => {
  it('각 월의 마지막 스냅샷만 남긴다', () => {
    const dates = ['2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13']
    const scoreHistory = { 신설: { Agoda: [8.9, 8.7, 8.5, 8.4] } }
    const rows = buildTrendRows(['신설'], OTA_LIST, scoreHistory, {}, dates, 'Agoda')
    const monthly = rollupMonthly(rows, ['신설'])
    expect(monthly).toHaveLength(2)
    expect(monthly[0].label).toBe('6월')
    expect(monthly[0].values['신설']).toBe(8.7)   // 6월 마지막 스냅샷
    expect(monthly[1].label).toBe('7월')
    expect(monthly[1].values['신설']).toBe(8.4)
    expect(monthly[1].deltas['신설']).toBeCloseTo(-0.3)
  })
})

describe('drilldownMonths', () => {
  it('스냅샷 구간이 두 달에 걸치면 두 달 모두, 최신 월 먼저', () => {
    expect(drilldownMonths('2026-07-06', '2026-06-29')).toEqual(['2026-07', '2026-06'])
  })
  it('같은 달이면 한 달만', () => {
    expect(drilldownMonths('2026-07-13', '2026-07-06')).toEqual(['2026-07'])
  })
  it('첫 스냅샷(prev 없음)은 자기 달만', () => {
    expect(drilldownMonths('2026-03-18', null)).toEqual(['2026-03'])
  })
})
