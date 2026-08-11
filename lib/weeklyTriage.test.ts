import { describe, it, expect } from 'vitest'
import {
  isTriageVerdict, isTriageBranch, summarizeTriage, triageableIds,
  type TriageRow,
} from './weeklyTriage'

const row = (review_id: string, verdict: TriageRow['verdict']): TriageRow =>
  ({ review_id, week_start: '2026-08-10', property_id: 1, verdict, note: null })

describe('isTriageVerdict', () => {
  it('세 판단만 참이다', () => {
    expect(isTriageVerdict('조치')).toBe(true)
    expect(isTriageVerdict('이월')).toBe(true)
    expect(isTriageVerdict('종결')).toBe(true)
  })
  it('그 밖의 값은 거짓 — API가 임의 문자열을 DB에 흘리지 않는 가드다', () => {
    expect(isTriageVerdict('대기')).toBe(false)
    expect(isTriageVerdict('')).toBe(false)
    expect(isTriageVerdict(null)).toBe(false)
    expect(isTriageVerdict(undefined)).toBe(false)
  })
})

describe('isTriageBranch — 판단은 담당 지점만', () => {
  it('신설·동대문만 판단 대상이다', () => {
    expect(isTriageBranch('신설')).toBe(true)
    expect(isTriageBranch('동대문')).toBe(true)
  })
  it('타 지점은 담당 FO 몫 — 상태를 붙이지 않는다', () => {
    expect(isTriageBranch('제주시티')).toBe(false)
    expect(isTriageBranch('고성')).toBe(false)
  })
})

describe('summarizeTriage', () => {
  it('판단별로 세고, 판단 없는 리뷰는 대기다', () => {
    const triage = { a: row('a', '조치'), b: row('b', '종결'), c: row('c', '종결') }
    expect(summarizeTriage(['a', 'b', 'c', 'd', 'e'], triage))
      .toEqual({ 조치: 1, 이월: 0, 종결: 2, 대기: 2 })
  })
  it('전부 판단되면 대기 0 — 이 0이 "다 읽고 판단했다"의 화면 증거다', () => {
    const triage = { a: row('a', '이월') }
    expect(summarizeTriage(['a'], triage)).toEqual({ 조치: 0, 이월: 1, 종결: 0, 대기: 0 })
  })
  it('목록에 없는 리뷰의 판단은 세지 않는다 — 다른 주의 판단이 이번 주 요약에 섞이면 안 된다', () => {
    const triage = { zzz: row('zzz', '조치') }
    expect(summarizeTriage(['a'], triage)).toEqual({ 조치: 0, 이월: 0, 종결: 0, 대기: 1 })
  })
  it('빈 목록은 전부 0', () => {
    expect(summarizeTriage([], { a: row('a', '조치') }))
      .toEqual({ 조치: 0, 이월: 0, 종결: 0, 대기: 0 })
  })
})

describe('triageableIds', () => {
  const reviews = {
    1: { items: [{ id: 'a' }, { id: 'b' }] },   // 신설
    2: { items: [{ id: 'c' }] },                // 제주시티
    3: { items: [] as { id: string }[] },       // 동대문 — 미달 0건
  }

  it('판단 지점 카드의 미달 리뷰만 모은다', () => {
    const cards = [
      { branch: '신설', propertyId: 1 },
      { branch: '제주시티', propertyId: 2 },
      { branch: '동대문', propertyId: 3 },
    ]
    expect(triageableIds(cards, reviews)).toEqual(['a', 'b'])
  })

  it('타 지점 리뷰를 섞으면 영영 대기로 남아 요약이 거짓을 말한다 — 여기서 걸러진다', () => {
    const cards = [{ branch: '고성', propertyId: 2 }]
    expect(triageableIds(cards, reviews)).toEqual([])
  })

  it('원문 미확보 채널(reviews에 키 없음)은 조용히 건너뛴다', () => {
    expect(triageableIds([{ branch: '신설', propertyId: 99 }], reviews)).toEqual([])
  })
})
