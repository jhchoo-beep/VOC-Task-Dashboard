// 종합 현황 "지점별 점수 추이" 계산 로직 (FO Weekly 260709 → 260714 to-do)
// - 지점 통합 점수 = OTA별 점수를 10점 만점으로 환산한 뒤 누적 리뷰 수로 가중 평균
// - 주차 라벨은 미팅에서 쓰인 언어("7월 1주차") 그대로

export interface TrendOtaEntry { name: string; max: number; okr: number }
export type History = Record<string, Record<string, number[]>>

export const INTEGRATED = '통합'

/** OTA 점수를 10점 만점으로 환산 (여기어때·Airbnb·NOL 등 5점제 대응) */
export function normalizeTo10(score: number, max: number): number {
  if (max <= 0) return score
  return score / max * 10
}

/**
 * 특정 스냅샷(idx)에서 한 지점의 통합 점수.
 * 점수가 있는 OTA만 포함, 가중치 = 해당 OTA 누적 리뷰 수(0이면 1로 간주).
 * 데이터가 하나도 없으면 null.
 */
export function branchIntegratedScore(
  otaList: TrendOtaEntry[],
  branchScores: Record<string, number[]> | undefined,
  branchReviews: Record<string, number[]> | undefined,
  idx: number,
): number | null {
  if (!branchScores) return null
  let weightedSum = 0
  let weightTotal = 0
  for (const { name, max } of otaList) {
    const score = branchScores[name]?.[idx] ?? 0
    if (score <= 0) continue
    const weight = Math.max(branchReviews?.[name]?.[idx] ?? 0, 1)
    weightedSum += normalizeTo10(score, max) * weight
    weightTotal += weight
  }
  if (weightTotal === 0) return null
  return Math.round(weightedSum / weightTotal * 100) / 100
}

/** ISO 날짜('2026-07-06') → '7월 1주차' (주차 = ceil(일/7)) */
export function weekOfMonthLabel(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number)
  return `${m}월 ${Math.ceil(d / 7)}주차`
}

/** ISO 날짜 → '3월' */
export function monthLabel(isoDate: string): string {
  return `${parseInt(isoDate.substring(5, 7))}월`
}

export interface TrendRow {
  label: string
  dateIso: string
  prevIso: string | null
  values: Record<string, number | null>  // 지점 → 점수
  deltas: Record<string, number | null>  // 지점 → 직전 스냅샷 대비 Δ
}

/**
 * 스냅샷 시계열 → 지점별 추이 행.
 * ota가 INTEGRATED면 10점 환산 리뷰 수 가중 평균, 아니면 해당 OTA 원점수.
 */
export function buildTrendRows(
  branches: string[],
  otaList: TrendOtaEntry[],
  scoreHistory: History,
  reviewHistory: History,
  dates: string[],
  ota: string,
): TrendRow[] {
  const rows: TrendRow[] = dates.map((dateIso, idx) => {
    const values: Record<string, number | null> = {}
    for (const b of branches) {
      if (ota === INTEGRATED) {
        values[b] = branchIntegratedScore(otaList, scoreHistory[b], reviewHistory[b], idx)
      } else {
        const s = scoreHistory[b]?.[ota]?.[idx] ?? 0
        values[b] = s > 0 ? s : null
      }
    }
    return { label: weekOfMonthLabel(dateIso), dateIso, prevIso: idx > 0 ? dates[idx - 1] : null, values, deltas: {} }
  })
  fillDeltas(rows, branches)
  return rows
}

/** 월별 롤업: 각 월의 마지막 스냅샷 값 (누적 평점 특성상 평균보다 월말 값이 정직) */
export function rollupMonthly(rows: TrendRow[], branches: string[]): TrendRow[] {
  const byMonth = new Map<string, TrendRow>()
  for (const row of rows) byMonth.set(row.dateIso.substring(0, 7), row)  // 뒤 스냅샷이 덮어씀 = 월 마지막
  const monthly = [...byMonth.values()].map(row => ({
    ...row,
    label: monthLabel(row.dateIso),
    deltas: {} as Record<string, number | null>,
  }))
  fillDeltas(monthly, branches)
  return monthly
}

/** 직전 non-null 값 대비 Δ 채우기 (하락 마킹용) */
function fillDeltas(rows: TrendRow[], branches: string[]): void {
  for (const b of branches) {
    let prev: number | null = null
    for (const row of rows) {
      const cur = row.values[b]
      row.deltas[b] = cur != null && prev != null ? Math.round((cur - prev) * 100) / 100 : null
      if (cur != null) prev = cur
    }
  }
}

/**
 * 드릴다운 대상 월 목록: 직전 스냅샷 ~ 이번 스냅샷 구간이 걸치는 월(YYYY-MM).
 * 월초 하락은 전월 말 리뷰가 원인일 수 있어 두 달을 함께 제시한다.
 */
export function drilldownMonths(dateIso: string, prevIso: string | null): string[] {
  const months = new Set<string>()
  if (prevIso) months.add(prevIso.substring(0, 7))
  months.add(dateIso.substring(0, 7))
  return [...months].sort().reverse()  // 최신 월 먼저
}
