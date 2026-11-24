import { describe, expect, it } from 'vitest'
import {
  autoSegment, autoSeverity, csvRowToRaw, kstDay, discomfortHref, filterRaw, filterReviews, parseCsv, rawKpis, reviewKpis, reviewText,
  reviewsCsv, sortRaw, sortReviews, uniqMonths, type RawRow, type ReviewRow,
} from './reviewsView'

const rv = (o: Partial<ReviewRow>): ReviewRow => ({
  id: 'x', branch: '신설', ota_site: '아고다', rating: 9, review_month: '2026-11', content: 'good', content_ko: '좋음',
  categories: [], severity: 'Low', churn_triggers: [], customer_segment: '충성', status: '신규접수', created_at: '2026-11-01T00:00:00Z', ...o,
})
const raw = (o: Partial<RawRow>): RawRow => ({
  id: 'r', branch: '신설', ota_site: '아고다', review_month: '2026-11', reviewer: null, country: null, travel_type: null, room_type: null,
  rating: 8, content: 'text', has_response: false, raw_date: null, created_at: '2026-11-02T03:00:00Z', ...o,
})

describe('1.0 자동 계산 그대로', () => {
  it('세그먼트', () => {
    expect([10, 9, 8.9, 7, 6.9, 5, 4.9].map(autoSegment)).toEqual(['충성', '충성', '만족', '만족', '위험', '위험', '이탈'])
    expect(autoSegment('')).toBe('')
  })
  it('Severity: 트리거가 점수보다 먼저', () => {
    expect(autoSeverity(10, ['청결 Critical'])).toBe('Critical')
    expect(autoSeverity(5.5, ['복합이슈'])).toBe('Critical')
    expect(autoSeverity(8, ['복합이슈'])).toBe('High')
    expect([3, 5, 7, 7.5].map(r => autoSeverity(r, []))).toEqual(['Critical', 'High', 'Medium', 'Low'])
  })
})

describe('번역', () => {
  it('한국어 번역을 먼저, 원어는 번역과 다를 때만', () => {
    expect(reviewText({ content: 'nice', content_ko: '좋아요' })).toEqual({ text: '좋아요', original: 'nice' })
    expect(reviewText({ content: '좋아요', content_ko: '좋아요' })).toEqual({ text: '좋아요', original: null })
    expect(reviewText({ content: 'nice', content_ko: null })).toEqual({ text: 'nice', original: null })
  })
})

describe('거르기·정렬', () => {
  const rows = [
    rv({ id: 'a', branch: '신설', rating: 6, severity: 'Medium', content: 'noisy', content_ko: '시끄러움' }),
    rv({ id: 'b', branch: '동대문', rating: 10, severity: 'Low', ota_site: '트립닷컴' }),
    rv({ id: 'c', branch: '신설', rating: 2, severity: 'Critical', content_ko: null }),
  ]
  it('지점·점수·채널·검색(2.0 불편 현상 포함)', () => {
    const f = { branch: '전체' as const, channel: '', severity: '', score: 'all' as const, q: '' }
    expect(filterReviews(rows, { ...f, branch: '신설' }).map(r => r.id)).toEqual(['a', 'c'])
    expect(filterReviews(rows, { ...f, score: 'lt9' }).map(r => r.id)).toEqual(['a', 'c'])
    expect(filterReviews(rows, { ...f, score: 'ge9' }).map(r => r.id)).toEqual(['b'])
    expect(filterReviews(rows, { ...f, channel: '트립닷컴' }).map(r => r.id)).toEqual(['b'])
    expect(filterReviews(rows, { ...f, q: '시끄' }).map(r => r.id)).toEqual(['a'])
    expect(filterReviews(rows, { ...f, q: '샤워기' }, new Map([['c', ['샤워기 수압 약함']]])).map(r => r.id)).toEqual(['c'])
  })
  it('정렬 방향과 Severity 순서', () => {
    expect(sortReviews(rows, 'score', 'asc').map(r => r.id)).toEqual(['c', 'a', 'b'])
    expect(sortReviews(rows, 'score', 'desc').map(r => r.id)).toEqual(['b', 'a', 'c'])
    expect(sortReviews(rows, 'severity', 'asc').map(r => r.id)).toEqual(['c', 'a', 'b'])
  })
  it('Raw 는 수집일 최근 순이 기본', () => {
    const rs = [raw({ id: '1', created_at: '2026-11-01T00:00:00Z' }), raw({ id: '2', created_at: '2026-11-03T00:00:00Z', branch: '고성' })]
    expect(sortRaw(rs, 'collected', 'desc').map(r => r.id)).toEqual(['2', '1'])
    expect(filterRaw(rs, { branch: '고성', channel: '', q: '' }).map(r => r.id)).toEqual(['2'])
  })
})

