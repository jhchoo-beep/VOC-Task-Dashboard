import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveBranchTarget, formatCommentForSlack, buildTaskDeepLink, buildSlackText } from './slack'

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
