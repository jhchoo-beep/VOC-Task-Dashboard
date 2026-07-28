// 주간 수행과제 — 순수 함수만. DB·React 무관이라 vitest로 전수 검증한다.
//
// 이 파일은 어떤 문안도 만들지 않는다. 근거 리뷰를 모으고, 프롬프트를 조립하고,
// 무엇이 이월인지 판정할 뿐이다. 과제 내용은 사람이 AI로 받아 폼에 넣는다
// (2026-07-27 '카드는 원인을 쓰지 않는다' 결정과 같은 선 위에 있다).

// 상대 경로로 가져온다 — vitest는 '@/' 별칭을 풀지 않는다.
import { branchRank } from './weeklyReport'
import type { WeeklyChannelRow } from './weeklyReport'
import type { ChannelReviews } from './weeklyReviews'

export type WeeklyTaskStatus = '시작전' | '진행중' | '완료'

/** tasks의 '보류'는 쓰지 않는다 — 주 단위에서 보류는 곧 이월이다. */
export const WEEKLY_TASK_STATUSES: WeeklyTaskStatus[] = ['시작전', '진행중', '완료']

/**
 * 과제의 근거가 되는 리뷰 한 건.
 * 이 모양 그대로 weekly_tasks.source_reviews 에 스냅샷으로 박제된다 —
 * raw_reviews 가 재파싱·재적재돼도 회의에서 본 근거는 그대로 남아야 한다.
 */
export interface CandidateReview {
  id: string
  branch: string
  otaName: string
  rating: number | null
  date: string | null       // 월 입도 채널은 null
  body: string
  translated: boolean
}

export interface WeeklyTaskRow {
  id: string
  week_start: string        // 구간의 '끝' 월요일. 리포트의 week 문자열 그대로다
  branches: string[]
  title: string
  problem_definition: string | null
  solution: string | null
  assignee: string | null
  due_date: string | null
  status: WeeklyTaskStatus
  escalated: boolean
  escalated_at: string | null
  source_reviews: CandidateReview[]
  created_at: string
}

/**
 * 논의 카드들의 기준선 미달 리뷰를 지점·채널 구분 없이 한 목록으로 편다.
 *
 * hiddenCount(기준선 이상이라 뺀 것)는 넣지 않는다 — 화면 판정과 과제 근거가
 * 같은 기준선을 공유해야 한다.
 */
export function flattenCandidates(
  cards: WeeklyChannelRow[],
  reviews: Record<number, ChannelReviews>,
): CandidateReview[] {
  const out: CandidateReview[] = []
  for (const card of cards) {
    const cr = reviews[card.propertyId]
    if (!cr) continue        // 원문 미확보 채널(아고다 raw 커버리지 한계 등)
    for (const it of cr.items) {
      out.push({
        id: it.id,
        branch: card.branch,
        otaName: card.otaName,
        rating: it.rating,
        date: it.date,
        body: it.body,
        translated: it.translated,
      })
    }
  }
  return out.sort((a, b) => {
    const ra = branchRank(a.branch), rb = branchRank(b.branch)
    if (ra !== rb) return ra - rb
    // 🔴 점수 없는 리뷰를 0으로 다루면 '가장 나쁜 리뷰' 자리를 차지한다. 맨 뒤로 보낸다.
    if (a.rating == null && b.rating == null) return 0
    if (a.rating == null) return 1
    if (b.rating == null) return -1
    return a.rating - b.rating
  })
}

/** 근거 리뷰에서 지점 목록을 낸다. 지점 고정 순. */
export function branchesOf(items: CandidateReview[]): string[] {
  return [...new Set(items.map(i => i.branch))].sort((a, b) => branchRank(a) - branchRank(b))
}

/**
 * 선택한 리뷰들을 과제 도출 지시문과 함께 한 덩이 텍스트로 만든다.
 * 사람이 이걸 복사해 Claude에 붙이고, 받은 문안을 폼에 옮긴다.
 *
 * 지시문이 반드시 지켜야 하는 것: 리뷰에 쓰여 있는 사실만 근거로 삼을 것.
 * 근거 없는 원인을 지어내는 순간, 07-27에 카드에서 원인 한 줄을 걷어낸 이유가 그대로 돌아온다.
 */
export function buildTaskPrompt(items: CandidateReview[], week: string): string {
  const lines = items.map((it, i) => {
    const score = it.rating == null ? '점수 없음' : `${it.rating.toFixed(1)}점`
    const head = `${i + 1}. ${it.branch} · ${it.otaName} · ${score}${it.date ? ` · ${it.date}` : ''}`
    const body = it.body.trim() || '(본문 없음)'
    return `${head}\n${body}`
  })

  return [
    `아래는 ${week} 주간 OTA 리포트에서 기준 점수에 미달한 리뷰 ${items.length}건입니다.`,
    '이 리뷰들을 근거로 이번 주에 실행할 수행과제 1건을 작성해 주세요.',
    '',
    '규칙',
    '- 리뷰에 실제로 쓰여 있는 사실만 근거로 삼습니다. 쓰여 있지 않은 원인을 추정하지 않습니다.',
    '- 근거가 부족하면 과제를 지어내지 말고, 무엇을 더 확인해야 하는지 적습니다.',
    '- 아래 세 항목만 출력합니다. 다른 말은 붙이지 않습니다.',
    '',
    '제목: (한 줄)',
    '문제 정의: (리뷰가 말하는 사실 기준)',
    '해결안: (이번 주 안에 실행 가능한 수준)',
    '',
    '--- 리뷰 원문 ---',
    ...lines,
  ].join('\n')
}
