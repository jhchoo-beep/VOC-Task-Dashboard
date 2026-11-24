// STAY VOC 2.0 수행과제 — 순수 계산 모듈(화면 없음, DB 호출 없음).
// 정렬·묶음·진행 사항 접두사·입력창 키 처리 규칙은 1.0 components/TasksClient.tsx 를 그대로 옮겼다.
// 🔴 vitest 가 '@/' 별칭을 못 풀어 이 파일은 상대 경로 import 만 쓴다.

export const TASK_STATUSES = ['시작전', '진행중', '완료', '보류'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const
export const TRIGGER_PRESETS = ['청결 Critical', '복합이슈', '서비스 실패', '가격 불일치']
export const CATEGORIES = ['청결', '소음', '시설', '직원서비스', '체크인/체크아웃', '위치/접근성', '어메니티', '가격', '보안', '기타']
export const UNCLASSIFIED = '미분류'
export const ALL_STATUS = '전체'

export interface Task {
  id: string
  branch: string
  task_month: string | null
  title: string
  severity: string | null
  churn_trigger: string[] | null
  problem_definition: string | null
  solution: string | null
  review_content: string | null
  category: string[] | null
  assignee: string | null
  due_date: string | null
  status: string
  linked_review_ids: string[] | null
  link_url: string | null
  link_label: string | null
  priority_score: number | null
  created_at?: string | null
}

export interface TaskLog {
  id: string
  task_id: string
  author: string | null
  content: string | null
  attachments: { fileId: string; name: string }[] | null
  created_at: string
}

const SEV_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const STATUS_ORDER: Record<string, number> = { 진행중: 0, 시작전: 1, 완료: 2, 보류: 3 }

export const triggersOf = (t: Pick<Task, 'churn_trigger'>): string[] =>
  Array.isArray(t.churn_trigger) ? t.churn_trigger.filter(Boolean) : []
export const categoriesOf = (t: Pick<Task, 'category'>): string[] =>
  Array.isArray(t.category) ? t.category.filter(Boolean) : []

/** 1.0 목록 순서: 심각도 → priority_score 큰 순 */
export function sortTasks<T extends Pick<Task, 'severity' | 'priority_score'>>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) =>
    (SEV_ORDER[a.severity ?? ''] ?? 99) - (SEV_ORDER[b.severity ?? ''] ?? 99) || (b.priority_score ?? 0) - (a.priority_score ?? 0))
}

/** 지점·상태·검색어로 거른다. 검색은 제목, 문제 정의, 해결 방안, 담당, 트리거, 카테고리, 관련 리뷰 */
export function filterTasks<T extends Task>(tasks: T[], o: { branch: string; status: string; q: string }): T[] {
  const ql = o.q.trim().toLowerCase()
  return tasks.filter(t => {
    if (o.branch !== '전체' && t.branch !== o.branch) return false
    if (o.status !== ALL_STATUS && t.status !== o.status) return false
    if (!ql) return true
    const hay = [t.title, t.problem_definition, t.solution, t.assignee, t.review_content, ...triggersOf(t), ...categoriesOf(t)]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(ql)
  })
}

export interface Counts { total: number; done: number; pct: number | null; byStatus: Record<TaskStatus, number> }

export function countTasks(tasks: Pick<Task, 'status'>[]): Counts {
  const byStatus = { 시작전: 0, 진행중: 0, 완료: 0, 보류: 0 } as Record<TaskStatus, number>
  for (const t of tasks) if (t.status in byStatus) byStatus[t.status as TaskStatus]++
  const total = tasks.length
  return { total, done: byStatus['완료'], pct: total ? Math.round(byStatus['완료'] / total * 100) : null, byStatus }
}

export interface TriggerGroup<T> { trigger: string; tasks: T[] }

/**
 * 변심 트리거별 묶음(1.0 규칙). 한 과제가 트리거 N개에 속하면 N묶음에 다 들어간다.
 * 묶음 안: 진행중 → 시작전 → 완료 → 보류, 같으면 심각도.
 * 묶음 순서: 미분류는 맨 끝, 전부 보류인 묶음은 뒤로, 진행중 많은 순, 안 끝난 과제 많은 순.
 */
export function groupByTrigger<T extends Task>(tasks: T[]): TriggerGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const task of tasks) {
    const ts = triggersOf(task)
    for (const t of ts.length ? ts : [UNCLASSIFIED]) map.set(t, [...(map.get(t) ?? []), task])
  }
  const inner = (xs: T[]) => [...xs].sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) || (SEV_ORDER[a.severity ?? ''] ?? 99) - (SEV_ORDER[b.severity ?? ''] ?? 99))
  const allHold = (xs: T[]) => xs.every(t => t.status === '보류')
  const n = (xs: T[], f: (t: T) => boolean) => xs.filter(f).length
  return [...map.entries()]
    .map(([trigger, xs]) => ({ trigger, tasks: inner(xs) }))
    .sort((a, b) => {
      if (a.trigger === UNCLASSIFIED) return 1
      if (b.trigger === UNCLASSIFIED) return -1
      const ah = allHold(a.tasks), bh = allHold(b.tasks)
      if (ah !== bh) return ah ? 1 : -1
      return (n(b.tasks, t => t.status === '진행중') - n(a.tasks, t => t.status === '진행중'))
        || (n(b.tasks, t => t.status !== '완료') - n(a.tasks, t => t.status !== '완료'))
    })
}

