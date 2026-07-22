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