describe('지표', () => {
  it('리뷰: 9점 미만, 번역 없음, 2.0 분석 수', () => {
    const k = reviewKpis([rv({ id: 'a', rating: 8 }), rv({ id: 'b', rating: 10, content_ko: '' }), rv({ id: 'c', rating: 9 })], new Set(['a', 'z']))
    expect(k).toMatchObject({ n: 3, analyzed: 1, avg: 9, low: 1, noKo: 1, foreign: 2 })
  })
  it('수집일은 한국 날짜', () => {
    expect(kstDay('2026-11-02T16:00:00+00:00')).toBe('2026-11-03')
    expect(kstDay(null)).toBe('')
  })
  it('Raw: 답변 완료와 마지막 수집일', () => {
    const k = rawKpis([raw({ has_response: true, created_at: '2026-11-03T01:00:00Z' }), raw({ created_at: '2026-11-03T09:00:00Z', rating: null }), raw({ created_at: '2026-10-30T00:00:00Z', rating: 6 })])
    expect(k).toMatchObject({ n: 3, avg: 7, scored: 2, answered: 1, lastDay: '2026-11-03', lastDayN: 2 })
  })
})

describe('CSV', () => {
  it('내려받기: 따옴표 이스케이프와 배열 칸', () => {
    const csv = reviewsCsv([rv({ content: 'say "hi"', categories: ['청결', '소음'] })])
    expect(csv.split('\n')[0]).toBe('"지점","OTA","평점","Severity","세그먼트","리뷰월","카테고리","변심트리거","내용(한국어)","내용(원문)"')
    expect(csv).toContain('"청결|소음"')
    expect(csv).toContain('"say ""hi"""')
  })
  it('올리기: 한글 머리도 읽는다', () => {
    const rows = parseCsv('날짜,점수,리뷰어,국가,리뷰 내용\n3/31,10,Fala,CN,"좋아요"\n,,,,\n')
    expect(rows).toEqual([{ 날짜: '3/31', 점수: '10', 리뷰어: 'Fala', 국가: 'CN', '리뷰 내용': '좋아요' }])
    expect(csvRowToRaw(rows[0], { branch: '신설', ota_site: '아고다', review_month: '2026-03' }))
      .toMatchObject({ branch: '신설', content: '좋아요', rating: 10, reviewer: 'Fala', country: 'CN', raw_date: '3/31' })
  })
})

describe('주소·달', () => {
  it('불편 지수로 가는 주소', () => {
    expect(discomfortHref('', '신설', '2026-11', '샤워기 수압 약함')).toBe('/v2/discomfort?branch=%EC%8B%A0%EC%84%A4&month=2026-11&p=%EC%83%A4%EC%9B%8C%EA%B8%B0+%EC%88%98%EC%95%95+%EC%95%BD%ED%95%A8')
    expect(discomfortHref('/embed', '', '2026-10')).toBe('/embed/v2/discomfort?month=2026-10')
  })
  it('달 목록은 최신 순, 형식이 맞는 것만', () => {
    expect(uniqMonths(['2026-03', '2026-11'], ['2021-10', '2026-11', '', null, 'x'])).toEqual(['2026-11', '2026-03', '2021-10'])
  })
})
