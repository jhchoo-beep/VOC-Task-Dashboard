import { describe, expect, it } from 'vitest'
import { galaxyByMonth, ownerShare, recurring, weekStartOf, weeksOf } from './trends'
import type { Rev, Star } from './metrics'

const star = (reviewId: string, phenomenon: string, date: string, o: Partial<Star> = {}): Star => ({
  id: `${reviewId}-${phenomenon}`, reviewId, branch: '신설', channel: 'Agoda', date, galaxy: '청결', phenomenon, owner: 'HK', quote: '', ...o,
})

describe('recurring', () => {
  const W = ['2026-09', '2026-10', '2026-11']
  it('서로 다른 리뷰 3건 이상만, 리뷰 수 많은 순', () => {
    const s = [
      star('a', '냄새', '2026-09-02'), star('b', '냄새', '2026-10-02'), star('c', '냄새', '2026-11-02'),
      star('d', '소음', '2026-11-02'), star('d', '소음', '2026-11-02', { id: 'd2' }), star('e', '소음', '2026-11-03'),
      star('f', '냄새', '2026-08-30'),   // 창 밖
    ]
    const r = recurring(s, W)
    expect(r.map(x => x.phenomenon)).toEqual(['냄새'])
    expect(r[0]).toMatchObject({ reviews: 3, count: 3, byMonth: [1, 1, 1], monthsHit: 3 })
  })
  it('지점이 다르면 다른 불편', () => {
    const s = [star('a', '냄새', '2026-11-01'), star('b', '냄새', '2026-11-02', { branch: '동대문' }), star('c', '냄새', '2026-11-03')]
    expect(recurring(s, W)).toEqual([])
  })
})

describe('집계', () => {
  it('카테고리별 달 건수, 합계 많은 순', () => {
    const s = [star('a', 'x', '2026-10-01'), star('b', 'y', '2026-11-01', { galaxy: '시설' }), star('c', 'z', '2026-11-02', { galaxy: '시설' })]
    expect(galaxyByMonth(s, '전체', ['2026-10', '2026-11'])).toEqual([
      { galaxy: '시설', byMonth: [0, 2], total: 2 },
      { galaxy: '청결', byMonth: [1, 0], total: 1 },
    ])
  })
  it('주체별 비중', () => {
    const s = [star('a', 'x', '2026-10-01'), star('b', 'y', '2026-10-01', { owner: 'FM' }), star('c', 'z', '2026-10-01', { owner: '' })]
    expect(ownerShare(s).map(o => [o.owner, o.share])).toEqual([['FM', 33.3], ['HK', 33.3], ['미정', 33.3]])
  })
  it('주 라벨', () => {
    const r = (week?: string) => ({ week } as Rev)
    expect(weeksOf([r('2026-11-24'), r('2026-11-17'), r(undefined), r('2026-11-24')])).toEqual(['2026-11-17', '2026-11-24'])
    expect(weekStartOf('2026-11-24')).toBe('2026-11-18')
  })
})
