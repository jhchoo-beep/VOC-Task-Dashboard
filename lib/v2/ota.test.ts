import { describe, expect, it } from 'vitest'
import {
  INTEGRATED, TARGET_INTEGRATED, branchesOf, calcWeekAvg, channelNow, channelsOf, fmtDelta, deltaTone,
  groupDistByMonth, groupReviewRateByMonth, newReviewSeries, nowOf, scaleOf, siteAliases, targetOf, visibleRows, weeklyRows,
  type OtaProps,
} from './ota'

// 스냅샷 4회. 2026-10-05 → 10-19 는 14일 간격(수집이 한 주 빠진 실제 구간과 같은 모양)
const dates = ['2026-09-28', '2026-10-05', '2026-10-19', '2026-10-26']

const base = (o: Partial<OtaProps> = {}): OtaProps => ({
  recordedAt: dates[dates.length - 1],
  dates,
  dateLabels: dates.map(d => d.slice(5)),
  otaList: [{ name: 'Agoda', max: 10, okr: 9 }, { name: 'Booking', max: 10, okr: 9 }, { name: 'Airbnb', max: 5, okr: 4.5 }],
  scoreHistory: {
    신설: { Agoda: [8.6, 8.6, 8.7, 8.6], Airbnb: [4.73, 4.73, 4.74, 4.82], Booking: [0, 0, 0, 0] },
    동대문: { Agoda: [8.9, 8.9, 8.9, 0] },
  },
  reviewHistory: {
    신설: { Agoda: [9000, 9020, 9060, 9080], Airbnb: [100, 101, 103, 104], Booking: [0, 0, 0, 0] },
    동대문: { Agoda: [7800, 7810, 7820, 0] },
  },
  scoreDist: {},
  complaints: {},
  complaintMemos: {},
  voc: {},
  reviewRate: {},
  snapshotDatesByChannel: {},
  scoreMaxByBranchOta: { 신설: { Agoda: 10, Airbnb: 5, Booking: 10 }, 동대문: { Agoda: 10 } },
  branchOtaToId: { 신설: { Agoda: 1, Airbnb: 9, Booking: 15 }, 동대문: { Agoda: 10 } },
  ...o,
})

describe('지점·채널 목록', () => {
  it('지점은 고정 순서, 채널은 점수가 한 번이라도 있는 것만', () => {
    const p = base()
    expect(branchesOf(p)).toEqual(['신설', '동대문'])
    expect(channelsOf(p, '신설')).toEqual(['Agoda', 'Airbnb'])
  })
})

describe('목표는 채널 자기 척도', () => {
  it('5점제 채널 목표는 4.5, 10점 환산하지 않는다', () => {
    const p = base()
    expect(scaleOf(p, '신설', 'Airbnb')).toBe(5)
    expect(targetOf(p, '신설', 'Airbnb')).toBe(4.5)
    expect(targetOf(p, '신설', 'Agoda')).toBe(9)
    expect(targetOf(p, '신설', INTEGRATED)).toBe(TARGET_INTEGRATED)
    expect(TARGET_INTEGRATED).toBe(9)
  })

  it('Airbnb 4.82 는 목표 4.5 이상이라 달성(9.64 로 올려 비교하지 않음)', () => {
    const p = base()
    const rows = weeklyRows(p, ['신설'], 'Airbnb')
    const c = channelNow(p, rows, '신설', 'Airbnb')
    expect(c.cur).toBe(4.82)
    expect(c.met).toBe(true)
    expect(c.digits).toBe(2)
  })

  it('Agoda 8.6 은 목표 9.0 미만', () => {
    const p = base()
    const c = channelNow(p, weeklyRows(p, ['신설'], 'Agoda'), '신설', 'Agoda')
    expect(c.met).toBe(false)
    expect(c.propertyId).toBe(1)
  })
})

