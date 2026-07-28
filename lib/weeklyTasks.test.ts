import { describe, it, expect } from 'vitest'
import { flattenCandidates, branchesOf } from './weeklyTasks'
import type { WeeklyChannelRow } from './weeklyReport'
import type { ChannelReviews } from './weeklyReviews'

// 카드는 판정에 쓰인 필드만 채운다. 나머지는 평탄화가 보지 않는다.
const card = (propertyId: number, branch: string, otaName: string): WeeklyChannelRow => ({
  propertyId, branch, otaName,
  scoreMax: 10, granularity: 'week',
  weekStart: '2026-07-27', bucketEnd: '2026-07-27',
  reviewCount: 2, weekAvg: 6.5, estimator: 'exact',   // AvgEstimator = 'exact' | 'approx'
  baseline: 8.9, baselineRecordedAt: '2026-07-27', baselineIsFallback: false,
  gap: -2.4, verdict: 'below',
  prevWeekStart: null, prevWeekAvg: null, prevReviewCount: null, wow: null,
})

const cr = (propertyId: number, items: ChannelReviews['items']): ChannelReviews => ({
  propertyId, items, expectedCount: items.length, hiddenCount: 0, baseline: 8.9,
})

describe('flattenCandidates', () => {
  it('여러 채널의 미달 리뷰를 한 목록으로 합친다', () => {
    const got = flattenCandidates(
      [card(1, '신설', 'Agoda'), card(2, '동대문', 'Trip.com')],
      {
        1: cr(1, [{ id: 'a', rating: 6.0, country: null, roomType: null, date: '2026-07-24', body: '체크인이 오래 걸림', translated: true }]),
        2: cr(2, [{ id: 'b', rating: 5.0, country: null, roomType: null, date: '2026-07-23', body: '응대 불만', translated: false }]),
      },
    )
    expect(got.map(r => r.id)).toEqual(['a', 'b'])
    expect(got[0].branch).toBe('신설')
    expect(got[0].otaName).toBe('Agoda')
    expect(got[1].translated).toBe(false)
  })

  it('지점 고정 순 → 점수 낮은 순으로 정렬한다', () => {
    const got = flattenCandidates(
      [card(9, '고성', 'Agoda'), card(1, '신설', 'Agoda')],
      {
        9: cr(9, [{ id: 'g', rating: 3.0, country: null, roomType: null, date: null, body: '고성', translated: true }]),
        1: cr(1, [
          { id: 's-high', rating: 7.0, country: null, roomType: null, date: null, body: '신설7', translated: true },
          { id: 's-low',  rating: 4.0, country: null, roomType: null, date: null, body: '신설4', translated: true },
        ]),
      },
    )
    // 고성이 3.0으로 더 낮아도 신설이 먼저다 — 지점 순서가 1차 키다
    expect(got.map(r => r.id)).toEqual(['s-low', 's-high', 'g'])
  })

  it('점수 없는 리뷰는 0점으로 둔갑시키지 않고 맨 뒤로 보낸다', () => {
    const got = flattenCandidates(
      [card(1, '신설', 'Agoda')],
      {
        1: cr(1, [
          { id: 'null', rating: null, country: null, roomType: null, date: null, body: '점수 없음', translated: true },
          { id: 'low',  rating: 2.0,  country: null, roomType: null, date: null, body: '2점', translated: true },
        ]),
      },
    )
    expect(got.map(r => r.id)).toEqual(['low', 'null'])
  })

  it('원문을 확보하지 못한 채널은 건너뛴다', () => {
    const got = flattenCandidates([card(1, '신설', 'Agoda')], {})
    expect(got).toEqual([])
  })
})

describe('branchesOf', () => {
  it('중복 없이 지점 고정 순으로 낸다', () => {
    const items = [
      { id: 'a', branch: '동대문', otaName: 'Agoda', rating: 5, date: null, body: '', translated: true },
      { id: 'b', branch: '신설',   otaName: 'Trip.com', rating: 6, date: null, body: '', translated: true },
      { id: 'c', branch: '동대문', otaName: 'Booking', rating: 7, date: null, body: '', translated: true },
    ]
    expect(branchesOf(items)).toEqual(['신설', '동대문'])
  })
})