// ─── 진행 사항 ──────────────────────────────────────────
// content 접두사로 종류를 담는다(1.0·슬랙 알림과 같은 규칙): 업데이트=없음, '[이슈] ', '[해결] ', '[링크] 제목||URL'
export type LogKind = '업데이트' | '이슈' | '해결'
export const LOG_KINDS: LogKind[] = ['업데이트', '이슈', '해결']

export type ParsedLog =
  | { kind: LogKind; body: string }
  | { kind: '링크'; label: string; href: string }

export function parseLog(content: string | null | undefined): ParsedLog {
  const c = content ?? ''
  if (c.startsWith('[링크] ')) {
    const raw = c.slice('[링크] '.length)
    const [label, href] = raw.split('||')
    return { kind: '링크', label: label ?? raw, href: href ?? label ?? raw }
  }
  if (c.startsWith('[이슈] ')) return { kind: '이슈', body: c.slice('[이슈] '.length) }
  if (c.startsWith('[해결] ')) return { kind: '해결', body: c.slice('[해결] '.length) }
  return { kind: '업데이트', body: c }
}

export const logContent = (kind: LogKind, text: string) =>
  (kind === '이슈' ? '[이슈] ' : kind === '해결' ? '[해결] ' : '') + text.trim()

export const linkLogContent = (url: string, label: string) => {
  const u = url.trim(), l = label.trim()
  return `[링크] ${l || u}||${u}`
}

/** 진행 사항 본문의 한 줄: 들여쓰기 단계(공백 2칸 = 1단계)와 글머리표 여부 */
export function logLines(text: string): { level: number; bullet: boolean; text: string; blank: boolean }[] {
  const levelOf = (ws: string) => Math.floor(ws.replace(/\t/g, '  ').length / 2)
  return String(text ?? '').split('\n').map(line => {
    const b = line.match(/^(\s*)[-*•]\s+(.*)$/)
    if (b) return { level: levelOf(b[1]), bullet: true, text: b[2], blank: false }
    if (line.trim() === '') return { level: 0, bullet: false, text: '', blank: true }
    const p = line.match(/^(\s*)(.*)$/)
    return { level: levelOf(p?.[1] ?? ''), bullet: false, text: p?.[2] ?? '', blank: false }
  })
}

// ─── 진행 사항 입력창 키 처리 (1.0 handleCommentKey 와 같은 규칙) ─────
// Ctrl/Cmd+Enter = 추가, 줄 시작의 '- '·'* ' = 글머리표(•), 글머리 줄에서 Enter = 다음 줄도 글머리,
// 빈 글머리 줄에서 Enter = 글머리 빠져나가기, Tab/Shift+Tab = 들여쓰기 증감(공백 2칸)
export type EditorResult = { kind: 'submit' } | { kind: 'edit'; value: string; start: number; end: number } | null
const INDENT = '  '

export function editorKey(value: string, s: number, e: number, key: string, mods: { shift: boolean; ctrl: boolean }): EditorResult {
  if (key === 'Enter' && mods.ctrl) return { kind: 'submit' }
  const lineStart = value.lastIndexOf('\n', s - 1) + 1

  if (key === ' ' && s === e) {
    const m = value.slice(lineStart, s).match(/^(\s*)([-*])$/)
    if (m) {
      const rep = m[1] + '• '
      return { kind: 'edit', value: value.slice(0, lineStart) + rep + value.slice(s), start: lineStart + rep.length, end: lineStart + rep.length }
    }
    return null
  }

  if (key === 'Enter' && !mods.shift) {
    const m = value.slice(lineStart, s).match(/^(\s*)([-*•]\s)(.*)$/)
    if (!m) return null
    if (m[3].trim() === '') return { kind: 'edit', value: value.slice(0, lineStart) + value.slice(s), start: lineStart, end: lineStart }
    const ins = '\n' + m[1] + m[2]
    return { kind: 'edit', value: value.slice(0, s) + ins + value.slice(e), start: s + ins.length, end: s + ins.length }
  }

  if (key === 'Tab') {
    const block = value.slice(lineStart, e)
    if (mods.shift) {
      let first = 0, total = 0
      const nb = block.split('\n').map((line, i) => {
        const cut = line.startsWith(INDENT) ? INDENT.length : (line.match(/^\s{1,2}/)?.[0].length ?? 0)
        if (i === 0) first = cut
        total += cut
        return line.slice(cut)
      }).join('\n')
      return { kind: 'edit', value: value.slice(0, lineStart) + nb + value.slice(e), start: Math.max(lineStart, s - first), end: e - total }
    }
    if (s === e) return { kind: 'edit', value: value.slice(0, lineStart) + INDENT + value.slice(lineStart), start: s + INDENT.length, end: s + INDENT.length }
    const nb = block.split('\n').map(line => INDENT + line).join('\n')
    return { kind: 'edit', value: value.slice(0, lineStart) + nb + value.slice(e), start: s + INDENT.length, end: e + (nb.length - block.length) }
  }
  return null
}

/** 주소의 ?new=1&branch=&title= 을 새 수행과제 입력의 첫 값으로. 지점은 네 지점 중 하나일 때만 받는다 */
export function prefillFrom(sp: { new?: string; branch?: string; title?: string }, branches: readonly string[]): { branch: string; title: string } | null {
  if (sp.new !== '1') return null
  return { branch: sp.branch && branches.includes(sp.branch) ? sp.branch : '', title: (sp.title ?? '').trim() }
}
