import { describe, it, expect } from 'vitest'
import { selectBucketReviews, datedReviewsFor, drilldownCollectedRange } from './weeklyReviews'
import type { RawReviewRow, ReviewRow } from './weeklyReviews'

// 🔴 아고다 raw_date 가 2026-08-13 수집분부터 투숙월('August 2026')로 온다.
//    주 단위 채널에서 일자가 없으면 수집일(created_at, KST)로 주를 정한다 — 파생 배치와 같은 규칙.

const raw = (o: Partial<RawReviewRow> & Pick<RawReviewRow, 'id' | 'content' | 'raw_date'>): RawReviewRow => ({
  branch: '신설', ota_site: '아고다', review_month: '2026-08', rating: 6,
  country: null, room_type: null, reviewer: null, created_at: null, ...o,
})
const rev = (o: Partial<ReviewRow> & Pick<ReviewRow, 'id' | 'content'>): ReviewRow => ({
  branch: '신설', ota_site: '아고다', review_month: '2026-08', rating: 6, content_ko: null, ...o,
})

describe('주 단위 채널 — raw 일자가 없으면 수집일로 주를 정한다', () => {
  it('투숙월만 있는 아고다 리뷰가 수집일(KST)의 주 버킷에 들어간다', () => {
    // 실측: 신설 아고다 KONOKA 6.0 — 수집 2026-08-30 05:57 KST → 라벨 2026-08-31(08-25~08-31)
    const r = [raw({ id: 'k', content: '広さと交通は良い', raw_date: 'August 2026', created_at: '2026-08-29T20:57:52+00:00' })]
    const v = [rev({ id: 'K', content: '広さと交通は良い' })]
    expect(datedReviewsFor(v, r, '신설', 'Agoda')[0].date).toBe('2026-08-30')
    expect(selectBucketReviews(v, r, '신설', 'Agoda', '2026-08-31', 'week').map(d => d.review.id)).toEqual(['K'])
    expect(selectBucketReviews(v, r, '신설', 'Agoda', '2026-08-24', 'week')).toEqual([])
  })

  it('수집일이 없는 행은 여전히 주 버킷에 넣지 않는다', () => {
    const r = [raw({ id: 'n', content: '수집일 없음', raw_date: 'August 2026' })]
    const v = [rev({ id: 'N', content: '수집일 없음' })]
    expect(selectBucketReviews(v, r, '신설', 'Agoda', '2026-08-31', 'week')).toEqual([])
  })

  it('월 단위 채널(에어비앤비)은 수집일을 보지 않는다', () => {
    const r = [raw({ id: 'a', ota_site: '에어비앤비', review_month: '2026-07', content: '7월 리뷰', raw_date: '2026년 7월', created_at: '2026-08-02T20:00:00+00:00' })]
    const v = [rev({ id: 'A', ota_site: '에어비앤비', review_month: '2026-07', content: '7월 리뷰' })]
    expect(selectBucketReviews(v, r, '신설', 'Airbnb', '2026-07-01', 'month').map(d => d.review.id)).toEqual(['A'])
    expect(selectBucketReviews(v, r, '신설', 'Airbnb', '2026-08-01', 'month')).toEqual([])
  })
})

describe('drilldownCollectedRange', () => {
  it('드릴다운 버킷 구간 전체를 덮는 수집일 경계(UTC)를 만든다', () => {
    // 라벨 2026-08-31 = 08-25(화)~08-31(월). KST 08-25 0시 = UTC 08-24 15시.
    expect(drilldownCollectedRange([{ weekStart: '2026-08-31', granularity: 'week' }]))
      .toEqual({ gte: '2026-08-24T15:00:00Z', lt: '2026-08-31T15:00:00Z' })
  })

  it('여러 버킷이면 가장 이른 시작부터 가장 늦은 끝까지', () => {
    expect(drilldownCollectedRange([
      { weekStart: '2026-08-03', granularity: 'week' },
      { weekStart: '2026-07-01', granularity: 'month' },
    ])).toEqual({ gte: '2026-06-30T15:00:00Z', lt: '2026-08-03T15:00:00Z' })
  })

  it('대상이 없으면 null', () => {
    expect(drilldownCollectedRange([])).toBe(null)
  })
})
