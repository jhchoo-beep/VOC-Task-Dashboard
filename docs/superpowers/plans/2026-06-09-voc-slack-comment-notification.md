# VOC 수행과제 새 댓글 → 슬랙 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수행과제(`tasks`)에 새 댓글(`task_logs`)이 작성되면 해당 지점 스쿼드 슬랙 채널로 유저그룹 멘션 + 딥링크 알림을 자동 발송한다.

**Architecture:** 슬랙 의존성을 `lib/slack.ts` 한 파일에 격리한다. 순수 로직(지점→채널/유저그룹 매핑, 메시지 텍스트 빌드, 링크 댓글 변환·절단, 딥링크 생성)은 vitest로 단위 테스트한다. `app/api/tasks/logs/route.ts`의 POST는 댓글 INSERT 성공 후 과제 정보를 조회해 `notifyNewComment`를 fire-and-forget으로 호출한다 — 슬랙 실패가 댓글 저장 응답을 막지 않는다.

**Tech Stack:** Next.js 15(App Router) · Supabase(@supabase/supabase-js) · Slack Web API `chat.postMessage`(fetch) · vitest(신규)

---

## File Structure

- `lib/slack.ts` (신규) — 슬랙 알림 전담 모듈
  - `BRANCH_SLACK_MAP` 상수: 지점 → `{ channel, usergroup }`
  - `resolveBranchTarget(branch)`: 매핑 조회, 없으면 `null`
  - `formatCommentForSlack(content)`: `[링크] 제목||URL` 변환 + 길이 절단
  - `buildTaskDeepLink(taskId, taskMonth)`: 딥링크 URL 생성
  - `buildSlackText(args)`: 최종 메시지 텍스트 조립
  - `notifyNewComment(args)`: 매핑 조회 → `chat.postMessage` fetch (얇은 I/O 래퍼)
- `lib/slack.test.ts` (신규) — 순수 함수 단위 테스트
- `app/api/tasks/logs/route.ts` (수정) — POST에서 INSERT 후 과제 조회 + `notifyNewComment` 호출
- `package.json` (수정) — `vitest` devDependency + `test` 스크립트
- `vitest.config.ts` (신규) — vitest 설정

운영 1회 작업(코드 외, 본 계획 범위 밖이지만 동작 전제): Slack 앱 생성·봇 토큰(`chat:write`) 발급, 봇을 4개 스쿼드 채널에 초대, 채널 ID·유저그룹 ID 수집 후 `BRANCH_SLACK_MAP`에 반영, `SLACK_BOT_TOKEN`을 `.env.local`·Vercel에 등록. 이 작업은 마지막 Task에서 안내한다.

---

### Task 1: vitest 테스트 인프라 추가

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: vitest 설치**

Run: `npm install -D vitest`
Expected: `vitest`가 `devDependencies`에 추가됨.

- [ ] **Step 2: test 스크립트 추가**

`package.json`의 `scripts`에 추가:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: vitest 설정 파일 생성**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: 설정이 동작하는지 빈 실행 확인**

Run: `npm test`
Expected: "No test files found" 또는 0 tests 통과 (에러 없이 종료). 설정 파싱 성공 확인.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: vitest 테스트 인프라 추가"
```

---

### Task 2: 지점 → 채널/유저그룹 매핑

**Files:**
- Create: `lib/slack.ts`
- Test: `lib/slack.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `lib/slack.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveBranchTarget } from './slack'

describe('resolveBranchTarget', () => {
  it('신설을 ssd 스쿼드 채널/유저그룹으로 매핑한다', () => {
    expect(resolveBranchTarget('신설')).toEqual({
      channel: 'be-ops-ssd-squad',
      usergroup: 'ssdsquad',
    })
  })

  it('동대문/고성/제주시티도 매핑한다', () => {
    expect(resolveBranchTarget('동대문')?.usergroup).toBe('ddmsquad')
    expect(resolveBranchTarget('고성')?.channel).toBe('be-ops-gs-squad')
    expect(resolveBranchTarget('제주시티')?.usergroup).toBe('jjsquad')
  })

  it('매핑에 없는 지점은 null을 반환한다', () => {
    expect(resolveBranchTarget('알수없는지점')).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `resolveBranchTarget` is not defined / `lib/slack.ts` 모듈 없음.

- [ ] **Step 3: 매핑 구현**

Create `lib/slack.ts`:

```ts
// 지점 → 슬랙 스쿼드 채널 / 유저그룹 매핑
// 운영: 멘션 활성화를 위해 channel/usergroup은 ID(C…/S…)로 교체 권장.
// 현재는 사람이 읽는 이름으로 두고, 설정 단계에서 ID로 치환한다.
export interface BranchTarget {
  channel: string
  usergroup: string
}

