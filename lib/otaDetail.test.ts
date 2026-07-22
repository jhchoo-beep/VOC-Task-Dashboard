import { describe, it, expect } from 'vitest'
import { parseRawDate, weekStartOf, monthStartOf } from './otaDetail'

describe('parseRawDate', () => {
  it('ISO 형식(아고다·익스피디아)을 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026-07-21')).toEqual({ date: '2026-07-21', month: '2026-07' })
  })

  it('한글 전체 날짜(부킹·트립닷컴)를 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026년 7월 22일')).toEqual({ date: '2026-07-22', month: '2026-07' })
    expect(parseRawDate('2023년 7월 29일')).toEqual({ date: '2023-07-29', month: '2023-07' })
  })

  it('점 구분 형식(야놀자)을 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026.07.04')).toEqual({ date: '2026-07-04', month: '2026-07' })
    expect(parseRawDate('2026.06.08')).toEqual({ date: '2026-06-08', month: '2026-06' })
  })

  it('한글 연월(에어비앤비)은 일이 없으므로 date가 null이다', () => {
    expect(parseRawDate('2026년 6월')).toEqual({ date: null, month: '2026-06' })
  })

  it('상대 표현(여기어때)은 review_month로 대체한다', () => {
    expect(parseRawDate('2개월 전', '2026-04')).toEqual({ date: null, month: '2026-04' })
  })

  it('해석 불가 + review_month도 없으면 둘 다 null이다', () => {
    expect(parseRawDate('알 수 없음')).toEqual({ date: null, month: null })
    expect(parseRawDate(null)).toEqual({ date: null, month: null })
    expect(parseRawDate('')).toEqual({ date: null, month: null })
  })

  it('한 자리 월·일을 0으로 채운다', () => {
    expect(parseRawDate('2026년 3월 5일')).toEqual({ date: '2026-03-05', month: '2026-03' })
  })
})

describe('weekStartOf', () => {
  it('월요일 시작 주로 내린다', () => {
    expect(weekStartOf('2026-07-22')).toBe('2026-07-20') // 수 → 월
    expect(weekStartOf('2026-07-20')).toBe('2026-07-20') // 월 → 그대로
    expect(weekStartOf('2026-07-26')).toBe('2026-07-20') // 일 → 그 주 월
  })

  it('월 경계를 넘어가도 맞는 월요일을 찾는다', () => {
    expect(weekStartOf('2026-07-01')).toBe('2026-06-29')
  })
})

describe('monthStartOf', () => {
  it('월 첫날로 정규화한다', () => {
    expect(monthStartOf('2026-06')).toBe('2026-06-01')
  })
})

import { bandsFor, distColumnsFor, distFromRatings, OTA_SITE_BY_NAME } from './otaDetail'

describe('bandsFor', () => {
  it('10점 채널은 1점대~10점 10밴드다', () => {
    // 부킹·트립·여기어때에 1.0점 리뷰가 실재하므로 1점대를 포함한다
    expect(bandsFor(10)).toEqual(['1점대','2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점'])
  })

  it('5점 채널은 원척도 1~5점 5밴드다', () => {
    expect(bandsFor(5)).toEqual(['1점','2점','3점','4점','5점'])
  })
})

describe('distColumnsFor', () => {
  it('밴드 수만큼의 컬럼명을 준다', () => {
    expect(distColumnsFor(10)).toHaveLength(10)
    expect(distColumnsFor(10)[0]).toBe('score_1')
    expect(distColumnsFor(10)[9]).toBe('score_10')
    expect(distColumnsFor(5)).toEqual(['score_1','score_2','score_3','score_4','score_5'])
  })
})

describe('distFromRatings', () => {
  it('10점 채널의 점수를 내림해 밴드에 담는다', () => {
    const r = distFromRatings([10, 10, 8.4, 8.0, 9.9], 10)
    expect(r.counts.score_10).toBe(2)
    expect(r.counts.score_8).toBe(2)
    expect(r.counts.score_9).toBe(1)
    expect(r.total).toBe(5)
  })

  it('평균은 밴드가 아니라 실제 rating으로 낸다', () => {
    // 밴드 중앙값이었다면 (10+10+8+8+9)/5 = 9.0으로 잘못 나온다
    const r = distFromRatings([10, 10, 8.4, 8.0, 9.9], 10)
    expect(r.avg).toBe(9.3)
  })

  it('10점 채널의 1점대를 버리지 않는다', () => {
    const r = distFromRatings([1.0, 1.5, 2.0], 10)
    expect(r.counts.score_1).toBe(2)
    expect(r.counts.score_2).toBe(1)
  })

  it('5점 채널은 원척도 그대로 담는다', () => {
    const r = distFromRatings([5, 5, 4, 1], 5)
    expect(r.counts.score_5).toBe(2)
    expect(r.counts.score_4).toBe(1)
    expect(r.counts.score_1).toBe(1)
    expect(r.avg).toBe(3.8)
  })

  it('척도 밖 값은 양 끝 밴드로 클램프한다', () => {
    const r = distFromRatings([0, 11], 10)
    expect(r.counts.score_1).toBe(1)
    expect(r.counts.score_10).toBe(1)
  })

  it('빈 입력은 avg 0, total 0이다', () => {
    const r = distFromRatings([], 10)
    expect(r.avg).toBe(0)
    expect(r.total).toBe(0)
    expect(r.counts.score_5).toBe(0)
  })
})

describe('OTA_SITE_BY_NAME', () => {
  it('ota_properties의 영문명을 raw_reviews의 한글명으로 옮긴다', () => {
    expect(OTA_SITE_BY_NAME['Agoda']).toBe('아고다')
    expect(OTA_SITE_BY_NAME['Booking']).toBe('부킹닷컴')
    expect(OTA_SITE_BY_NAME['Trip.com']).toBe('트립닷컴')
    expect(OTA_SITE_BY_NAME['Expedia']).toBe('익스피디아')
    expect(OTA_SITE_BY_NAME['Airbnb']).toBe('에어비앤비')
    expect(OTA_SITE_BY_NAME['NOL']).toBe('야놀자')
    expect(OTA_SITE_BY_NAME['여기어때']).toBe('여기어때')
  })
})
