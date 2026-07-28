import { describe, it, expect } from 'vitest'
import { flattenCandidates, branchesOf, buildTaskPrompt, selectVisibleTasks } from './weeklyTasks'
import type { WeeklyChannelRow } from './weeklyReport'
import type { ChannelReviews } from './weeklyReviews'
import type { WeeklyTaskRow } from './weeklyTasks'

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

describe('buildTaskPrompt', () => {
  const items = [
    { id: 'a', branch: '신설', otaName: 'Agoda', rating: 6.0, date: '2026-07-24', body: '체크인이 오래 걸렸다', translated: true },
    { id: 'b', branch: '동대문', otaName: 'Trip.com', rating: null, date: null, body: '', translated: false },
  ]

  it('리뷰마다 지점·채널·점수·날짜를 붙인다', () => {
    const got = buildTaskPrompt(items, '2026-07-27')
    expect(got).toContain('1. 신설 · Agoda · 6.0점 · 2026-07-24')
    expect(got).toContain('체크인이 오래 걸렸다')
  })

  it('점수·날짜·본문이 없어도 자리를 비워 두지 않는다', () => {
    const got = buildTaskPrompt(items, '2026-07-27')
    expect(got).toContain('2. 동대문 · Trip.com · 점수 없음')
    expect(got).toContain('(본문 없음)')
  })

  it('없는 원인을 지어내지 말라는 규칙과 출력 형식을 포함한다', () => {
    const got = buildTaskPrompt(items, '2026-07-27')
    expect(got).toContain('쓰여 있지 않은 원인을 추정하지 않습니다')
    expect(got).toContain('제목:')
    expect(got).toContain('문제 정의:')
    expect(got).toContain('해결안:')
  })

  it('주 라벨과 건수를 머리말에 쓴다', () => {
    expect(buildTaskPrompt(items, '2026-07-27')).toContain('2026-07-27 주간 OTA 리포트')
    expect(buildTaskPrompt(items, '2026-07-27')).toContain('미달한 리뷰 2건')
  })
})

const task = (o: Partial<WeeklyTaskRow> & { id: string; week_start: string }): WeeklyTaskRow => ({
  branches: ['신설'], title: '제목', problem_definition: null, solution: null,
  assignee: null, due_date: null, status: '시작전', escalated: false, escalated_at: null,
  source_reviews: [], created_at: '2026-07-27T00:00:00Z', updated_at: '2026-07-27T00:00:00Z', ...o,
})

describe('selectVisibleTasks', () => {
  it('그 주에 만든 과제는 완료된 것도 남긴다', () => {
    const rows = [task({ id: 'x', week_start: '2026-07-27', status: '완료' })]
    const { current, carried } = selectVisibleTasks(rows, '2026-07-27')
    expect(current.map(r => r.id)).toEqual(['x'])
    expect(carried).toEqual([])
  })

  it('지난 주의 미완 과제는 이월된다', () => {
    const rows = [task({ id: 'old', week_start: '2026-07-20', status: '진행중' })]
    const { carried } = selectVisibleTasks(rows, '2026-07-27')
    expect(carried.map(r => r.id)).toEqual(['old'])
  })

  it('지난 주라도 완료됐으면 이월하지 않는다', () => {
    const rows = [task({ id: 'done', week_start: '2026-07-20', status: '완료' })]
    const { current, carried } = selectVisibleTasks(rows, '2026-07-27')
    expect(current).toEqual([])
    expect(carried).toEqual([])
  })

  it('다음달 채택된 과제는 미완이어도 이월하지 않는다', () => {
    const rows = [task({ id: 'esc', week_start: '2026-07-20', status: '진행중', escalated: true })]
    expect(selectVisibleTasks(rows, '2026-07-27').carried).toEqual([])
  })

  it('미래 주의 과제는 어느 쪽에도 넣지 않는다', () => {
    const rows = [task({ id: 'future', week_start: '2026-08-03', status: '진행중' })]
    const { current, carried } = selectVisibleTasks(rows, '2026-07-27')
    expect(current).toEqual([])
    expect(carried).toEqual([])
  })

  it('이월은 최신 주부터 나열한다', () => {
    const rows = [
      task({ id: 'a', week_start: '2026-07-06', status: '진행중' }),
      task({ id: 'b', week_start: '2026-07-20', status: '진행중' }),
      task({ id: 'c', week_start: '2026-07-13', status: '진행중' }),
    ]
    expect(selectVisibleTasks(rows, '2026-07-27').carried.map(r => r.id)).toEqual(['b', 'c', 'a'])
  })
})
