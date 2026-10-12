import { describe, it, expect } from 'vitest'
import {
  RULES, addDays, windowStart, meetsConstellation, findFormation, groupPhenomenon,
  deriveNegativeStatus, derivePositiveStatus, recentCount, compareConstellations,
} from './constellationRules'
import { isoWeekOf } from './isoWeek'

const s = (id: string, date: string) => ({ id, date })

describe('isoWeekOf', () => {
  it('ISO 주 경계 — 월요일 시작, 목요일이 든 해', () => {
    expect(isoWeekOf('2026-10-12')).toBe('2026-W42')   // 월
    expect(isoWeekOf('2026-10-11')).toBe('2026-W41')   // 일
    expect(isoWeekOf('2026-01-01')).toBe('2026-W01')   // 목
    expect(isoWeekOf('2027-01-01')).toBe('2026-W53')   // 금 — 전년도 53주
    expect(isoWeekOf('2025-12-29')).toBe('2026-W01')   // 월 — 다음 해 1주
  })
  it('형식이 어긋나면 던진다', () => {
    expect(() => isoWeekOf('2026-10')).toThrow()
  })
})

describe('묶는 기간 90일', () => {
  it('기준일 포함 90일: 기준일-89일이 첫날', () => {
    expect(windowStart('2026-10-12')).toBe('2026-07-15')
    expect(addDays('2026-10-12', -89)).toBe('2026-07-15')
  })
  it('90일 경계 — 89일 전 별은 같은 창, 90일 전 별은 창 밖', () => {
    const asOf = '2026-10-12'
    const inside = [s('a', addDays(asOf, -89)), s('b', '2026-10-05'), s('c', asOf)]
    const outside = [s('a', addDays(asOf, -90)), s('b', '2026-10-05'), s('c', asOf)]
    expect(groupPhenomenon(inside, asOf).kind).toBe('constellation')
    // 90일 전 별은 창 밖 → 창 안에 2개만 남아 씨앗, 90일 전 별은 단발로 남는다
    const g = groupPhenomenon(outside, asOf)
    expect(g.kind).toBe('seed')
    if (g.kind === 'seed') expect(g.memberIds).toEqual(['b', 'c'])
  })
})

describe('별자리 조건 — 3개 이상 + 서로 다른 2주 이상', () => {
  it('같은 주 3건은 별자리가 아니다(씨앗)', () => {
    const sameWeek = [s('a', '2026-09-07'), s('b', '2026-09-09'), s('c', '2026-09-13')] // 모두 W37
    expect(meetsConstellation(sameWeek)).toBe(false)
    expect(groupPhenomenon(sameWeek, '2026-10-12').kind).toBe('seed')
  })
  it('같은 주 3건 + 다른 주 1건이면 별자리', () => {
    const st = [s('a', '2026-09-07'), s('b', '2026-09-09'), s('c', '2026-09-13'), s('d', '2026-09-14')]
    expect(meetsConstellation(st)).toBe(true)
  })
  it('2건이 서로 다른 주여도 별자리가 아니다(씨앗)', () => {
    const two = [s('a', '2026-09-01'), s('b', '2026-09-20')]
    expect(meetsConstellation(two)).toBe(false)
    expect(groupPhenomenon(two, '2026-10-12').kind).toBe('seed')
  })
  it('일요일과 다음 월요일은 서로 다른 ISO 주', () => {
    expect(meetsConstellation([s('a', '2026-10-11'), s('b', '2026-10-11'), s('c', '2026-10-12')])).toBe(true)
  })
  it('별 1개는 단발', () => {
    expect(groupPhenomenon([s('a', '2026-10-01')], '2026-10-12').kind).toBe('singles')
  })
})

describe('씨앗에서 별자리로 — 재생', () => {
  it('세 번째 별(다른 주)이 붙는 날 별자리가 생긴다', () => {
    const st = [s('a', '2026-08-03'), s('b', '2026-08-05'), s('c', '2026-08-20')]
    const f = findFormation(st, '2026-10-12')
    expect(f.formed).toBe(true)
    expect(f.formedAt).toBe('2026-08-20')
    expect(f.formationStarIds).toEqual(['a', 'b', 'c'])
    // 두 번째 별 시점까지는 씨앗이었다
    expect(findFormation(st, '2026-08-19').formed).toBe(false)
  })
  it('별자리가 생긴 뒤의 별은 90일이 지나도 같은 별자리에 붙는다(고정 ID)', () => {
    const st = [s('a', '2026-06-02'), s('b', '2026-06-10'), s('c', '2026-06-20'), s('d', '2026-10-10')]
    const g = groupPhenomenon(st, '2026-10-12')
    expect(g.kind).toBe('constellation')
    if (g.kind === 'constellation') expect(g.memberIds).toEqual(['a', 'b', 'c', 'd'])
  })
  it('생성 기간 전에 있던 오래된 별은 단발로 남는다', () => {
    const st = [s('old', '2026-03-01'), s('a', '2026-08-03'), s('b', '2026-08-12'), s('c', '2026-08-20')]
    const g = groupPhenomenon(st, '2026-10-12')
    expect(g.kind).toBe('constellation')
    if (g.kind === 'constellation') expect(g.memberIds).not.toContain('old')
  })
  it('기준일 뒤의 별은 보지 않는다', () => {
    const st = [s('a', '2026-10-01'), s('b', '2026-10-05'), s('c', '2026-10-20')]
    expect(groupPhenomenon(st, '2026-10-12').kind).toBe('seed')
  })
})

