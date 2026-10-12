// V2 별자리 판정 규칙 — 순수 함수. DB·LLM 무관.
//
// 확정 기준(재헌 2026-10-12, 노션 「STAY VOC 2.0」 2.0 솔루션 · 별자리 규칙):
//   · 묶는 기준 = 같은 지점의 같은 현상(이름은 「공간 + 현상」, 원인 없음). 현상 판정은 LLM 몫이고,
//     이 파일은 「같은 현상」으로 이미 묶인 별 목록을 받아 숫자 규칙만 판정한다.
//   · 씨앗   = 같은 현상의 별 2개 이상이 묶는 기간 안에 있으나 별자리 조건은 못 채움(관찰만)
//   · 별자리 = 같은 현상의 별 3개 이상이 서로 다른 2주(ISO 주) 이상에 걸침
//   · 묶는 기간 = 최근 90일(기준일 포함 90일: 기준일-89일 ~ 기준일)
//   · 부정 별자리 상태 = 씨앗 · 열림 · 수행과제 진행 · 관찰(완료 뒤 3개월) · 성운(3개월 새 별 0건) · 재발
//   · 긍정 별자리 상태 = 씨앗 · 유지 · 흐려짐(최근 90일 기준으로 별자리 조건을 더는 못 채움)
//   · 순서 = 최근 4주 별 수, 같으면 최근 순(불편 크기 가중 없음)
//
// 🔴 기준값은 결과를 보고 바꾸지 않는다(OKR 판정 규칙 4). 바꾸면 다음 분기부터 적용.

import { isoWeekOf } from './isoWeek'

export const RULES = {
  seed: 2,
  constellationMin: 3,
  distinctWeeks: 2,
  windowDays: 90,
  observationDays: 90,   // 관찰 3개월 = 90일로 센다(묶는 기간과 같은 길이)
  recentDays: 28,        // 순서용 「최근 4주」
} as const

export interface StarLite {
  id: string
  date: string           // 'YYYY-MM-DD'
}

const pad = (n: number) => String(n).padStart(2, '0')

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function daysBetween(earlier: string, later: string): number {
  return Math.round(
    (new Date(`${later}T00:00:00Z`).getTime() - new Date(`${earlier}T00:00:00Z`).getTime()) / 86_400_000,
  )
}

/** 기준일로 끝나는 묶는 기간의 첫날(기준일 포함 windowDays일). */
export function windowStart(asOf: string, windowDays: number = RULES.windowDays): string {
  return addDays(asOf, -(windowDays - 1))
}

/** 기간 [from, to] 안의 별. 날짜 문자열 비교 = 날짜 비교(ISO). */
export function starsBetween<T extends StarLite>(stars: T[], from: string, to: string): T[] {
  return stars.filter(s => s.date >= from && s.date <= to)
}

export function distinctWeekCount(stars: StarLite[]): number {
  return new Set(stars.map(s => isoWeekOf(s.date))).size
}

/** 별자리 조건: 별 3개 이상 + 서로 다른 ISO 주 2개 이상. */
export function meetsConstellation(stars: StarLite[]): boolean {
  return stars.length >= RULES.constellationMin && distinctWeekCount(stars) >= RULES.distinctWeeks
}

export interface Formation {
  formed: boolean
  formedAt: string | null        // 별자리 조건을 처음 채운 별의 날짜
  windowFrom: string | null      // 그때의 묶는 기간 첫날 — 이날 이후 별이 이 별자리에 붙는다
  formationStarIds: string[]     // 처음 조건을 채운 그 기간 안의 별
}

/**
 * 시간 순서대로 별을 하나씩 받으며(주간 루틴의 재생) 별자리가 처음 생기는 순간을 찾는다.
 * 조건은 별이 붙을 때만 새로 채워질 수 있으므로, 각 별의 날짜를 기준일로 보고 그 90일 창을 본다.
 * 같은 날 별이 여럿이면 그날 별을 모두 넣은 뒤 판정한다.
 */
export function findFormation<T extends StarLite>(starsIn: T[], asOf: string): Formation {
  const stars = [...starsIn].filter(s => s.date <= asOf).sort((a, b) => a.date.localeCompare(b.date))
  const dates = [...new Set(stars.map(s => s.date))]
  for (const d of dates) {
    const from = windowStart(d)
    const inWin = starsBetween(stars, from, d)
    if (meetsConstellation(inWin)) {
      return { formed: true, formedAt: d, windowFrom: from, formationStarIds: inWin.map(s => s.id) }
    }
  }
  return { formed: false, formedAt: null, windowFrom: null, formationStarIds: [] }
}

export type Grouping =
  | { kind: 'constellation'; memberIds: string[]; formation: Formation }
  | { kind: 'seed'; memberIds: string[] }
  | { kind: 'singles' }

/**
 * 한 지점·한 현상·한 극성의 별 묶음을 기준일 시점으로 판정한다.
 *   · 별자리가 한 번이라도 생겼으면: 그 묶는 기간 첫날 이후의 별 전부가 구성원(고정 ID, 이후 별도 붙음)
 *   · 아니면 기준일 90일 창 안에 별이 2개 이상이면 씨앗(그 창 안의 별)
 *   · 둘 다 아니면 전부 단발
 * 별자리가 생기기 전 90일 창 밖에 있던 별은 단발로 남는다(그때 이미 주간 리포트에서 처리된 별).
 */
