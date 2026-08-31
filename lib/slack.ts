// 지점 → 슬랙 스쿼드 채널 / 유저그룹 매핑
// channel = 채널 ID(C…) 또는 이름(chat.postMessage가 이름도 해석),
// usergroup = subteam ID(S…) — <!subteam^S…> 멘션이 실제로 울리려면 ID여야 함.
// 4개 지점 모두 봇 입장·채널 ID 검증 완료(고성/제주는 private 채널, 봇 초대 완료).
export interface BranchTarget {
  channel: string
  usergroup: string
}

export const BRANCH_SLACK_MAP: Record<string, BranchTarget> = {
  '신설': { channel: 'C028UUVJ0FL', usergroup: 'S0ABTJP3GEQ' },
  '동대문': { channel: 'C047LG1EV0C', usergroup: 'S0ABQ11JG9G' },
  '고성': { channel: 'C047VLS9QMP', usergroup: 'S06LG96FGMB' },
  '제주시티': { channel: 'C07HSELN5S9', usergroup: 'S07R8QSFCDD' },
}

export function resolveBranchTarget(branch: string): BranchTarget | null {
  return BRANCH_SLACK_MAP[branch] ?? null
}

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

const APP_URL = 'https://voc-task-dashboard.vercel.app'

export function buildTaskDeepLink(taskId: string, taskMonth: string): string {
  const base = `${APP_URL}/tasks?task=${encodeURIComponent(taskId)}`
  return taskMonth ? `${base}&month=${encodeURIComponent(taskMonth)}` : base
}

// 진행사항 유형: 앱에서 댓글 작성 시 업데이트/이슈/해결을 선택하며, content 접두사로 저장됨.
// 업데이트=접두사 없음, 이슈='[이슈] ', 해결='[해결] '.
export type LogType = '업데이트' | '이슈' | '해결'

export function parseLogType(content: string): { type: LogType; body: string } {
  if (content.startsWith('[이슈] ')) return { type: '이슈', body: content.slice('[이슈] '.length) }
  if (content.startsWith('[해결] ')) return { type: '해결', body: content.slice('[해결] '.length) }
  return { type: '업데이트', body: content }
}

// 'YYYY-MM' → 'N월' (제목의 수행과제 월 표시용). 형식이 아니면 빈 문자열.
export function formatMonthLabel(taskMonth: string): string {
  const m = taskMonth.match(/^(\d{4})-(\d{2})$/)
  if (!m) return ''
  return `${parseInt(m[2], 10)}월`
}

export interface SlackTextArgs {
  branch: string
  taskTitle: string
  taskMonth: string
  usergroup: string
  author: string
  content: string
  link: string
}

export function buildSlackText(args: SlackTextArgs): string {
  const { branch, taskTitle, taskMonth, usergroup, author, content, link } = args
  const { type, body } = parseLogType(content)
  const monthLabel = formatMonthLabel(taskMonth)
  const titleTask = monthLabel ? `(${monthLabel}) ${taskTitle}` : taskTitle
  return [
    `*[수행과제 새 댓글] ${branch} · ${titleTask}*`,
    `<!subteam^${usergroup}>`,
    `작성자: ${author} · 유형: ${type}`,
    `내용: *${formatCommentForSlack(body)}*`,
    `<${link}|대시보드에서 보기>`,
  ].join('\n')
}

export interface NotifyArgs {
  branch: string
  taskId: string
  taskTitle: string
  taskMonth: string
  author: string
  content: string
  /** 등록 알림 메시지의 ts(`tasks.slack_thread_ts`). 있으면 그 스레드의 답글로 붙는다. */
  threadTs?: string | null
}

// 슬랙 채널로 텍스트 발송(공통 I/O). 토큰 없으면 조용히 스킵.
// threadTs를 주면 그 메시지의 스레드 답글로 보내고, reply_broadcast로 채널에도 함께 띄운다.
// 스레드 답글이 실패하면(원본 삭제·지점 변경으로 채널이 다름 등) 최상위 메시지로 한 번 폴백한다
// — 스레드에 묶는 것보다 알림을 잃지 않는 쪽이 우선이다.
// 반환: 발송에 성공한 메시지의 ts. 실패하면 null.
async function postToSlack(
  channel: string,
  text: string,
  threadTs?: string | null,
): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    console.warn('[slack] SLACK_BOT_TOKEN 미설정 — 알림 스킵')
    return null
  }

  const send = async (thread?: string | null) => {
    const payload: Record<string, unknown> = { channel, text }
    if (thread) {
      payload.thread_ts = thread
      payload.reply_broadcast = true
    }
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return {
      ok: !!data?.ok,
      ts: (data?.ts as string | undefined) ?? null,
      error: data?.error ?? res.status,
    }
  }

  const first = await send(threadTs)
  if (first.ok) return first.ts

  console.error('[slack] chat.postMessage 실패:', first.error)
  if (!threadTs) return null

  const retry = await send(null)
  if (!retry.ok) {
    console.error('[slack] 스레드 폴백 재발송 실패:', retry.error)
    return null
  }
  return retry.ts
}

