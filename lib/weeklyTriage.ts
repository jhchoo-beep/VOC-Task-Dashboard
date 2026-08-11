// 주간 리포트의 판단 층 — 순수 함수. DB 무관.
//
// 왜 만들었나(2026-08-11 재헌): 미달 리뷰 전수 수집(깔때기)까지는 됐는데, 그 출구가
// 곧바로 FO Weekly 화면이라 회의가 원문을 읽는 독서 모임이 됐다. 8건 카드 × 원문 낭독은
// 회의가 아니다. FO는 재료가 아니라 판단을 들고 간다 — 회의 전에 미달 리뷰마다 처리
// 방침을 붙이고, 회의는 "미달 16 = 조치 3 · 이월 5 · 종결 8" 한 줄과 조치 건만 소비한다.
//
//   조치 — 퀵윈. 주간 수행과제로 이어질 건 (착지점은 기존 weekly_tasks 층)
//   이월 — 구조적 건. 월간 /voc-analysis 대상
//   종결 — 단발성·구조상 불가(옆방 소음 등). 한 줄 사유만 남긴다
//
// 🔴 판단은 사람(FO)의 입력이다. 앱은 어떤 판단도 제안·생성하지 않는다 —
//    2026-07-27 '원인 한 줄 제거'와 같은 선이다.

export type TriageVerdict = '조치' | '이월' | '종결'

export const TRIAGE_VERDICTS: TriageVerdict[] = ['조치', '이월', '종결']

export function isTriageVerdict(v: unknown): v is TriageVerdict {
  return typeof v === 'string' && (TRIAGE_VERDICTS as string[]).includes(v)
}

// review_triage 표 행. PK가 review_id 하나 = 판단은 리뷰의 속성이다.
// 월 단위 채널(에어비앤비) 리뷰가 같은 달의 여러 주 화면에 나타나도 판단은 한 번이고,
// 어느 주에서 붙였든 따라다닌다. week_start는 판단이 이뤄진 주의 라벨(참고 메타)일 뿐
// 조회 키가 아니다 — 조회는 항상 review_id로 한다.
export interface TriageRow {
  review_id: string
  week_start: string
  property_id: number
  verdict: TriageVerdict
  note: string | null
}

// 판단을 붙이는 지점은 재헌님 담당 지점뿐이다. 타 지점(제주시티·고성)의 미달 리뷰는
// 화면에 보이되 판단 없이 둔다 — 그 판단은 담당 FO의 몫이고, 여기서 상태를 붙이면
// '대기'가 영영 0이 되지 않아 요약이 신호를 잃는다.
export const TRIAGE_BRANCHES = ['신설', '동대문']

export function isTriageBranch(branch: string): boolean {
  return TRIAGE_BRANCHES.includes(branch)
}

// 회의 헤더의 한 줄: 조치 N · 이월 N · 종결 N · 대기 N.
// 대기 = 판단이 아직 안 붙은 미달 리뷰. 이 수가 0이어야 "다 읽고 판단했다"가 화면에 남는다.
export interface TriageSummary {
  조치: number
  이월: number
  종결: number
  대기: number
}

export const EMPTY_SUMMARY: TriageSummary = { 조치: 0, 이월: 0, 종결: 0, 대기: 0 }

/**
 * 미달 리뷰 id 목록을 판단 상태별로 센다.
 *
 * 🔴 호출자가 넘기는 ids는 판단 대상(신설·동대문의 미달 리뷰)만이어야 한다.
 *    타 지점 리뷰를 섞으면 그 건들이 전부 '대기'로 잡혀 요약이 거짓을 말한다 —
 *    거르는 함수는 triageableIds.
 */
export function summarizeTriage(
  ids: string[],
  triage: Record<string, TriageRow>,
): TriageSummary {
  const s: TriageSummary = { ...EMPTY_SUMMARY }
  for (const id of ids) {
    const row = triage[id]
    if (row) s[row.verdict]++
    else s.대기++
  }
  return s
}

/** 판단 대상 리뷰 id — 판단 지점 카드의 미달 리뷰 전부. */
export function triageableIds(
  cards: { branch: string; propertyId: number }[],
  reviews: Record<number, { items: { id: string }[] }>,
): string[] {
  const out: string[] = []
  for (const c of cards) {
    if (!isTriageBranch(c.branch)) continue
    for (const it of reviews[c.propertyId]?.items ?? []) out.push(it.id)
  }
  return out
}
