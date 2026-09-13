import { describe, it, expect } from 'vitest'
import {
  collectedDateKst, resolveReviewDate, collectedRangeUtc, rawMonthOrCollectedFilter,
  pairReviewsWithRaw,
} from './otaDetail'

// 2026-08-13 수집분부터 아고다 raw_date 가 작성일('2026-08-12') 대신 투숙월('August 2026')로 온다.
// 주 단위 채널은 일자가 없으면 어느 주에도 넣을 수 없어 4주간 아고다 주간 버킷이 비었다.
// 그때는 raw 의 수집일(created_at, KST 달력)을 날짜로 쓴다(2026-09-13 재헌 결정).

describe('collectedDateKst', () => {
  it('Supabase가 돌려주는 UTC 타임스탬프를 KST 날짜로 바꾼다', () => {
    expect(collectedDateKst('2026-08-29T15:30:00+00:00')).toBe('2026-08-30')
    expect(collectedDateKst('2026-09-12T20:19:21.848334+00:00')).toBe('2026-09-13')
  })

  it('KST 자정 직전은 같은 날로 남는다', () => {
    expect(collectedDateKst('2026-08-29T14:59:59+00:00')).toBe('2026-08-29')
  })

  it('SQL 표기(공백 구분·+00)와 Z 표기도 읽는다', () => {
    expect(collectedDateKst('2026-09-04 20:21:57.948409+00')).toBe('2026-09-05')
    expect(collectedDateKst('2026-09-04T20:21:57Z')).toBe('2026-09-05')
  })

  it('다른 오프셋이 붙어 있어도 KST로 환산한다', () => {
    expect(collectedDateKst('2026-08-30T00:10:00+09:00')).toBe('2026-08-30')
    expect(collectedDateKst('2026-08-29T08:00:00-07:00')).toBe('2026-08-30')
  })

  it('월말·연말 경계를 넘긴다', () => {
    expect(collectedDateKst('2026-12-31T15:00:00+00:00')).toBe('2027-01-01')
  })

  it('읽을 수 없으면 null', () => {
    expect(collectedDateKst(null)).toBe(null)
    expect(collectedDateKst('')).toBe(null)
    expect(collectedDateKst('어제')).toBe(null)
  })
})

describe('resolveReviewDate', () => {
  const agoda = (raw_date: string | null, created_at: string | null) =>
    ({ ota_site: '아고다', raw_date, created_at })

  it('raw_date에 일자가 있으면 그대로 쓴다 — 수집일로 덮지 않는다', () => {
    expect(resolveReviewDate(agoda('2026-08-12', '2026-08-12T19:56:08+00:00'), '2026-08'))
      .toEqual({ date: '2026-08-12', month: '2026-08', dateSource: 'raw' })
  })

  it('주 단위 채널인데 일자가 없으면(투숙월) 수집일 KST를 쓴다 — 달도 수집일의 달이다', () => {
    // 실측: 신설 아고다 KONOKA 6.0 — raw_date 'August 2026', 수집 2026-08-30 05:57 KST
    expect(resolveReviewDate(agoda('August 2026', '2026-08-29T20:57:52+00:00'), '2026-08'))
      .toEqual({ date: '2026-08-30', month: '2026-08', dateSource: 'collected' })
  })

  it('투숙월이 오래돼도 수집일의 달을 쓴다', () => {
    // 실측: 신설 아고다 TETSUKO 4.4 — 투숙 'May 2026', 수집 2026-09-01 05:34 KST
    expect(resolveReviewDate(agoda('May 2026', '2026-08-31T20:34:03+00:00'), '2026-05'))
      .toEqual({ date: '2026-09-01', month: '2026-09', dateSource: 'collected' })
  })

  it('월 단위 채널(에어비앤비)은 수집일로 바꾸지 않는다 — 원래 달 버킷을 쓴다', () => {
    expect(resolveReviewDate(
      { ota_site: '에어비앤비', raw_date: '2026년 7월', created_at: '2026-08-02T20:00:00+00:00' }, '2026-07',
    )).toEqual({ date: null, month: '2026-07', dateSource: null })
  })

  it('수집일이 없으면 일자 미상으로 남긴다', () => {
    expect(resolveReviewDate(agoda('August 2026', null), '2026-08'))
      .toEqual({ date: null, month: '2026-08', dateSource: null })
  })

  it('raw 짝이 없으면 review_month만 남는다', () => {
    expect(resolveReviewDate(null, '2026-08')).toEqual({ date: null, month: '2026-08', dateSource: null })
  })
})

describe('collectedRangeUtc', () => {
  it('KST 달력 구간을 created_at(UTC) 비교 경계로 바꾼다 — 끝은 다음 날 0시 미만', () => {
    expect(collectedRangeUtc('2026-08-01', '2026-08-31'))
      .toEqual({ gte: '2026-07-31T15:00:00Z', lt: '2026-08-31T15:00:00Z' })
  })
})

describe('rawMonthOrCollectedFilter', () => {
  it('review_month 목록 OR 수집일 구간을 PostgREST or 필터로 만든다', () => {
    expect(rawMonthOrCollectedFilter(
      ['2026-07', '2026-08'], { gte: '2026-06-30T15:00:00Z', lt: '2026-08-31T15:00:00Z' },
    )).toBe('review_month.in.(2026-07,2026-08),and(created_at.gte."2026-06-30T15:00:00Z",created_at.lt."2026-08-31T15:00:00Z")')
  })
})

describe('pairReviewsWithRaw — 일자 있는 사본 우선', () => {
  // 실측: 8/14 수집분에 8/13 이전 ISO 날짜로 이미 들어온 리뷰의 투숙월 사본이 섞였다
  // (신설 아고다 Jinjoo 9.6 — 2026-08-04 ISO 행과 'July 2026' 행). 사본을 집으면 작성일 대신
  // 수집일(8/14)이 붙어 리뷰가 다른 주로 옮겨 간다.
  const body = '가성비 숙소로 좋습니다 1인실 이용했는데 에어컨도 빵빵하게 잘 나오고'
  const iso  = { id: 'iso',  branch: '신설', ota_site: '아고다', review_month: '2026-08', raw_date: '2026-08-04',  rating: 9.6, content: body, created_at: '2026-08-05T19:56:42+00:00' }
  const copy = { id: 'copy', branch: '신설', ota_site: '아고다', review_month: '2026-08', raw_date: 'August 2026', rating: 9.6, content: body, created_at: '2026-08-13T20:39:06+00:00' }
  const rev  = [{ branch: '신설', ota_site: '아고다', review_month: '2026-08', rating: 9.6, content: body }]

  it('같은 리뷰의 ISO 사본과 투숙월 사본이 함께 있으면 ISO 사본을 집는다 — 배열 순서와 무관', () => {
    expect(pairReviewsWithRaw(rev, [copy, iso])[0].raw?.id).toBe('iso')
    expect(pairReviewsWithRaw(rev, [iso, copy])[0].raw?.id).toBe('iso')
  })

  it('일자 있는 사본이 다른 달에만 있으면 같은 달 우선이 그대로 이긴다', () => {
    const isoOther = { ...iso, review_month: '2026-07', raw_date: '2026-07-30' }
    expect(pairReviewsWithRaw(rev, [isoOther, copy])[0].raw?.id).toBe('copy')
  })
})
