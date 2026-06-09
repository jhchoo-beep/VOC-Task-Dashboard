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