export function groupPhenomenon<T extends StarLite>(stars: T[], asOf: string): Grouping {
  const f = findFormation(stars, asOf)
  if (f.formed) {
    const members = stars.filter(s => s.date >= f.windowFrom! && s.date <= asOf).map(s => s.id)
    return { kind: 'constellation', memberIds: members, formation: f }
  }
  const inWin = starsBetween(stars, windowStart(asOf), asOf)
  if (inWin.length >= RULES.seed) return { kind: 'seed', memberIds: inWin.map(s => s.id) }
  return { kind: 'singles' }
}

// ── 상태 ──────────────────────────────────────────────────────────

export type NegStatus = '씨앗' | '열림' | '수행과제 진행' | '관찰' | '성운' | '재발'
export type PosStatus = '씨앗' | '유지' | '흐려짐'

export interface LinkedTask {
  id: string
  status: '시작전' | '진행중' | '완료' | '보류' | string
  createdAt: string              // 'YYYY-MM-DD'
  completedAt: string | null     // 완료 과제의 완료일(근사). 완료가 아니면 null
}

export interface StatusEvent {
  type: 'formed' | 'task_linked' | 'observing' | 'relapse' | 'nebula' | 'fading' | 'kept'
  at: string
  note: string
}

export interface NegStatusResult {
  status: NegStatus
  relapseCount: number
  observationStart: string | null
  nebulaAt: string | null
  activeTaskId: string | null
  events: StatusEvent[]
}

/**
 * 부정 별자리의 기준일 상태.
 *   · 연결 과제 중 시작전·진행중이 있으면 → 수행과제 진행(그중 가장 최근 등록 과제)
 *   · 완료 과제가 있으면 가장 최근 완료일 T 기준:
 *       T 이후 새 별이 있으면 → 재발, 없으면 기준일-T ≥ 90일 → 성운, 아니면 → 관찰
 *   · 보류 과제만 있거나 과제가 없으면 → 열림
 * 재발 횟수 = 완료 과제마다, 그 완료일 뒤 다음 과제 등록 전(또는 기준일까지)에 새 별이 붙었으면 1회.
 * 🔴 「재발 2회부터 FO가 원인 진단부터 다시」는 화면이 relapseCount 로 표시만 한다(판단은 사람).
 */
export function deriveNegativeStatus(
  memberDates: string[], formedAt: string, tasks: LinkedTask[], asOf: string,
): NegStatusResult {
  const dates = [...memberDates].sort()
  const events: StatusEvent[] = [{ type: 'formed', at: formedAt, note: '별자리 조건 충족(별 3개 이상, 서로 다른 2주 이상, 90일 안)' }]
  const sortedTasks = [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const t of sortedTasks) events.push({ type: 'task_linked', at: t.createdAt, note: `수행과제 연결(${t.status})` })

  // 재발 횟수: 완료 과제 각각에 대해, 완료 뒤 ~ (완료 뒤에 등록된) 다음 과제 등록일 구간에 별이 있으면 재발.
  // 완료 전에 함께 등록된 과제(같은 달 보류 과제 등)는 구간을 자르지 않는다.
  let relapseCount = 0
  sortedTasks.forEach(t => {
    if (t.status !== '완료' || !t.completedAt) return
    const next = sortedTasks.find(o => o.createdAt > t.completedAt!)
    const until = next?.createdAt ?? asOf
    const after = dates.filter(d => d > t.completedAt! && d <= until)
    if (after.length > 0) {
      relapseCount++
      events.push({ type: 'relapse', at: after[0], note: `완료(${t.completedAt}) 뒤 새 별` })
    }
  })

  const active = [...sortedTasks].reverse().find(t => t.status === '시작전' || t.status === '진행중')
  if (active) {
    return { status: '수행과제 진행', relapseCount, observationStart: null, nebulaAt: null, activeTaskId: active.id, events }
  }
  const done = [...sortedTasks].reverse().find(t => t.status === '완료' && t.completedAt)
  if (done) {
    const T = done.completedAt!
    const after = dates.filter(d => d > T)
    if (after.length > 0) {
      return { status: '재발', relapseCount, observationStart: T, nebulaAt: null, activeTaskId: done.id, events }
    }
    events.push({ type: 'observing', at: T, note: '수행과제 완료 — 관찰 시작' })
    if (daysBetween(T, asOf) >= RULES.observationDays) {
      const nebulaAt = addDays(T, RULES.observationDays)
      events.push({ type: 'nebula', at: nebulaAt, note: '관찰 3개월 새 별 0건' })
      return { status: '성운', relapseCount, observationStart: T, nebulaAt, activeTaskId: done.id, events }
    }
    return { status: '관찰', relapseCount, observationStart: T, nebulaAt: null, activeTaskId: done.id, events }
  }
  return { status: '열림', relapseCount, observationStart: null, nebulaAt: null, activeTaskId: null, events }
}

/** 긍정 별자리의 기준일 상태: 최근 90일 창에서 별자리 조건을 채우면 유지, 못 채우면 흐려짐. */
export function derivePositiveStatus(members: StarLite[], asOf: string): PosStatus {
  return meetsConstellation(starsBetween(members, windowStart(asOf), asOf)) ? '유지' : '흐려짐'
}

/** 최근 4주(기준일 포함 28일) 별 수. */
export function recentCount(members: StarLite[], asOf: string): number {
  return starsBetween(members, windowStart(asOf, RULES.recentDays), asOf).length
}

/** 순서: 최근 4주 별 수 내림차순, 같으면 마지막 별 날짜 최근 순, 그다음 이름(결정성). */
export function compareConstellations(
  a: { recent4w: number; lastDate: string; name: string },
  b: { recent4w: number; lastDate: string; name: string },
): number {
  return b.recent4w - a.recent4w || b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name)
}
