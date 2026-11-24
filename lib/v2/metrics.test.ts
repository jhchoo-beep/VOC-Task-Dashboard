import { describe, expect, it } from 'vitest'
import { cellOf, indexWithout, inScope, isLowPraise, monthsOf, periodMonths, quarterOf, rankComplaints, type Rev, type Star } from './metrics'

const rev = (id: string, o: Partial<Rev> = {}): Rev => ({ id, branch: '신설', channel: 'Agoda', date: '2026-11-03', score: 9.2, hasText: true, neg: 0, pos: 1, ...o })
const star = (reviewId: string, phenomenon: string, o: Partial<Star> = {}): Star => ({
  id: `${reviewId}-${phenomenon}`, reviewId, branch: '신설', channel: 'Agoda', date: '2026-11-03', galaxy: '청결', phenomenon, owner: 'HK', quote: '', ...o,
})

describe('cellOf', () => {
  it('불편 지수 = 불편 건수 ÷ 리뷰 수 × 100, 점수와 무관하게 센다', () => {
    const c = cellOf([rev('a', { neg: 3, score: 10 }), rev('b', { neg: 0 }), rev('c', { neg: 1, score: 6 }), rev('d')])
    expect(c.n).toBe(4)
    expect(c.neg).toBe(4)
    expect(c.idx).toBe(100)
    expect(c.negReviews).toBe(2)
  })
  it('리뷰가 없으면 지수와 평균은 null', () => {
    expect(cellOf([])).toMatchObject({ n: 0, idx: null, avg: null, lowIdx: null })
  })
  it('저점 칭찬 = 9점 미만, 불편 0, 칭찬 1 이상, 글 있음', () => {
    expect(isLowPraise(rev('a', { score: 8.4, neg: 0, pos: 2 }))).toBe(true)
    expect(isLowPraise(rev('b', { score: 9, neg: 0, pos: 2 }))).toBe(false)
    expect(isLowPraise(rev('c', { score: 8, neg: 1, pos: 2 }))).toBe(false)
    expect(isLowPraise(rev('d', { score: 8, neg: 0, pos: 0 }))).toBe(false)
    expect(isLowPraise(rev('e', { score: 8, neg: 0, pos: 1, hasText: false }))).toBe(false)
    expect(cellOf([rev('a', { score: 8.4 }), rev('b'), rev('c'), rev('d')]).lowIdx).toBe(25)
  })
})

describe('기간', () => {
  it('고성은 분기로 묶고 다른 지점은 그 달만 본다', () => {
    expect(quarterOf('2026-11')).toBe('2026-Q4')
    expect(periodMonths('고성', '2026-11')).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(periodMonths('신설', '2026-11')).toEqual(['2026-11'])
  })
  it('달 목록은 6월부터 마지막 리뷰 달까지', () => {
    expect(monthsOf([rev('a', { date: '2026-08-02' })])).toEqual(['2026-06', '2026-07', '2026-08'])
  })
  it('지점과 달로 거른다', () => {
    const rs = [rev('a'), rev('b', { branch: '동대문' }), rev('c', { date: '2026-10-30' })]
    expect(inScope(rs, '신설', ['2026-11']).map(r => r.id)).toEqual(['a'])
    expect(inScope(rs, '전체', ['2026-11']).map(r => r.id)).toEqual(['a', 'b'])
  })
})

describe('rankComplaints', () => {
  it('건수 많은 순, 같으면 리뷰 평균 점수 낮은 순', () => {
    const revs = [rev('a', { score: 9.6, neg: 2 }), rev('b', { score: 6, neg: 1 }), rev('c', { score: 8, neg: 1 }), rev('d')]
    const stars = [star('a', '소음'), star('a', '냄새'), star('b', '냄새'), star('c', '소음'), star('x', '범위 밖')]
    const r = rankComplaints(revs, stars)
    expect(r.map(x => x.phenomenon)).toEqual(['냄새', '소음'])   // 둘 다 2건, 냄새 평균 7.8 < 소음 8.8
    expect(r[0]).toMatchObject({ count: 2, reviews: 2, contrib: 50, avg: 7.8 })
  })
  it('이 불편이 없었다면의 지수', () => {
    const c = cellOf([rev('a', { neg: 2 }), rev('b', { neg: 1 })])
    expect(indexWithout(c, 2)).toBe(50)
  })
})
