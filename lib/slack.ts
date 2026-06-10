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
  const { type, body } = parseLogType(content)
  return [
    `[수행과제 새 댓글] ${branch} · ${taskTitle}`,
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