export const BRANCH_SLACK_MAP: Record<string, BranchTarget> = {
  '신설': { channel: 'be-ops-ssd-squad', usergroup: 'ssdsquad' },
  '동대문': { channel: 'be-ops-ddm-squad', usergroup: 'ddmsquad' },
  '고성': { channel: 'be-ops-gs-squad', usergroup: 'gssquad' },
  '제주시티': { channel: 'be-ops-jj-squad', usergroup: 'jjsquad' },
}

export function resolveBranchTarget(branch: string): BranchTarget | null {
  return BRANCH_SLACK_MAP[branch] ?? null
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (resolveBranchTarget 3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/slack.ts lib/slack.test.ts
git commit -m "feat(slack): 지점→채널/유저그룹 매핑 추가"
```

---

### Task 3: 댓글 내용 슬랙용 변환 (링크 형식 + 절단)

**Files:**
- Modify: `lib/slack.ts`
- Modify: `lib/slack.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/slack.test.ts`에 추가:

```ts
import { formatCommentForSlack } from './slack'

describe('formatCommentForSlack', () => {
  it('일반 텍스트는 그대로 반환한다', () => {
    expect(formatCommentForSlack('확인 부탁드립니다')).toBe('확인 부탁드립니다')
  })

  it('[링크] 제목||URL 형식을 사람이 읽을 형태로 변환한다', () => {
    expect(formatCommentForSlack('[링크] 시안 문서||https://ex.com/a'))
      .toBe('시안 문서 (https://ex.com/a)')
  })

  it('300자를 초과하면 절단하고 …을 붙인다', () => {
    const long = 'a'.repeat(400)
    const out = formatCommentForSlack(long)
    expect(out.length).toBe(301) // 300 + '…'
    expect(out.endsWith('…')).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `formatCommentForSlack` is not defined.

- [ ] **Step 3: 구현 추가**

`lib/slack.ts`에 추가:

```ts
const MAX_LEN = 300

export function formatCommentForSlack(content: string): string {
  let text = content.trim()

  // 앱 내부 링크 댓글 형식: "[링크] 제목||URL"
  const linkMatch = text.match(/^\[링크\]\s*(.*?)\|\|(.+)$/)
  if (linkMatch) {
    const [, label, url] = linkMatch
    text = `${label.trim()} (${url.trim()})`
  }

  if (text.length > MAX_LEN) {
    text = text.slice(0, MAX_LEN) + '…'
  }
  return text
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/slack.ts lib/slack.test.ts
git commit -m "feat(slack): 댓글 내용 슬랙용 변환(링크/절단)"
```

---

### Task 4: 딥링크 + 메시지 텍스트 빌드

**Files:**
- Modify: `lib/slack.ts`
- Modify: `lib/slack.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`lib/slack.test.ts`에 추가:

```ts
import { buildTaskDeepLink, buildSlackText } from './slack'

describe('buildTaskDeepLink', () => {
  it('task/month 쿼리가 포함된 tasks 딥링크를 만든다', () => {
    expect(buildTaskDeepLink('abc-123', '2026-06'))
      .toBe('https://voc-task-dashboard.vercel.app/tasks?task=abc-123&month=2026-06')
  })

  it('month가 없으면 task만 붙인다', () => {
    expect(buildTaskDeepLink('abc-123', ''))
      .toBe('https://voc-task-dashboard.vercel.app/tasks?task=abc-123')
  })
})

describe('buildSlackText', () => {
  it('지점/제목/유저그룹멘션/작성자/내용/딥링크를 포함한다', () => {
    const text = buildSlackText({
      branch: '신설',
      taskTitle: '체크인 동선 개선',
      usergroup: 'ssdsquad',
      author: '추재헌',
      content: '시안 공유드립니다',
      link: 'https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-06',
    })
    expect(text).toContain('[VOC 새 댓글] 신설 · 체크인 동선 개선')
    expect(text).toContain('<!subteam^ssdsquad>')
    expect(text).toContain('작성자: 추재헌')
    expect(text).toContain('시안 공유드립니다')
    expect(text).toContain('<https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-06|대시보드에서 보기>')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `buildTaskDeepLink` / `buildSlackText` is not defined.

- [ ] **Step 3: 구현 추가**

`lib/slack.ts`에 추가:

```ts
const APP_URL = 'https://voc-task-dashboard.vercel.app'

export function buildTaskDeepLink(taskId: string, taskMonth: string): string {
  const base = `${APP_URL}/tasks?task=${encodeURIComponent(taskId)}`
  return taskMonth ? `${base}&month=${encodeURIComponent(taskMonth)}` : base
}

export interface SlackTextArgs {
  branch: string
  taskTitle: string
  usergroup: string
  author: string
  content: string
  link: string
}

export function buildSlackText(args: SlackTextArgs): string {
  const { branch, taskTitle, usergroup, author, content, link } = args
  return [
    `[VOC 새 댓글] ${branch} · ${taskTitle}`,
    `<!subteam^${usergroup}>`,
    `작성자: ${author}`,
    formatCommentForSlack(content),
    `<${link}|대시보드에서 보기>`,
  ].join('\n')
}
```

> 주: `<!subteam^ID>` 멘션은 `ID`가 실제 subteam ID(`S…`)일 때만 활성화된다. `BRANCH_SLACK_MAP`의 `usergroup`을 설정 단계에서 ID로 치환하면 그대로 동작한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/slack.ts lib/slack.test.ts
git commit -m "feat(slack): 딥링크 및 메시지 텍스트 빌드"
```

---

### Task 5: notifyNewComment I/O 래퍼

**Files:**
- Modify: `lib/slack.ts`
- Modify: `lib/slack.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가 (fetch 모킹)**

`lib/slack.test.ts`에 추가:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { notifyNewComment } from './slack'

describe('notifyNewComment', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SLACK_BOT_TOKEN
  })

  it('매핑된 지점이면 chat.postMessage를 올바른 페이로드로 호출한다', async () => {
    await notifyNewComment({
      branch: '신설', taskId: 't1', taskTitle: '동선 개선',
      taskMonth: '2026-06', author: '추재헌', content: '공유드립니다',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    const body = JSON.parse(opts.body)
    expect(body.channel).toBe('be-ops-ssd-squad')
    expect(body.text).toContain('<!subteam^ssdsquad>')
    expect(opts.headers.Authorization).toBe('Bearer xoxb-test')
  })

  it('매핑에 없는 지점이면 발송하지 않는다', async () => {
    await notifyNewComment({
      branch: '없는지점', taskId: 't1', taskTitle: 'x',
      taskMonth: '2026-06', author: 'a', content: 'b',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('토큰이 없으면 발송하지 않는다', async () => {
    delete process.env.SLACK_BOT_TOKEN
    await notifyNewComment({
      branch: '신설', taskId: 't1', taskTitle: 'x',
      taskMonth: '2026-06', author: 'a', content: 'b',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `notifyNewComment` is not defined.

- [ ] **Step 3: 구현 추가**

`lib/slack.ts`에 추가:

```ts
export interface NotifyArgs {
  branch: string
  taskId: string
  taskTitle: string
  taskMonth: string
  author: string
  content: string
}

export async function notifyNewComment(args: NotifyArgs): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    console.warn('[slack] SLACK_BOT_TOKEN 미설정 — 알림 스킵')
    return
  }

  const target = resolveBranchTarget(args.branch)
  if (!target) {
    console.warn(`[slack] 매핑 없는 지점 "${args.branch}" — 알림 스킵`)
    return
  }

  const text = buildSlackText({
    branch: args.branch,
    taskTitle: args.taskTitle,
    usergroup: target.usergroup,
    author: args.author,
    content: args.content,
    link: buildTaskDeepLink(args.taskId, args.taskMonth),
  })

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: target.channel, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data?.ok) {
    console.error('[slack] chat.postMessage 실패:', data?.error ?? res.status)
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (notifyNewComment 3 tests + 이전 테스트 전부).

- [ ] **Step 5: Commit**

```bash
git add lib/slack.ts lib/slack.test.ts
git commit -m "feat(slack): notifyNewComment chat.postMessage 래퍼"
```

---

### Task 6: 댓글 POST에 알림 연결 (fire-and-forget)

**Files:**
- Modify: `app/api/tasks/logs/route.ts`

- [ ] **Step 1: route에 과제 조회 + 알림 호출 추가**

`app/api/tasks/logs/route.ts`의 `POST` 함수에서, 기존 INSERT 성공 분기를 다음과 같이 수정한다. 현재 코드:

```ts
  const { data, error } = await supabase
    .from('task_logs').insert({ task_id: taskId, author, content }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
```

다음으로 교체:

```ts
  const { data, error } = await supabase
    .from('task_logs').insert({ task_id: taskId, author, content }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 슬랙 알림 (fire-and-forget): 실패해도 댓글 저장 응답은 정상 반환
  try {
    const { data: task } = await supabase
      .from('tasks').select('branch, title, task_month').eq('id', taskId).single()
    if (task) {
      void notifyNewComment({
        branch: task.branch,
        taskId,
        taskTitle: task.title,
        taskMonth: task.task_month ?? '',
        author,
        content,
      }).catch((e) => console.error('[slack] 알림 실패:', e))
    }
  } catch (e) {
    console.error('[slack] 과제 조회 실패:', e)
  }

  return NextResponse.json(data)
```

- [ ] **Step 2: import 추가**

`app/api/tasks/logs/route.ts` 상단 import에 추가:

```ts
import { notifyNewComment } from '@/lib/slack'
```

- [ ] **Step 3: 타입/빌드 검증**

Run: `npm run build`
Expected: 빌드 성공 (타입 에러 없음).

- [ ] **Step 4: 전체 테스트 재확인**

Run: `npm test`
Expected: PASS (모든 lib/slack 테스트 통과).

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/logs/route.ts
git commit -m "feat(tasks): 새 댓글 작성 시 슬랙 알림 발송 연결"
```

---

### Task 7: 운영 설정 및 수동 검증

**Files:** 없음 (운영 작업 + 수동 확인)

- [ ] **Step 1: Slack 앱 생성 및 봇 토큰 발급**

api.slack.com/apps 에서 앱 생성 → OAuth & Permissions → Bot Token Scopes에 `chat:write` 추가 → 워크스페이스에 설치 → Bot User OAuth Token(`xoxb-…`) 복사.

- [ ] **Step 2: 봇을 4개 스쿼드 채널에 초대**

각 채널(be-ops-ssd-squad, be-ops-ddm-squad, be-ops-gs-squad, be-ops-jj-squad)에서 `/invite @<봇이름>`.

- [ ] **Step 3: 채널 ID·유저그룹 ID 수집 후 매핑 치환**

채널 ID는 채널 상세에서, 유저그룹 ID(`S…`)는 슬랙 관리 또는 `usergroups.list` API로 확인. `lib/slack.ts`의 `BRANCH_SLACK_MAP`에서 `channel`을 채널 ID로, `usergroup`을 subteam ID로 치환하면 멘션이 활성화된다. (치환 후 `lib/slack.test.ts`의 기대값도 함께 갱신하고 `npm test`로 확인.)

- [ ] **Step 4: 환경변수 등록**

`.env.local`과 Vercel 프로젝트 환경변수에 `SLACK_BOT_TOKEN=xoxb-…` 추가. (메모리·git에 토큰 저장 금지.)

- [ ] **Step 5: 배포 후 실제 댓글로 검증**

main 푸시 → Vercel 자동 배포 → 앱에서 한 과제에 테스트 댓글 작성 → 해당 지점 스쿼드 채널에 알림 도착·유저그룹 멘션·딥링크 클릭 시 해당 과제로 이동 확인.

- [ ] **Step 6: 매핑 치환 커밋**

```bash
git add lib/slack.ts lib/slack.test.ts
git commit -m "chore(slack): 채널/유저그룹 ID로 매핑 치환"
```
