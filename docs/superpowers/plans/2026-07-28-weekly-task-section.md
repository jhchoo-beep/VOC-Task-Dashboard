# 주간 수행과제 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 주간 OTA 리포트의 접힌 참고 영역을 없애고, 그 자리에 논의 카드의 미달 리뷰를 근거로 주간 수행과제를 만들고 추적하는 섹션을 넣는다.

**Architecture:** 앱은 어떤 문안도 생성하지 않는다 — 근거 리뷰를 모아 프롬프트로 복사해 주고, 사람이 AI로 받아 온 문안을 담을 틀과 상태만 관리한다. 판정·조립 로직은 전부 `lib/weeklyTasks.ts` 순수 함수로 두고 DB 없이 vitest로 검증한다. 저장은 신설 `weekly_tasks` 테이블이며 기존 `tasks`·대시보드 진행률·슬랙 알림은 건드리지 않는다.

**Tech Stack:** Next.js 15 App Router · Supabase(PostgreSQL, anon 키 + RLS off) · NextAuth v5 · vitest · 인라인 스타일 + CSS 변수 다크 테마

**설계 정본:** `docs/superpowers/specs/2026-07-28-weekly-task-section-design.md`

## Global Constraints

- 언어는 한국어. 화면 문구·주석·커밋 메시지 모두 한국어.
- **앱에 LLM 호출을 넣지 않는다.** `@anthropic-ai/*` 등 어떤 LLM SDK도 추가하지 않는다.
- `week_start`는 기존 주 라벨 규약을 그대로 따른다 — **이름과 달리 구간의 '끝' 월요일**이다(화~월 7일). 새로 계산하지 말고 리포트가 들고 있는 `week` 문자열을 그대로 저장·비교한다.
- 상태는 3종 고정: `시작전` · `진행중` · `완료`. (`tasks`의 `보류`는 쓰지 않는다.)
- `revalidateTag`는 **2-인자**다: `revalidateTag('weekly-tasks', 'max')`. Next 16 시그니처.
- 새 캐시 태그는 `weekly-tasks`. 기존 `ota`·`raw-reviews`·`reviews` 태그에 얹지 않는다.
- `lib/**/*.test.ts` 안에서는 **상대 경로 import**를 쓴다(`./weeklyTasks`). vitest가 `@/` 별칭을 풀지 않는다.
- 새 표는 기존 표와 같이 **RLS를 켜지 않는다**(`reviews`·`tasks`·`task_logs`·`ota_complaints` 모두 `relrowsecurity=false`, 서버가 anon 키로 접근).
- 임베드(`/embed/weekly-report`)는 읽기 전용이다. 쓰기 컨트롤은 렌더 자체를 하지 않는다(`disabled` 처리로 끝내지 않는다).
- Supabase project_id: `slyfyrkqfdkoaaochspa`

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/weeklyTasks.ts` (신규) | 순수 함수·타입만. 후보 평탄화, 프롬프트 조립, 이월 판정, 지점 도출 |
| `lib/weeklyTasks.test.ts` (신규) | 위 함수 전량 vitest |
| `lib/weeklyReport.ts` (수정) | `BRANCH_ORDER` 상수를 export로 승격(화면 두 곳이 공유) |
| `docs/superpowers/migrations/2026-07-28-weekly-tasks.sql` (신규) | DDL 기록 |
| `app/api/weekly-tasks/route.ts` (신규) | GET·POST·PATCH·DELETE. 세션 검사 → Supabase → revalidateTag |
| `lib/pageData.ts` (수정) | `getWeeklyTasks(week)` 추가. 별도 `unstable_cache` |
| `app/(app)/weekly-report/page.tsx` (수정) | 과제 조회 결과를 프롭으로 전달 |
| `app/embed/weekly-report/page.tsx` (수정) | 같음 + `embed` 프롭 |
| `components/WeeklyTaskSection.tsx` (신규) | 섹션 전체 UI. 후보 목록·프롬프트 복사·폼·과제 카드 |
| `components/WeeklyReportClient.tsx` (수정) | `ReferenceFold` 삭제, 섹션 마운트, 프롭 전달 |
| `~/.claude/skills/voc-analysis/SKILL.md` (수정) | 월 분석 입력에 승격 과제 조회 추가 |

---

### Task 1: `lib/weeklyTasks.ts` — 타입과 후보 평탄화

**Files:**
- Create: `lib/weeklyTasks.ts`
- Create: `lib/weeklyTasks.test.ts`
- Modify: `lib/weeklyReport.ts` (BRANCH_ORDER export 추가)
- Modify: `components/WeeklyReportClient.tsx:18` (지역 BRANCH_ORDER 삭제 후 import)

**Interfaces:**
- Consumes: `WeeklyChannelRow`(`lib/weeklyReport.ts`), `ChannelReviews`(`lib/weeklyReviews.ts`)
- Produces:
  - `type WeeklyTaskStatus = '시작전' | '진행중' | '완료'`
  - `const WEEKLY_TASK_STATUSES: WeeklyTaskStatus[]`
  - `interface CandidateReview { id, branch, otaName, rating, date, body, translated }`
  - `interface WeeklyTaskRow { id, week_start, branches, title, problem_definition, solution, assignee, due_date, status, escalated, escalated_at, source_reviews, created_at }`
  - `function flattenCandidates(cards: WeeklyChannelRow[], reviews: Record<number, ChannelReviews>): CandidateReview[]`
  - `function branchesOf(items: CandidateReview[]): string[]`
  - `lib/weeklyReport.ts`에서: `const BRANCH_ORDER: string[]`, `function branchRank(branch: string): number`

- [ ] **Step 1: `lib/weeklyReport.ts`의 BRANCH_ORDER를 export 한다**

`lib/weeklyReport.ts` 안에 `ESTIMATOR_LABEL` 선언 근처에 추가한다:

```ts
/** 회의에서 매주 같은 자리를 찾게 하려고 지점 순서를 고정한다. 격차 순으로 정렬하지 않는다. */
export const BRANCH_ORDER = ['신설', '동대문', '제주시티', '고성']