describe('통합 점수 = 10점 환산 뒤 리뷰 수 가중 평균(lib/otaTrend 그대로)', () => {
  it('Airbnb 는 ×2 로 들어가고 누적 리뷰 수로 가중된다', () => {
    const p = base()
    const n = nowOf(weeklyRows(p, ['신설'], INTEGRATED), '신설')
    const expected = (8.6 * 9080 + 4.82 * 2 * 104) / (9080 + 104)
    expect(n.cur).toBeCloseTo(expected, 10)
  })

  it('Δ 는 원값끼리 뺀다(표시 반올림 값끼리 빼지 않는다)', () => {
    const p = base()
    const rows = weeklyRows(p, ['신설'], INTEGRATED)
    const a = rows[2].values['신설']!, b = rows[3].values['신설']!
    expect(nowOf(rows, '신설').delta).toBe(Math.round((b - a) * 100) / 100)
  })

  it('마지막 스냅샷에 값이 없는 채널은 비어 있다(지난 값을 끌어오지 않는다)', () => {
    const p = base()
    const c = channelNow(p, weeklyRows(p, ['동대문'], 'Agoda'), '동대문', 'Agoda')
    expect(c.cur).toBeNull()
    expect(c.met).toBeNull()
  })
})

describe('그래프 행', () => {
  it('주별은 최근 창만 자르되 첫 행의 Δ 는 잘리기 전 값 기준', () => {
    const p = base()
    const all = weeklyRows(p, ['신설'], 'Agoda')
    const vis = visibleRows(all, ['신설'], 'weekly')
    expect(vis.length).toBe(4)
    expect(vis[1].deltas['신설']).toBe(0)
  })

  it('월별은 월말 스냅샷', () => {
    const p = base()
    const vis = visibleRows(weeklyRows(p, ['신설'], 'Agoda'), ['신설'], 'monthly')
    expect(vis.map(r => r.dateIso)).toEqual(['2026-09-28', '2026-10-26'])
  })
})

describe('신규 리뷰 수', () => {
  it('14일 간격 스냅샷은 한 주치로 그리지 않는다', () => {
    const s = newReviewSeries([9000, 9020, 9060, 9080], dates, 'weekly')
    expect(s.map(x => x.n)).toEqual([null, 20, null, 20])
  })

  it('월별은 월말 누적끼리', () => {
    const s = newReviewSeries([9000, 9020, 9060, 9080], dates, 'monthly')
    expect(s.map(x => x.n)).toEqual([null, 80])
  })

  it('앞뒤 중 하나라도 비면 내지 않는다, 감소는 0', () => {
    const s = newReviewSeries([0, 10, 8, 0], ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'], 'weekly')
    expect(s.map(x => x.n)).toEqual([null, null, 0, null])
  })
})

describe('Δ 표시', () => {
  it('부호와 자릿수, 0 은 ±', () => {
    expect(fmtDelta(0.1, 1)).toBe('+0.1')
    expect(fmtDelta(-0.04, 1)).toBe('±0.0')
    expect(fmtDelta(-0.04, 2)).toBe('−0.04')
    expect(fmtDelta(null, 1)).toBe('–')
    expect(deltaTone(-0.04, 1)).toBe('flat')
    expect(deltaTone(-0.04, 2)).toBe('down')
  })
})

describe('1.0 에서 옮긴 월 묶음', () => {
  it('점수 분포 월 평균은 건수 가중', () => {
    const g = groupDistByMonth([
      { week: '10/06', scores: [0, 0, 0, 0, 0, 0, 0, 1, 0, 1], avgScore: 9 },
      { week: '10/13', scores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2], avgScore: 10 },
      { week: '11/03', scores: [0, 0, 0, 0, 1], avgScore: 5 },
    ])
    expect(g[0]).toEqual({ week: '10월', scores: [0, 0, 0, 0, 0, 0, 0, 1, 0, 3], avgScore: 9.5 })
    expect(g[1].week).toBe('11월')
  })

  it('작성률 월 묶음은 분자·분모를 따로 더해 나눈다', () => {
    const g = groupReviewRateByMonth([
      { week: '07/06', reviewCount: 10, checkoutCount: 100, ratePct: 10 },
      { week: '07/13', reviewCount: 30, checkoutCount: 100, ratePct: 30 },
    ])
    expect(g).toEqual([{ week: '7월', reviewCount: 40, checkoutCount: 200, ratePct: 20 }])
  })

  it('밴드 평균은 대표값 i+1점', () => {
    expect(calcWeekAvg([0, 0, 0, 1, 1])).toBe(4.5)
  })

  it('reviews.ota_site 한글명 대응', () => {
    expect(siteAliases('NOL')).toEqual(['NOL', '야놀자'])
    expect(siteAliases('Agoda')).toEqual(['아고다'])
  })
})