export async function notifyNewComment(args: NotifyArgs): Promise<void> {
  const target = resolveBranchTarget(args.branch)
  if (!target) {
    console.warn(`[slack] 매핑 없는 지점 "${args.branch}" — 알림 스킵`)
    return
  }

  const text = buildSlackText({
    branch: args.branch,
    taskTitle: args.taskTitle,
    taskMonth: args.taskMonth,
    usergroup: target.usergroup,
    author: args.author,
    content: args.content,
    link: buildTaskDeepLink(args.taskId, args.taskMonth),
  })

  await postToSlack(target.channel, text, args.threadTs)
}

export interface NewTaskTextArgs {
  branch: string
  taskTitle: string
  taskMonth: string
  usergroup: string
  severity: string
  assignee?: string | null
  dueDate?: string | null
  churnTrigger?: string[] | null
  link: string
}

export function buildNewTaskText(args: NewTaskTextArgs): string {
  const { branch, taskTitle, taskMonth, usergroup, severity, assignee, dueDate, churnTrigger, link } = args
  const monthLabel = formatMonthLabel(taskMonth)
  const titleTask = monthLabel ? `(${monthLabel}) ${taskTitle}` : taskTitle

  const meta = [`심각도: ${severity || '-'}`]
  if (assignee?.trim()) meta.push(`담당: ${assignee.trim()}`)
  if (dueDate?.trim()) meta.push(`기한: ${dueDate.trim()}`)

  const lines = [
    `*[신규 수행과제 등록] ${branch} · ${titleTask}*`,
    `<!subteam^${usergroup}>`,
    meta.join(' · '),
  ]
  const triggers = (churnTrigger ?? []).filter((t) => t?.trim())
  if (triggers.length) lines.push(`변심 트리거: ${triggers.join(', ')}`)
  lines.push(`<${link}|대시보드에서 보기>`)
  return lines.join('\n')
}

export interface NotifyNewTaskArgs {
  branch: string
  taskId: string
  taskTitle: string
  taskMonth: string
  severity: string
  assignee?: string | null
  dueDate?: string | null
  churnTrigger?: string[] | null
}

// 반환한 ts를 `tasks.slack_thread_ts`에 저장해 두면, 이후 진행사항 댓글 알림이
// 새 스레드를 만들지 않고 이 메시지의 답글로 붙는다.
export async function notifyNewTask(args: NotifyNewTaskArgs): Promise<string | null> {
  const target = resolveBranchTarget(args.branch)
  if (!target) {
    console.warn(`[slack] 매핑 없는 지점 "${args.branch}" — 신규 과제 알림 스킵`)
    return null
  }

  const text = buildNewTaskText({
    branch: args.branch,
    taskTitle: args.taskTitle,
    taskMonth: args.taskMonth,
    usergroup: target.usergroup,
    severity: args.severity,
    assignee: args.assignee,
    dueDate: args.dueDate,
    churnTrigger: args.churnTrigger,
    link: buildTaskDeepLink(args.taskId, args.taskMonth),
  })

  return await postToSlack(target.channel, text)
}

export interface TaskDoneTextArgs {
  branch: string
  taskTitle: string
  taskMonth: string
  usergroup: string
  assignee?: string | null
  doneMemo?: string | null
  link: string
}

export function buildTaskDoneText(args: TaskDoneTextArgs): string {
  const { branch, taskTitle, taskMonth, usergroup, assignee, doneMemo, link } = args
  const monthLabel = formatMonthLabel(taskMonth)
  const titleTask = monthLabel ? `(${monthLabel}) ${taskTitle}` : taskTitle

  const lines = [
    `*[수행과제 완료] ${branch} · ${titleTask} 🎉*`,
    `<!subteam^${usergroup}>`,
  ]
  if (assignee?.trim()) lines.push(`담당: ${assignee.trim()} · 수고하셨습니다!`)
  else lines.push('수고하셨습니다!')
  if (doneMemo?.trim()) lines.push(`완료 메모: ${formatCommentForSlack(doneMemo)}`)
  lines.push(`<${link}|대시보드에서 보기>`)
  return lines.join('\n')
}

export interface NotifyTaskDoneArgs {
  branch: string
  taskId: string
  taskTitle: string
  taskMonth: string
  assignee?: string | null
  doneMemo?: string | null
  /** 등록 알림 메시지의 ts(`tasks.slack_thread_ts`). 있으면 그 스레드의 답글로 붙는다. */
  threadTs?: string | null
}

export async function notifyTaskDone(args: NotifyTaskDoneArgs): Promise<void> {
  const target = resolveBranchTarget(args.branch)
  if (!target) {
    console.warn(`[slack] 매핑 없는 지점 "${args.branch}" — 완료 알림 스킵`)
    return
  }

  const text = buildTaskDoneText({
    branch: args.branch,
    taskTitle: args.taskTitle,
    taskMonth: args.taskMonth,
    usergroup: target.usergroup,
    assignee: args.assignee,
    doneMemo: args.doneMemo,
    link: buildTaskDeepLink(args.taskId, args.taskMonth),
  })

  await postToSlack(target.channel, text, args.threadTs)
}