/** 모르는 지점은 맨 뒤로 보낸다. */
export function branchRank(branch: string): number {
  const i = BRANCH_ORDER.indexOf(branch)
  return i === -1 ? BRANCH_ORDER.length : i
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`lib/weeklyTasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { flattenCandidates, branchesOf } from './weeklyTasks'
import type { WeeklyChannelRow } from './weeklyReport'
import type { ChannelReviews } from './weeklyReviews'

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
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npx vitest run lib/weeklyTasks.test.ts`
Expected: FAIL — `Failed to resolve import "./weeklyTasks"`

- [ ] **Step 4: `lib/weeklyTasks.ts`를 만든다**

```ts
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
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run lib/weeklyTasks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: `WeeklyReportClient.tsx`가 공유 상수를 쓰게 바꾼다**

`components/WeeklyReportClient.tsx` 18행의 지역 선언을 지우고 import로 바꾼다.

지울 것:
```ts
const BRANCH_ORDER = ['신설', '동대문', '제주시티', '고성']
```

6행 import 문에 `BRANCH_ORDER`를 더한다:
```ts
import { ESTIMATOR_LABEL, BRANCH_ORDER, type WeeklyReport, type WeeklyChannelRow, type BaselineRow } from '@/lib/weeklyReport'
```

`orderForMeeting`·`BaselinePanel` 안의 `rank`/`branchRank` 지역 함수는 그대로 둔다(이번 작업의 범위가 아니다).

- [ ] **Step 7: 전체 테스트와 타입 검사**

Run: `npm test`
Expected: 전량 PASS (기존 테스트 포함)

Run: `npx tsc --noEmit`
Expected: 이번 변경으로 인한 신규 오류 없음

- [ ] **Step 8: 커밋**

```bash
git add lib/weeklyTasks.ts lib/weeklyTasks.test.ts lib/weeklyReport.ts components/WeeklyReportClient.tsx
git commit -m "feat(weekly): 주간 수행과제 후보 리뷰 평탄화 순수 함수"
```

---

### Task 2: 프롬프트 조립

**Files:**
- Modify: `lib/weeklyTasks.ts`
- Modify: `lib/weeklyTasks.test.ts`

**Interfaces:**
- Consumes: `CandidateReview`(Task 1)
- Produces: `function buildTaskPrompt(items: CandidateReview[], week: string): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/weeklyTasks.test.ts` 맨 아래에 붙인다. 상단 import에 `buildTaskPrompt`를 더한다.

```ts
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run lib/weeklyTasks.test.ts`
Expected: FAIL — `buildTaskPrompt is not a function`

- [ ] **Step 3: 구현한다**

`lib/weeklyTasks.ts` 맨 아래에 추가:

```ts
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
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run lib/weeklyTasks.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/weeklyTasks.ts lib/weeklyTasks.test.ts
git commit -m "feat(weekly): 과제 도출용 AI 프롬프트 조립"
```

---

### Task 3: 이월 판정

**Files:**
- Modify: `lib/weeklyTasks.ts`
- Modify: `lib/weeklyTasks.test.ts`

**Interfaces:**
- Consumes: `WeeklyTaskRow`(Task 1)
- Produces: `function selectVisibleTasks(rows: WeeklyTaskRow[], week: string): { current: WeeklyTaskRow[]; carried: WeeklyTaskRow[] }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/weeklyTasks.test.ts` 맨 아래에 붙인다. 상단 import에 `selectVisibleTasks`, 타입 import에 `WeeklyTaskRow`를 더한다.

```ts
import type { WeeklyTaskRow } from './weeklyTasks'

const task = (o: Partial<WeeklyTaskRow> & { id: string; week_start: string }): WeeklyTaskRow => ({
  branches: ['신설'], title: '제목', problem_definition: null, solution: null,
  assignee: null, due_date: null, status: '시작전', escalated: false, escalated_at: null,
  source_reviews: [], created_at: '2026-07-27T00:00:00Z', ...o,
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run lib/weeklyTasks.test.ts`
Expected: FAIL — `selectVisibleTasks is not a function`

- [ ] **Step 3: 구현한다**

`lib/weeklyTasks.ts` 맨 아래에 추가:

```ts
/**
 * 이 주 리포트에 보일 과제를 가른다.
 *
 *   current — 그 주에 만든 과제 전부(완료된 것도 남긴다. 그 주에 무엇을 했는지가 기록이다)
 *   carried — 지난 주 이전에 만들었는데 아직 안 끝났고 채택도 안 된 과제
 *
 * 채택(escalated)된 과제는 이월하지 않는다 — 다음 달 정식 수행과제로 넘어갔으므로
 * 주간 층에서 계속 들고 있을 이유가 없다.
 *
 * week_start 는 'YYYY-MM-DD' 문자열이라 사전순 비교가 곧 날짜 비교다.
 */
export function selectVisibleTasks(
  rows: WeeklyTaskRow[],
  week: string,
): { current: WeeklyTaskRow[]; carried: WeeklyTaskRow[] } {
  const current: WeeklyTaskRow[] = []
  const carried: WeeklyTaskRow[] = []

  for (const r of rows) {
    if (r.week_start === week) current.push(r)
    else if (r.week_start < week && r.status !== '완료' && !r.escalated) carried.push(r)
    // 미래 주는 버린다 — 지난 주를 보고 있을 때 아직 오지 않은 주의 과제가 뜨면 안 된다
  }

  carried.sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0))
  return { current, carried }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test`
Expected: 전량 PASS (weeklyTasks 15 tests + 기존)

- [ ] **Step 5: 커밋**

```bash
git add lib/weeklyTasks.ts lib/weeklyTasks.test.ts
git commit -m "feat(weekly): 주간 과제 이월 판정"
```

---

### Task 4: `weekly_tasks` 테이블

**Files:**
- Create: `docs/superpowers/migrations/2026-07-28-weekly-tasks.sql`

**Interfaces:**
- Produces: `weekly_tasks` 테이블. 컬럼명은 Task 1의 `WeeklyTaskRow` 필드와 1:1

- [ ] **Step 1: DDL 파일을 만든다**

`docs/superpowers/migrations/2026-07-28-weekly-tasks.sql`:

```sql
-- 2026-07-28 · 주간 수행과제
--
-- 주간 OTA 리포트의 논의 카드에서 도출한 '그 주에 처리할' 과제를 담는다.
-- tasks(월간 · 변심 트리거 기반)와는 별개 층이다 — 연결 컬럼을 두지 않는다.
--
-- week_start 는 이름과 달리 구간의 '끝' 월요일이다(화~월 7일).
-- ota_score_dist 등 기존 표와 같은 규약이며, 리포트가 들고 있는 week 문자열을 그대로 넣는다.
--
-- RLS 는 켜지 않는다 — 이 프로젝트의 다른 표(reviews·tasks·task_logs·ota_complaints)와
-- 동일하게 서버가 anon 키로 접근하고, 접근 통제는 NextAuth 세션 검사가 맡는다.

create table if not exists weekly_tasks (
  id                  uuid        primary key default gen_random_uuid(),
  week_start          date        not null,
  branches            text[]      not null default '{}',
  title               text        not null,
  problem_definition  text,
  solution            text,
  assignee            text,
  due_date            text,
  status              text        not null default '시작전',
  escalated           boolean     not null default false,
  escalated_at        timestamptz,
  -- 근거 리뷰 스냅샷: [{ id, branch, otaName, rating, date, body, translated }]
  -- id 참조가 아니라 원문 박제다. raw_reviews 를 재파생해도 회의에서 본 근거가 남아야 한다.
  source_reviews      jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint weekly_tasks_status_chk check (status in ('시작전', '진행중', '완료'))
);

create index if not exists weekly_tasks_week_idx on weekly_tasks (week_start desc);

alter table weekly_tasks disable row level security;
```

- [ ] **Step 2: Supabase에 적용한다**

Supabase MCP `apply_migration` 을 쓴다.
- `project_id`: `slyfyrkqfdkoaaochspa`
- `name`: `2026-07-28-weekly-tasks`
- `query`: 위 SQL 전문

- [ ] **Step 3: 적용됐는지 확인한다**

Supabase MCP `execute_sql` 로:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'weekly_tasks'
order by ordinal_position;
```

Expected: 13개 컬럼(id·week_start·branches·title·problem_definition·solution·assignee·due_date·status·escalated·escalated_at·source_reviews·created_at·updated_at → 14개)이 나온다. `branches`는 `ARRAY`, `source_reviews`는 `jsonb`.

```sql
select relrowsecurity from pg_class where relname = 'weekly_tasks';
```
Expected: `false`

- [ ] **Step 4: 커밋**

```bash
git add docs/superpowers/migrations/2026-07-28-weekly-tasks.sql
git commit -m "feat(weekly): weekly_tasks 테이블 신설"
```

---

### Task 5: API 라우트

**Files:**
- Create: `app/api/weekly-tasks/route.ts`

**Interfaces:**
- Consumes: `weekly_tasks` 테이블(Task 4), `WeeklyTaskRow`(Task 1)
- Produces: `POST /api/weekly-tasks` · `PATCH /api/weekly-tasks` · `DELETE /api/weekly-tasks?id=`
  - POST body: `{ week_start, branches, title, problem_definition, solution, assignee, due_date, source_reviews }`
  - PATCH body: `{ id, ...변경할 필드 }` — `escalated`가 오면 `escalated_at`을 서버가 채운다

- [ ] **Step 1: 라우트를 만든다**

`app/api/weekly-tasks/route.ts`:

```ts
import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { WEEKLY_TASK_STATUSES } from '@/lib/weeklyTasks'

// 주간 수행과제 쓰기 API. tasks 라우트와 같은 골격이되 슬랙 알림은 붙이지 않는다 —
// 주간 과제는 회의에서 재헌님이 직접 만들고 닫는 층이라 스쿼드 채널로 나갈 것이 없다.
//
// 🔴 revalidateTag 는 'weekly-tasks' 하나만 친다. getWeeklyReportProps(ota·raw-reviews·reviews,
//    revalidate 300)까지 무효화하면 과제 하나 저장할 때마다 무거운 리포트가 통째로 다시 계산된다.

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const b = await req.json()
  if (!b.week_start) return bad('week_start 누락')
  if (!b.title?.trim()) return bad('제목을 입력해 주세요')

  const { data, error } = await supabase.from('weekly_tasks').insert({
    week_start:         b.week_start,
    branches:           Array.isArray(b.branches) ? b.branches : [],
    title:              b.title.trim(),
    problem_definition: b.problem_definition?.trim() || null,
    solution:           b.solution?.trim() || null,
    assignee:           b.assignee?.trim() || null,
    due_date:           b.due_date || null,
    status:             WEEKLY_TASK_STATUSES.includes(b.status) ? b.status : '시작전',
    source_reviews:     Array.isArray(b.source_reviews) ? b.source_reviews : [],
  }).select().single()

  if (error) return bad(error.message, 500)

  revalidateTag('weekly-tasks', 'max')
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const b = await req.json()
  if (!b.id) return bad('id 누락')

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (b.title !== undefined) {
    if (!b.title?.trim()) return bad('제목을 비울 수 없습니다')
    patch.title = b.title.trim()
  }
  for (const k of ['problem_definition', 'solution', 'assignee'] as const) {
    if (b[k] !== undefined) patch[k] = b[k]?.trim() || null
  }
  if (b.due_date !== undefined) patch.due_date = b.due_date || null
  if (b.branches !== undefined) patch.branches = Array.isArray(b.branches) ? b.branches : []
  if (b.status !== undefined) {
    if (!WEEKLY_TASK_STATUSES.includes(b.status)) return bad('알 수 없는 상태')
    patch.status = b.status
  }
  // 채택 시각은 클라이언트를 믿지 않고 서버가 찍는다. 해제하면 시각도 지운다.
  if (b.escalated !== undefined) {
    patch.escalated = Boolean(b.escalated)
    patch.escalated_at = b.escalated ? new Date().toISOString() : null
  }

  const { data, error } = await supabase
    .from('weekly_tasks').update(patch).eq('id', b.id).select().single()

  if (error) return bad(error.message, 500)

  revalidateTag('weekly-tasks', 'max')
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return bad('Unauthorized', 401)

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return bad('id 누락')

  const { error } = await supabase.from('weekly_tasks').delete().eq('id', id)
  if (error) return bad(error.message, 500)

  revalidateTag('weekly-tasks', 'max')
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 이번 변경으로 인한 신규 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add app/api/weekly-tasks/route.ts
git commit -m "feat(weekly): 주간 수행과제 쓰기 API"
```

---

### Task 6: 조회 · 페이지 배선

**Files:**
- Modify: `lib/pageData.ts`
- Modify: `app/(app)/weekly-report/page.tsx`
- Modify: `app/embed/weekly-report/page.tsx`
- Modify: `components/WeeklyReportClient.tsx` (프롭 시그니처만)

**Interfaces:**
- Consumes: `weekly_tasks`(Task 4), `WeeklyTaskRow`(Task 1)
- Produces:
  - `getWeeklyTasks(week: string): Promise<WeeklyTaskRow[]>` (`lib/pageData.ts`)
  - `WeeklyReportClient` 프롭에 `weeklyTasks: WeeklyTaskRow[]`, `embed?: boolean` 추가

- [ ] **Step 1: `lib/pageData.ts`에 조회 함수를 넣는다**

파일 맨 아래에 추가한다. 상단 import에 타입을 더한다:

```ts
import type { WeeklyTaskRow } from '@/lib/weeklyTasks'
```

```ts
// 주간 수행과제. 리포트 본문과 캐시 태그를 분리한다 — 과제 하나 저장할 때마다
// ota·raw-reviews·reviews 를 통째로 무효화하면 무거운 리포트가 매번 다시 계산된다.
//
// 이월 과제를 보여야 하므로 그 주 이하를 전부 끌어온다. 가르는 일은 순수 함수
// selectVisibleTasks(lib/weeklyTasks.ts)가 한다.
export const getWeeklyTasks = unstable_cache(async (week: string): Promise<WeeklyTaskRow[]> => {
  if (!week) return []
  const { data, error } = await supabase
    .from('weekly_tasks')
    .select('*')
    .lte('week_start', week)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[weekly-tasks] 조회 실패:', error.message)
    return []
  }
  return (data ?? []) as WeeklyTaskRow[]
}, ['weekly-tasks'], { revalidate: 60, tags: ['weekly-tasks'] })
```

- [ ] **Step 2: 실앱 페이지를 배선한다**

`app/(app)/weekly-report/page.tsx` 전문을 다음으로 바꾼다:

```tsx
export const revalidate = 300

import { getWeeklyReportProps, getWeeklyTasks } from '@/lib/pageData'
import WeeklyReportClient from '@/components/WeeklyReportClient'

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const props = await getWeeklyReportProps(week)
  // 요청한 주가 아니라 리포트가 실제로 고른 주로 조회한다 — week 미지정이면 최신 주다.
  const weeklyTasks = await getWeeklyTasks(props.week)
  return <WeeklyReportClient {...props} weeklyTasks={weeklyTasks} basePath="/weekly-report" />
}
```

- [ ] **Step 3: 임베드 페이지를 배선한다**

`app/embed/weekly-report/page.tsx`에서 `getWeeklyTasks` import를 더하고, 렌더 부분을 바꾼다:

```tsx
  const props = await getWeeklyReportProps(week)
  const weeklyTasks = await getWeeklyTasks(props.week)
  return (
    <WeeklyReportClient
      {...props}
      weeklyTasks={weeklyTasks}
      embed
      basePath="/embed/weekly-report"
      extraQuery={key ? `key=${encodeURIComponent(key)}` : ''}
    />
  )
```

- [ ] **Step 4: 클라이언트 프롭 시그니처를 넓힌다**

`components/WeeklyReportClient.tsx`의 컴포넌트 인자에 두 줄을 더한다(아직 쓰지는 않는다 — Task 7에서 쓴다):

```tsx
export default function WeeklyReportClient({
  report, week, weeks, reviews, weeklyTasks, basePath, extraQuery = '', embed = false,
}: {
  report: WeeklyReport | null
  week: string
  weeks: string[]
  reviews: Record<number, ChannelReviews>
  weeklyTasks: WeeklyTaskRow[]
  basePath: string
  extraQuery?: string   // 임베드의 ?key= 처럼 주 이동 시에도 유지해야 하는 쿼리
  embed?: boolean       // 임베드는 읽기 전용 — 쓰기 컨트롤을 아예 렌더하지 않는다
}) {
```

상단 import에 타입을 더한다:
```ts
import type { WeeklyTaskRow } from '@/lib/weeklyTasks'
```

- [ ] **Step 5: 빌드와 타입 검사**

Run: `npx tsc --noEmit`
Expected: `weeklyTasks`·`embed` 미사용 경고는 나올 수 있으나 오류는 없다

Run: `npm test`
Expected: 전량 PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/pageData.ts "app/(app)/weekly-report/page.tsx" app/embed/weekly-report/page.tsx components/WeeklyReportClient.tsx
git commit -m "feat(weekly): 주간 수행과제 조회·페이지 배선"
```

---

### Task 7: 섹션 신설 — 후보 리뷰 + 프롬프트 복사, `ReferenceFold` 삭제

**Files:**
- Create: `components/WeeklyTaskSection.tsx`
- Modify: `components/WeeklyReportClient.tsx` (275~339행 `ReferenceFold` 삭제, 446행 호출부를 새 섹션으로 교체, 상단 주석 정리)

**Interfaces:**
- Consumes: `flattenCandidates`·`buildTaskPrompt`·`selectVisibleTasks`·`CandidateReview`·`WeeklyTaskRow`(Task 1~3)
- Produces: `<WeeklyTaskSection week cards reviews tasks embed />` 기본 컴포넌트

- [ ] **Step 1: `ReferenceFold`를 지운다**

`components/WeeklyReportClient.tsx`에서:
1. `ReferenceFold` 함수 전체(`// ─── 접힌 참고 영역 ───` 주석 줄부터 함수 닫는 `}` 까지)를 삭제한다.
2. 본체의 `<ReferenceFold report={report} />` 호출을 삭제한다.
3. 파일 상단 설계 주석에서 다음 두 줄을 지운다:

```
//   · 논의 카드 한 벌이 화면의 전부다. 통과·월단위·리뷰0건은 맨 아래 한 줄로 접는다.
//     (숨기는 게 아니라 접는다 — '리뷰 0건은 통과가 아니다'가 숫자로 남아야 한다.)
```

그 자리에 넣는다:

```
//   · 논의 카드 아래에는 주간 수행과제 섹션이 온다. 리포트가 관측에서 끝나지 않게 하는 층이다.
//     (2026-07-28에 '통과·월단위·리뷰0건' 접힌 참고를 걷어내고 그 자리를 내줬다 — 안 읽혔다.)
```

4. 더 이상 쓰지 않는 `ChevronDown` import는 **지우지 않는다** — `DiscussionCard`가 여전히 쓴다.

- [ ] **Step 2: `WeeklyTaskSection.tsx`를 만든다 (후보 목록 + 복사까지)**

```tsx
'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  flattenCandidates, buildTaskPrompt, selectVisibleTasks, branchesOf,
  type CandidateReview, type WeeklyTaskRow,
} from '@/lib/weeklyTasks'
import type { WeeklyChannelRow } from '@/lib/weeklyReport'
import type { ChannelReviews } from '@/lib/weeklyReviews'

// 주간 수행과제 — 논의 카드가 관측에서 끝나지 않게 하는 층이다.
//
//   · 이 컴포넌트는 어떤 문안도 만들지 않는다. 근거 리뷰를 모아 프롬프트로 내주고,
//     사람이 AI에게 받아 온 문안을 담을 뿐이다.
//   · 임베드(embed=true)는 읽기 전용이다. 쓰기 컨트롤은 disabled 가 아니라 렌더 자체를 안 한다 —
//     /embed/* 는 OAuth 를 타지 않고 ?key= 토큰만으로 열리기 때문이다.

const BRANCH_COLOR: Record<string, string> = {
  신설: 'var(--sinseol)', 동대문: 'var(--ddm)', 제주시티: 'var(--jeju)', 고성: 'var(--goseong)',
}
const branchColor = (b: string) => BRANCH_COLOR[b] ?? 'var(--text-3)'
const fmt = (n: number) => n.toFixed(1)

function ratingColor(r: number | null) {
  if (r == null) return 'var(--text-3)'
  if (r >= 9) return 'var(--done)'
  if (r >= 7) return 'var(--medium)'
  if (r >= 5) return 'var(--high)'
  return 'var(--critical)'
}

// ─── 후보 리뷰 ────────────────────────────────────────────────────────────────
function CandidateList({
  items, selected, onToggle,
}: {
  items: CandidateReview[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(it => {
        const on = selected.has(it.id)
        return (
          <label
            key={it.id}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
              border: `1px solid ${on ? 'var(--critical)' : 'var(--border)'}`,
              borderRadius: 8, padding: '9px 12px', background: 'var(--bg-input)',
            }}
          >
            <input
              type="checkbox" checked={on} onChange={() => onToggle(it.id)}
              style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: branchColor(it.branch) }} />
                  {it.branch} {it.otaName}
                </span>
                <span className="font-display" style={{ fontSize: 14, fontWeight: 800, color: ratingColor(it.rating) }}>
                  {it.rating == null ? '—' : fmt(it.rating)}
                </span>
                {it.date && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.date}</span>}
                {!it.translated && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>원문(번역 없음)</span>}
              </span>
              <span style={{ display: 'block', fontSize: 13, lineHeight: 1.65, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
                {it.body || '(본문 없음)'}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyTaskSection({
  week, cards, reviews, tasks, embed = false,
}: {
  week: string
  cards: WeeklyChannelRow[]
  reviews: Record<number, ChannelReviews>
  tasks: WeeklyTaskRow[]
  embed?: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openCandidates, setOpenCandidates] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')

  const candidates = flattenCandidates(cards, reviews)
  const { current, carried } = selectVisibleTasks(tasks, week)
  const chosen = candidates.filter(c => selected.has(c.id))

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildTaskPrompt(chosen, week))
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    setTimeout(() => setCopied('idle'), 2500)
  }

  const total = current.length + carried.length

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>
          주간 수행과제 {total}건
        </b>
        {!embed && (
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>· 후보 리뷰 {candidates.length}건</span>
        )}
      </div>

      {/* 후보 리뷰는 과제를 '만드는' 도구다 — 읽기 전용 임베드에는 내지 않는다 */}
      {!embed && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
          <button
            onClick={() => setOpenCandidates(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <span>후보 리뷰 {candidates.length}건{selected.size > 0 && ` · ${selected.size}건 선택`}</span>
            <ChevronDown size={14} style={{ marginLeft: 'auto', transform: openCandidates ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>

          {openCandidates && (
            <div style={{ marginTop: 12 }}>
              {candidates.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
                  근거로 쓸 리뷰 원문이 없습니다 — 이번 주 미달 채널이 없거나, 원문이 수집 범위 밖입니다
                </div>
              ) : (
                <>
                  <CandidateList items={candidates} selected={selected} onToggle={toggle} />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
                    논의 카드의 기준선 미달 리뷰만 올라옵니다. 원문을 확보하지 못한 채널은 여기에 없습니다
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={copyPrompt}
                      disabled={chosen.length === 0}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: chosen.length === 0 ? 'var(--text-3)' : 'var(--text-1)',
                        fontSize: 12, fontFamily: 'inherit', cursor: chosen.length === 0 ? 'default' : 'pointer',
                        opacity: chosen.length === 0 ? 0.5 : 1,
                      }}
                    >
                      AI용 프롬프트 복사
                    </button>
                    {copied === 'ok' && <span style={{ fontSize: 12, color: 'var(--done)' }}>복사했습니다 — Claude에 붙여넣고 받은 문안을 아래 폼에 옮기세요</span>}
                    {copied === 'fail' && <span style={{ fontSize: 12, color: 'var(--critical)' }}>복사에 실패했습니다 — 브라우저 클립보드 권한을 확인해 주세요</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: `WeeklyReportClient`에 마운트한다**

상단 import에 더한다:
```ts
import WeeklyTaskSection from './WeeklyTaskSection'
```

`ReferenceFold` 호출을 지운 자리에 넣는다:
```tsx
            <WeeklyTaskSection
              week={week}
              cards={cards}
              reviews={reviews}
              tasks={weeklyTasks}
              embed={embed}
            />
```

- [ ] **Step 4: 빌드하고 육안으로 확인한다**

🔴 `.next`를 먼저 지운다. `npm run build` 뒤에 dev를 띄우면 stale 청크 때문에 globals.css 신규 클래스가 빠진 CSS가 나온다.

```bash
rm -rf .next
npm run dev
```

`.env.local`의 `NEXT_PUBLIC_SUPABASE_*` 두 줄이 주석 처리돼 있으면 환경변수를 인라인 주입해 띄운다(anon 키는 Supabase MCP `get_publishable_keys`).

포트가 잡혀 있으면 PowerShell로 정리한다:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

확인할 것:
- `/weekly-report` — 접힌 참고(`통과 N · 월 단위 N · 리뷰 0건 N`)가 **사라졌다**
- 그 자리에 `주간 수행과제 0건 · 후보 리뷰 N건`이 있다
- 후보 리뷰를 펼치면 논의 카드에서 본 미달 리뷰와 **같은 건들**이 뜬다
- 2건 체크 → `AI용 프롬프트 복사` → 메모장에 붙여 지점·채널·점수·원문이 다 들어갔는지 확인
- `/embed/weekly-report?key=<토큰>` — 후보 리뷰 블록이 **아예 없다**(토큰은 노션 회의록의 기존 임베드 URL `?key=`에서 꺼낸다)

- [ ] **Step 5: 커밋**

```bash
git add components/WeeklyTaskSection.tsx components/WeeklyReportClient.tsx
git commit -m "feat(weekly): 접힌 참고 제거, 후보 리뷰·프롬프트 복사 섹션 신설"
```

---

### Task 8: 과제 생성 폼

**Files:**
- Modify: `components/WeeklyTaskSection.tsx`

**Interfaces:**
- Consumes: `POST /api/weekly-tasks`(Task 5), `branchesOf`(Task 1)
- Produces: 섹션 내부 `TaskForm` — 신규 저장 후 `router.refresh()`

- [ ] **Step 1: 폼 컴포넌트를 더한다**

`components/WeeklyTaskSection.tsx` 안, `CandidateList` 아래에 넣는다:

```tsx
// ─── 과제 폼 ──────────────────────────────────────────────────────────────────
// 붙여넣기가 주 입력 수단이다 — AI가 낸 '제목/문제 정의/해결안'을 옮겨 담는 자리다.
function TaskForm({
  week, sources, onDone, onCancel,
}: {
  week: string
  sources: CandidateReview[]
  onDone: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [solution, setSolution] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) { setErr('제목을 입력해 주세요'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/weekly-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: week,
          branches: branchesOf(sources),
          title,
          problem_definition: problem,
          solution,
          assignee,
          due_date: due,
          source_reviews: sources,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? '저장에 실패했습니다')
        return
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.7,
  }
  const label: React.CSSProperties = { fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>새 주간 수행과제</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
        근거 리뷰 {sources.length}건 · {branchesOf(sources).join(' · ') || '지점 없음'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={label}>제목</label>
          <input style={field} value={title} onChange={e => setTitle(e.target.value)} placeholder="AI가 낸 제목을 붙여넣으세요" />
        </div>
        <div>
          <label style={label}>문제 정의</label>
          <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} value={problem} onChange={e => setProblem(e.target.value)} />
        </div>
        <div>
          <label style={label}>해결안</label>
          <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} value={solution} onChange={e => setSolution(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>담당</label>
            <input style={field} value={assignee} onChange={e => setAssignee(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>기한</label>
            <input style={field} type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
        </div>
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--critical)', marginTop: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={save} disabled={saving}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--critical)',
            background: 'var(--critical)', color: '#fff', fontSize: 12,
            fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          onClick={onCancel} disabled={saving}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          취소
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 본체에 폼을 붙인다**

`WeeklyTaskSection` 상단에 `useRouter`를 더한다:

```tsx
import { useRouter } from 'next/navigation'
```

본체 안 상태에 더한다:
```tsx
  const [formOpen, setFormOpen] = useState(false)
  const router = useRouter()
```

`AI용 프롬프트 복사` 버튼 옆에 버튼 하나를 더한다:

```tsx
                    <button
                      onClick={() => setFormOpen(true)}
                      disabled={chosen.length === 0}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: chosen.length === 0 ? 'var(--text-3)' : 'var(--text-1)',
                        fontSize: 12, fontFamily: 'inherit', cursor: chosen.length === 0 ? 'default' : 'pointer',
                        opacity: chosen.length === 0 ? 0.5 : 1,
                      }}
                    >
                      선택 {chosen.length}건으로 과제 만들기
                    </button>
```

후보 리뷰 카드 블록 **아래**, 과제 카드 목록 **위**에 폼을 렌더한다:

```tsx
      {!embed && formOpen && (
        <TaskForm
          week={week}
          sources={chosen}
          onCancel={() => setFormOpen(false)}
          onDone={() => {
            setFormOpen(false)
            setSelected(new Set())
            router.refresh()
          }}
        />
      )}
```

- [ ] **Step 3: 육안으로 확인한다**

`npm run dev` (`.next` 정리 후) → `/weekly-report`
- 후보 리뷰 2건 체크 → `선택 2건으로 과제 만들기` → 폼이 뜬다
- 제목 없이 저장 → `제목을 입력해 주세요`
- 제목·문제 정의·해결안을 넣고 저장 → 폼이 닫히고 체크가 풀린다
- Supabase MCP `execute_sql`로 확인:
  ```sql
  select id, week_start, branches, title, jsonb_array_length(source_reviews) as src
  from weekly_tasks order by created_at desc limit 3;
  ```
  Expected: `week_start`가 화면의 주 라벨과 같고, `src`가 선택한 건수와 같다

- [ ] **Step 4: 커밋**

```bash
git add components/WeeklyTaskSection.tsx
git commit -m "feat(weekly): 주간 수행과제 생성 폼"
```

---

### Task 9: 과제 카드 — 상태 · 이월 · 다음달 채택

**Files:**
- Modify: `components/WeeklyTaskSection.tsx`

**Interfaces:**
- Consumes: `PATCH`·`DELETE /api/weekly-tasks`(Task 5), `selectVisibleTasks`(Task 3)
- Produces: 섹션 내부 `TaskCard`

- [ ] **Step 1: 과제 카드를 더한다**

`TaskForm` 아래에 넣는다:

```tsx
// ─── 과제 카드 ────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<WeeklyTaskStatus, string> = {
  시작전: 'var(--text-3)', 진행중: 'var(--progress)', 완료: 'var(--done)',
}

function TaskCard({
  task, carried, embed, onChanged,
}: {
  task: WeeklyTaskRow
  carried: boolean
  embed: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await fetch('/api/weekly-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...body }),
      })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await fetch(`/api/weekly-tasks?id=${task.id}`, { method: 'DELETE' })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{
      padding: '12px 18px', marginBottom: 8,
      borderLeft: `3px solid ${task.escalated ? 'var(--medium)' : STATUS_COLOR[task.status]}`,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 15, fontWeight: 700, minWidth: 0 }}>
          {task.branches.map(b => (
            <span key={b} style={{ width: 7, height: 7, borderRadius: '50%', background: branchColor(b), flexShrink: 0 }} />
          ))}
          {task.title}
          {carried && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>[이월 {task.week_start}]</span>}
          {task.escalated && <span style={{ fontSize: 11, color: 'var(--medium)', fontWeight: 400 }}>다음달 채택</span>}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: STATUS_COLOR[task.status], fontWeight: 700 }}>{task.status}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>근거 {task.source_reviews.length}건</span>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)',
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {open ? '닫기' : '자세히'}
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, lineHeight: 1.75 }}>
          {task.problem_definition && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>문제 정의</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{task.problem_definition}</div>
            </div>
          )}
          {task.solution && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>해결안</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{task.solution}</div>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
            {[task.assignee && `담당 ${task.assignee}`, task.due_date && `기한 ${task.due_date}`, `생성 ${task.week_start}`]
              .filter(Boolean).join(' · ')}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>근거 리뷰 {task.source_reviews.length}건</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {task.source_reviews.map(s => (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', background: 'var(--bg-input)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginBottom: 3, fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>{s.branch} {s.otaName}</span>
                  <span className="font-display" style={{ fontSize: 13, fontWeight: 800, color: ratingColor(s.rating) }}>
                    {s.rating == null ? '—' : fmt(s.rating)}
                  </span>
                  {s.date && <span>{s.date}</span>}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{s.body || '(본문 없음)'}</div>
              </div>
            ))}
          </div>

          {/* 쓰기 컨트롤 — 임베드에는 렌더하지 않는다 */}
          {!embed && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, alignItems: 'center' }}>
              {WEEKLY_TASK_STATUSES.map(s => (
                <button
                  key={s} onClick={() => patch({ status: s })} disabled={busy || s === task.status}
                  style={{
                    padding: '5px 11px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                    cursor: s === task.status ? 'default' : 'pointer',
                    border: `1px solid ${s === task.status ? STATUS_COLOR[s] : 'var(--border)'}`,
                    background: s === task.status ? 'var(--bg-input)' : 'var(--bg-card)',
                    color: s === task.status ? STATUS_COLOR[s] : 'var(--text-2)',
                  }}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => patch({ escalated: !task.escalated })} disabled={busy}
                style={{
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${task.escalated ? 'var(--medium)' : 'var(--border)'}`,
                  background: 'var(--bg-card)', color: task.escalated ? 'var(--medium)' : 'var(--text-2)',
                  marginLeft: 8,
                }}
              >
                {task.escalated ? '채택 해제' : '다음달 정식 과제로 채택'}
              </button>
              <button
                onClick={remove} disabled={busy}
                style={{
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-3)',
                  marginLeft: 'auto',
                }}
              >
                삭제
              </button>
            </div>
          )}
          {!embed && task.escalated && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
              다음 달 VOC 분석(/voc-analysis)이 이 과제를 변심 트리거·수행과제 도출의 후보로 읽습니다 — 지금 tasks에 등록되지는 않습니다
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

상단 import에 `WEEKLY_TASK_STATUSES`, `type WeeklyTaskStatus`를 더한다.

- [ ] **Step 2: 본체에 목록을 붙인다**

폼 렌더 아래에 넣는다:

```tsx
      {total === 0 ? (
        <div className="card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-2)' }}>
          이번 주 수행과제가 아직 없습니다.
          {!embed && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 5 }}>
              위 후보 리뷰에서 근거를 고르고 프롬프트를 복사해 과제를 만드세요
            </div>
          )}
        </div>
      ) : (
        <>
          {current.map(t => (
            <TaskCard key={`${week}-${t.id}`} task={t} carried={false} embed={embed} onChanged={() => router.refresh()} />
          ))}
          {carried.map(t => (
            <TaskCard key={`${week}-${t.id}`} task={t} carried embed={embed} onChanged={() => router.refresh()} />
          ))}
        </>
      )}
```

🔴 `key`에 `week`를 포함한다. 이 repo는 같은 컴포넌트가 복제·재사용될 때 펼침 상태가 새는 버그가 반복됐다(2026-07-03 진행사항, 2026-07-24 논의 카드).

- [ ] **Step 3: 육안으로 확인한다**

`.next` 정리 후 `npm run dev`:
- 과제 카드가 뜬다. `자세히`를 펼치면 문제 정의·해결안·근거 리뷰 원문이 보인다
- `진행중` → `완료` 상태 변경이 즉시 반영된다
- `다음달 정식 과제로 채택` → 배지가 붙고 안내 문구가 나온다. 다시 눌러 해제된다
- **주를 넘겨 본다**: `이전 주`로 갔다가 돌아왔을 때 펼침이 따라오지 않는다
- **이월 확인**: Supabase MCP로 지난 주 미완 과제를 하나 만들어 이번 주 리포트에 `[이월 …]` 배지로 뜨는지 본다
  ```sql
  insert into weekly_tasks (week_start, branches, title, status)
  values ('2026-07-20', '{신설}', '이월 테스트', '진행중');
  ```
  확인 후 지운다: `delete from weekly_tasks where title = '이월 테스트';`
- `/embed/weekly-report?key=<토큰>` — 과제 카드는 보이고 **상태 버튼·채택·삭제가 없다**

- [ ] **Step 4: 커밋**

```bash
git add components/WeeklyTaskSection.tsx
git commit -m "feat(weekly): 주간 과제 카드 · 상태 · 이월 · 다음달 채택"
```

---

### Task 10: `/voc-analysis` 스킬 연동

**Files:**
- Modify: `C:\Users\MGRV\.claude\skills\voc-analysis\SKILL.md`

**Interfaces:**
- Consumes: `weekly_tasks.escalated`(Task 4·9)
- Produces: 월 분석 Step 1에 쿼리 D 추가, Step 2에 후보 반영 규칙 추가

> 이 파일은 VOC-Task-Dashboard repo 밖(볼트)에 있다. repo 커밋에 포함되지 않는다.

- [ ] **Step 1: Step 1에 쿼리 D를 더한다**

`## Step 1 — Supabase 리뷰 데이터 조회` 안, `### 쿼리 C` 다음에 넣는다:

````markdown
### 쿼리 D: 다음달 채택된 주간 수행과제 (선행 후보)

주간 OTA 리포트에서 재헌님이 「다음달 정식 과제로 채택」을 누른 건들이다. 이미 사람이
리뷰 원문을 읽고 문제 정의·해결안을 써 둔 것이므로, 이번 달 도출의 **선행 후보**로 읽는다.

```sql
select id, week_start, branches, title, problem_definition, solution, source_reviews
from weekly_tasks
where escalated = true
  and to_char(week_start, 'YYYY-MM') = '{{분석 대상 월}}'
order by week_start;
```

- 결과가 0건이면 그냥 넘어간다(주간 층을 안 쓴 달일 수 있다).
- `source_reviews`는 근거 리뷰 원문 스냅샷이다 — 리뷰 재조회 없이 그대로 인용할 수 있다.
- 🔴 이 목록을 **그대로 수행과제로 변환하지 않는다.** Step 2의 그루핑·등급 판정을 똑같이 거친다.
  주간에 가볍게 잡은 건이 월 단위로 보면 다른 문제의 증상일 수 있다.
````

- [ ] **Step 2: Step 2에 반영 규칙을 더한다**

`## Step 2 — 변심 트리거 / 개선 인사이트 도출 (AI 분석)` 안, `### 그루핑 기준 (우선순위 순)` 바로 앞에 넣는다:

```markdown
### 주간 채택 건 반영 (쿼리 D 결과가 있을 때)

- 채택된 주간 과제는 **이미 사람이 판단한 문제**다. 그루핑에서 누락되면 안 된다 —
  묶은 결과에 대응되는 부모(변심 트리거/개선 인사이트)가 없으면 왜 빠졌는지 사용자에게 설명한다.
- 주간 과제의 `problem_definition`·`solution`은 참고이지 정답이 아니다. 월 전체 리뷰를 읽은 결과와
  어긋나면 어긋난다고 말하고 근거를 댄다.
- 주간 과제와 월간 수행과제를 시스템적으로 잇지 않는다(연결 컬럼이 없다). 주간 층은 그대로 둔다.
```

- [ ] **Step 3: 스킬 버전을 올린다**

frontmatter의 `version: 2.0.0` → `version: 2.1.0`

- [ ] **Step 4: 확인한다**

Run: `grep -n "쿼리 D\|주간 채택 건 반영\|version:" "C:\Users\MGRV\.claude\skills\voc-analysis\SKILL.md"`
Expected: 세 항목이 모두 잡힌다

---

### Task 11: 최종 검증

**Files:** (변경 없음)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전량 PASS

- [ ] **Step 2: 프로덕션 빌드**

Run: `rm -rf .next && npm run build`
Expected: 성공. `lib/pageData.ts`의 eslint `any` 오류 72건은 **기존**이라 무시한다(내 변경 전후 동일).

`.env.local`의 `NEXT_PUBLIC_SUPABASE_*` 두 줄이 주석 처리돼 있으면 인라인 주입해서 빌드한다.

- [ ] **Step 3: 프로덕션 빌드로 육안 확인**

```bash
npx next start -p 3100
```

- `http://localhost:3100/weekly-report` — 실앱 전 기능
- `http://localhost:3100/embed/weekly-report?key=<토큰>` — 읽기 전용. 후보 리뷰 블록 없음, 카드에 쓰기 버튼 없음
- 주 이동(`이전 주`/`다음 주`) 시 과제 목록이 그 주 것으로 바뀌고, 펼침이 따라오지 않는다

dev 서버는 HMR 웹소켓 실패로 하이드레이션이 안 돼 클릭이 죽으므로, 최종 확인은 반드시 프로덕션 빌드로 한다.

- [ ] **Step 4: 푸시**

```bash
git -c credential.helper= -c credential.helper="!gh auth git-credential" push origin main
```

첫 줄 `fatal` 아래에 `xxx..yyy  main -> main`이 있으면 성공이다.

- [ ] **Step 5: Vercel 배포 확인**

PowerShell에서:
```powershell
vercel inspect https://voc-task-dashboard.vercel.app
```
`vercel ls`는 상태표를 stderr로 내므로 stdout 폴링은 끝나지 않는다. 판정은 `inspect`로 한다.

- [ ] **Step 6: 결과 문서를 남긴다**

`docs/superpowers/2026-07-28-weekly-task-section-outcome.md`에 실제로 무엇이 바뀌었는지, 계획과 달라진 부분, 실행 중 발견한 함정을 적고 커밋한다.

---

## 실행 중 반드시 지킬 것

- **계획의 샘플 코드를 무비판으로 믿지 않는다.** 2026-07-24 작업에서 계획 문서 자체의 결함 5건이 실행 중에 나왔다. 타입·필드명이 실제 코드와 다르면 실제 코드를 따르고, 어긋난 지점을 결과 문서에 남긴다.
- **`.next`를 지우지 않고 dev를 띄우지 않는다.** stale 청크로 '검증'하면 안 고쳐진 화면을 통과시킨다.
- **`pkill`은 Windows에서 안 먹는다.** 포트 정리는 PowerShell `Get-NetTCPConnection -LocalPort N -State Listen` → `Stop-Process`.
- **ISR 캐시(60초)** 때문에 저장 직후 옛 값이 보일 수 있다. `revalidateTag`가 걸려 있으니 새로고침으로 확인하되, 안 바뀌면 캐시부터 의심한다.
