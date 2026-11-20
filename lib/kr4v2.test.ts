import { describe, expect, it } from 'vitest'
import { cellOf, monthToDate, monthsOf, topComplaints, v2Tone, weekStart, type V2NegStar, type V2Review } from './kr4v2'

const r = (id: string, date: string, week: string, score: number, neg: number, branch = '신설'): V2Review =>
  ({ review_id: id, branch, review_date: date, week_label: week, score10: score, neg_count: neg })

describe('불편 지수', () => {
  it('불편 별 합 ÷ 분석한 리뷰 수 × 100 — 불편이 없는 리뷰도 분모에 든다', () => {
    const c = cellOf([r('a', '2026-11-03', '2026-11-03', 10, 0), r('b', '2026-11-03', '2026-11-03', 6, 3)])
    expect(c.idx).toBe(150)
    expect(c.n).toBe(2)
    expect(c.avg).toBe(8)
  })
  it('리뷰가 없으면 값이 없다(0이 아니다)', () => {
    expect(cellOf([]).idx).toBeNull()
    expect(v2Tone(null)).toBe('none')
  })
  it('목표는 50 미만 — 50은 넘은 것으로 본다', () => {
    expect(v2Tone(49.9)).toBe('ok')
    expect(v2Tone(50)).toBe('over')
  })
})

describe('기간', () => {
  it('달 누적은 고른 주가 끝나는 날까지, 그 달 리뷰만', () => {
    const rs = [r('a', '2026-10-31', '2026-11-03', 9, 1), r('b', '2026-11-02', '2026-11-03', 9, 1), r('c', '2026-11-05', '2026-11-10', 9, 1)]
    expect(monthToDate(rs, '신설', '2026-11-03').map(x => x.review_id)).toEqual(['b'])
    expect(monthToDate(rs, '신설', '2026-11-10').map(x => x.review_id)).toEqual(['b', 'c'])
  })
  it('주는 화요일에 시작해 라벨(월요일)에 끝난다', () => {
    expect(weekStart('2026-11-17')).toBe('2026-11-11')
  })
  it('달 목록은 6월부터 마지막 리뷰의 달까지', () => {
    expect(monthsOf([r('a', '2026-08-02', '2026-08-03', 9, 0)])).toEqual(['2026-06', '2026-07', '2026-08'])
  })
})

describe('가장 많은 불편', () => {
  it('건수 순, 같으면 그 리뷰 평균 점수 낮은 순, 기간 밖 별은 세지 않는다', () => {
    const rs = [r('a', '2026-11-03', '2026-11-03', 9, 1), r('b', '2026-11-03', '2026-11-03', 5, 1)]
    const st: V2NegStar[] = [
      { review_id: 'a', branch: '신설', galaxy: '시설', phenomenon: '객실 좁음', owner: '운영 밖' },
      { review_id: 'b', branch: '신설', galaxy: '청결', phenomenon: '객실 냄새', owner: 'CM' },
      { review_id: 'zz', branch: '신설', galaxy: '청결', phenomenon: '객실 냄새', owner: 'CM' },
    ]
    expect(topComplaints(rs, st).map(t => [t.phenomenon, t.count])).toEqual([['객실 냄새', 1], ['객실 좁음', 1]])
  })
})