describe('부정 별자리 상태', () => {
  const asOf = '2026-10-12'
  it('과제가 없으면 열림', () => {
    expect(deriveNegativeStatus(['2026-09-01'], '2026-09-01', [], asOf).status).toBe('열림')
  })
  it('보류 과제만 있으면 열림', () => {
    const r = deriveNegativeStatus(['2026-07-05'], '2026-07-13',
      [{ id: 't', status: '보류', createdAt: '2026-08-02', completedAt: null }], asOf)
    expect(r.status).toBe('열림')
  })
  it('진행중·시작전 과제가 있으면 수행과제 진행', () => {
    for (const st of ['진행중', '시작전']) {
      const r = deriveNegativeStatus(['2026-09-01'], '2026-09-01',
        [{ id: 't', status: st, createdAt: '2026-10-03', completedAt: null }], asOf)
      expect(r.status).toBe('수행과제 진행')
      expect(r.activeTaskId).toBe('t')
    }
  })
  it('재발 — 완료 뒤 새 별이 붙으면 재발, 1회로 센다', () => {
    const r = deriveNegativeStatus(['2026-08-05', '2026-08-23', '2026-09-28'], '2026-08-23',
      [{ id: 't', status: '완료', createdAt: '2026-08-31', completedAt: '2026-08-31' }], asOf)
    expect(r.status).toBe('재발')
    expect(r.relapseCount).toBe(1)
  })
  it('완료 뒤 새 별 없이 90일 미만이면 관찰', () => {
    const r = deriveNegativeStatus(['2026-06-07', '2026-06-28'], '2026-06-28',
      [{ id: 't', status: '완료', createdAt: '2026-07-01', completedAt: '2026-07-21' }], asOf)
    expect(r.status).toBe('관찰')
    expect(r.observationStart).toBe('2026-07-21')
  })
  it('완료 뒤 새 별 없이 90일이 지나면 성운(경계: 정확히 90일째)', () => {
    const tasks = [{ id: 't', status: '완료', createdAt: '2026-07-01', completedAt: '2026-07-14' }]
    expect(deriveNegativeStatus(['2026-06-07'], '2026-06-28', tasks, '2026-10-12').status).toBe('성운')   // 90일
    expect(deriveNegativeStatus(['2026-06-07'], '2026-06-28', tasks, '2026-10-11').status).toBe('관찰')   // 89일
  })
  it('같은 날 등록된 보류 과제가 있어도 완료 뒤 새 별은 재발 1회', () => {
    const r = deriveNegativeStatus(['2026-06-07', '2026-06-28', '2026-09-04'], '2026-06-28', [
      { id: 'done', status: '완료', createdAt: '2026-07-01', completedAt: '2026-07-21' },
      { id: 'hold', status: '보류', createdAt: '2026-07-01', completedAt: null },
    ], asOf)
    expect(r.status).toBe('재발')
    expect(r.relapseCount).toBe(1)
  })
  it('재발 2회 — 완료·재발·새 과제 완료·재발', () => {
    const r = deriveNegativeStatus(['2026-06-01', '2026-06-20', '2026-07-10', '2026-09-20'], '2026-06-20', [
      { id: 't1', status: '완료', createdAt: '2026-06-22', completedAt: '2026-06-30' },
      { id: 't2', status: '완료', createdAt: '2026-08-01', completedAt: '2026-08-31' },
    ], asOf)
    expect(r.status).toBe('재발')
    expect(r.relapseCount).toBe(2)
  })
})

describe('긍정 별자리 상태', () => {
  const asOf = '2026-10-12'
  it('최근 90일에도 조건을 채우면 유지', () => {
    expect(derivePositiveStatus([s('a', '2026-09-01'), s('b', '2026-09-20'), s('c', '2026-10-05')], asOf)).toBe('유지')
  })
  it('최근 90일에 조건을 못 채우면 흐려짐', () => {
    expect(derivePositiveStatus([s('a', '2026-06-01'), s('b', '2026-06-20'), s('c', '2026-09-05')], asOf)).toBe('흐려짐')
  })
})

describe('순서 — 최근 4주 별 수, 같으면 최근 순', () => {
  it('recentCount 는 기준일 포함 28일', () => {
    expect(recentCount([s('a', '2026-09-15'), s('b', '2026-09-14'), s('c', '2026-10-12')], '2026-10-12')).toBe(2)
  })
  it('정렬', () => {
    const list = [
      { name: 'A', recent4w: 1, lastDate: '2026-10-10' },
      { name: 'B', recent4w: 3, lastDate: '2026-09-20' },
      { name: 'C', recent4w: 1, lastDate: '2026-10-11' },
    ].sort(compareConstellations)
    expect(list.map(x => x.name)).toEqual(['B', 'C', 'A'])
  })
  it('규칙 상수는 확정값 그대로', () => {
    expect(RULES).toMatchObject({ seed: 2, constellationMin: 3, distinctWeeks: 2, windowDays: 90 })
  })
})
