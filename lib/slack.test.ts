import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveBranchTarget, formatCommentForSlack, buildTaskDeepLink, buildSlackText, parseLogType, formatMonthLabel } from './slack'

describe('resolveBranchTarget', () => {
  it('신설을 ssd 스쿼드 채널/유저그룹으로 매핑한다', () => {
    expect(resolveBranchTarget('신설')).toEqual({
      channel: 'C028UUVJ0FL',
      usergroup: 'S0ABTJP3GEQ',
    })
  })

  it('동대문/고성/제주시티도 매핑한다', () => {
    expect(resolveBranchTarget('동대문')?.usergroup).toBe('S0ABQ11JG9G')
    expect(resolveBranchTarget('고성')?.channel).toBe('C047VLS9QMP')
    expect(resolveBranchTarget('제주시티')?.usergroup).toBe('S07R8QSFCDD')
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

describe('parseLogType', () => {
  it('접두사 없으면 업데이트', () => {
    expect(parseLogType('시안 공유드립니다')).toEqual({ type: '업데이트', body: '시안 공유드립니다' })
  })
  it('[이슈] 접두사를 이슈로 파싱하고 본문을 분리한다', () => {
    expect(parseLogType('[이슈] 사인 누락됨')).toEqual({ type: '이슈', body: '사인 누락됨' })
  })
  it('[해결] 접두사를 해결로 파싱하고 본문을 분리한다', () => {
    expect(parseLogType('[해결] 사인 부착 완료')).toEqual({ type: '해결', body: '사인 부착 완료' })
  })
})

describe('formatMonthLabel', () => {
  it("'YYYY-MM'을 'N월'로 변환한다(앞 0 제거)", () => {
    expect(formatMonthLabel('2026-04')).toBe('4월')
    expect(formatMonthLabel('2026-11')).toBe('11월')
  })

  it('형식이 아니면 빈 문자열을 반환한다', () => {
    expect(formatMonthLabel('')).toBe('')
    expect(formatMonthLabel('2026')).toBe('')
  })
})

describe('buildSlackText', () => {
  it('taskMonth가 없으면 제목에 월 표시를 넣지 않는다', () => {
    const text = buildSlackText({
      branch: '신설', taskTitle: '체크인 동선 개선', taskMonth: '',
      usergroup: 'ssdsquad', author: '추재헌', content: '내용',
      link: 'https://x/tasks?task=t1',
    })
    expect(text).toContain('*[수행과제 새 댓글] 신설 · 체크인 동선 개선*')
    expect(text).not.toContain('()')
  })

  it('지점/제목/멘션/작성자·유형/내용(볼드)/딥링크를 포함한다', () => {
    const text = buildSlackText({
      branch: '신설',
      taskTitle: '체크인 동선 개선',
      taskMonth: '2026-04',
      usergroup: 'ssdsquad',
      author: '추재헌',
      content: '시안 공유드립니다',
      link: 'https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-06',
    })
    expect(text).toContain('*[수행과제 새 댓글] 신설 · (4월) 체크인 동선 개선*')
    expect(text).toContain('<!subteam^ssdsquad>')
    expect(text).toContain('작성자: 추재헌 · 유형: 업데이트')
    expect(text).toContain('내용: *시안 공유드립니다*')
    expect(text).toContain('<https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-06|대시보드에서 보기>')
  })

  it('이슈 댓글이면 유형: 이슈로 표시하고 접두사를 본문에서 제거한다', () => {
    const text = buildSlackText({
      branch: '동대문', taskTitle: '야간 매너', taskMonth: '2026-05', usergroup: 'ddmsquad',
      author: '추재헌', content: '[이슈] 표지 분실',
      link: 'https://x/tasks?task=t1',
    })
    expect(text).toContain('*[수행과제 새 댓글] 동대문 · (5월) 야간 매너*')
    expect(text).toContain('유형: 이슈')
    expect(text).toContain('내용: *표지 분실*')
    expect(text).not.toContain('[이슈]')
  })
})

import { buildNewTaskText, notifyNewTask } from './slack'

describe('buildNewTaskText', () => {
  const base = {
    branch: '고성', taskTitle: '도어클로저 교체', taskMonth: '2026-04',
    usergroup: 'S06LG96FGMB', severity: 'High', assignee: '정해선',
    dueDate: '2026-04-30', churnTrigger: ['소음', '시설노후'],
    link: 'https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-04',
  }

  it('제목·월·멘션·심각도·담당·기한·트리거·딥링크를 포함한다', () => {
    const text = buildNewTaskText(base)
    expect(text).toContain('*[신규 수행과제 등록] 고성 · (4월) 도어클로저 교체*')
    expect(text).toContain('<!subteam^S06LG96FGMB>')
    expect(text).toContain('심각도: High · 담당: 정해선 · 기한: 2026-04-30')
    expect(text).toContain('변심 트리거: 소음, 시설노후')
    expect(text).toContain('<https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-04|대시보드에서 보기>')
  })

  it('담당·기한·트리거가 없으면 해당 줄/항목을 생략한다', () => {
    const text = buildNewTaskText({
      ...base, assignee: null, dueDate: '', churnTrigger: [],
    })
    expect(text).toContain('심각도: High')
    expect(text).not.toContain('담당:')
    expect(text).not.toContain('기한:')
    expect(text).not.toContain('변심 트리거:')
  })
})

import { buildTaskDoneText, notifyTaskDone } from './slack'

describe('buildTaskDoneText', () => {
  const base = {
    branch: '고성', taskTitle: '도어클로저 교체', taskMonth: '2026-04',
    usergroup: 'S06LG96FGMB', assignee: '정해선',
    doneMemo: '신규 도어클로저 교체 완료 — 소음 민원 해소',
    link: 'https://voc-task-dashboard.vercel.app/tasks?task=t1&month=2026-04',
  }

  it('완료 제목(축하)·멘션·담당·완료메모·딥링크를 포함한다', () => {
    const text = buildTaskDoneText(base)
    expect(text).toContain('*[수행과제 완료] 고성 · (4월) 도어클로저 교체 🎉*')
    expect(text).toContain('<!subteam^S06LG96FGMB>')
    expect(text).toContain('담당: 정해선 · 수고하셨습니다!')
    expect(text).toContain('완료 메모: 신규 도어클로저 교체 완료 — 소음 민원 해소')
    expect(text).toContain('|대시보드에서 보기>')
  })

  it('담당·완료메모가 없으면 해당 줄을 생략한다', () => {
    const text = buildTaskDoneText({ ...base, assignee: null, doneMemo: '' })
    expect(text).toContain('수고하셨습니다!')
    expect(text).not.toContain('담당:')
    expect(text).not.toContain('완료 메모:')
  })
})

import { notifyNewComment } from './slack'

describe('notifyTaskDone', () => {
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

  it('매핑된 지점이면 해당 채널로 완료 알림을 보낸다', async () => {
    await notifyTaskDone({
      branch: '동대문', taskId: 't7', taskTitle: '야간 소음 대응',
      taskMonth: '2026-05', assignee: '추재헌', doneMemo: '안내문 부착 완료',
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.channel).toBe('C047LG1EV0C')
    expect(body.text).toContain('*[수행과제 완료] 동대문 · (5월) 야간 소음 대응 🎉*')
    expect(body.text).toContain('<!subteam^S0ABQ11JG9G>')
  })

  it('매핑에 없는 지점이면 발송하지 않는다', async () => {
    await notifyTaskDone({
      branch: '없는지점', taskId: 't7', taskTitle: 'x', taskMonth: '2026-05',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('notifyNewTask', () => {
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

  it('매핑된 지점이면 해당 채널로 신규 과제 알림을 보낸다', async () => {
    await notifyNewTask({
      branch: '제주시티', taskId: 't9', taskTitle: '공기질 개선',
      taskMonth: '2026-05', severity: 'Critical', assignee: '정해선',
      dueDate: '2026-05-20', churnTrigger: ['냄새'],
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [, opts] = (fetch as any).mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.channel).toBe('C07HSELN5S9')
    expect(body.text).toContain('*[신규 수행과제 등록] 제주시티 · (5월) 공기질 개선*')
    expect(body.text).toContain('<!subteam^S07R8QSFCDD>')
  })

  it('매핑에 없는 지점이면 발송하지 않는다', async () => {
    await notifyNewTask({
      branch: '없는지점', taskId: 't9', taskTitle: 'x',
      taskMonth: '2026-05', severity: 'High',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

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
    expect(body.channel).toBe('C028UUVJ0FL')
    expect(body.text).toContain('<!subteam^S0ABTJP3GEQ>')
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

// 진행사항 알림을 등록 알림의 스레드에 묶는다 — 매번 새 스레드가 생기는 노이즈를 없애기 위한 기능.
// 불변식: slack_thread_ts가 있는 과제의 후속 알림은 채널에 새 최상위 메시지를 만들지 않는다.
describe('등록 스레드에 후속 알림 묶기', () => {
  const okRes = (ts = '1788177972.875829') => ({ ok: true, json: async () => ({ ok: true, ts }) })
  const bodyOf = (call: number) => JSON.parse((fetch as any).mock.calls[call][1].body)

  const comment = {
    branch: '신설', taskId: 't1', taskTitle: '요청사항 배정 기준',
    taskMonth: '2026-08', author: '추재헌', content: '1차 목록 정리 완료',
  }

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SLACK_BOT_TOKEN
  })

  it('notifyNewTask는 발송한 메시지의 ts를 반환한다(스레드 앵커로 저장할 값)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes('1700000000.000100')))
    const ts = await notifyNewTask({
      branch: '신설', taskId: 't1', taskTitle: '요청사항 배정 기준',
      taskMonth: '2026-08', severity: 'High',
    })
    expect(ts).toBe('1700000000.000100')
  })

  it('등록 알림 자체는 최상위 메시지로 나간다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes()))
    await notifyNewTask({
      branch: '신설', taskId: 't1', taskTitle: 'x', taskMonth: '2026-08', severity: 'High',
    })
    expect(bodyOf(0).thread_ts).toBeUndefined()
  })

  it('threadTs가 있으면 댓글 알림을 그 스레드의 답글로 보내고 채널에도 함께 띄운다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes()))
    await notifyNewComment({ ...comment, threadTs: '1788177972.875829' })

    expect(fetch).toHaveBeenCalledTimes(1)
    const body = bodyOf(0)
    expect(body.channel).toBe('C028UUVJ0FL')
    expect(body.thread_ts).toBe('1788177972.875829')
    expect(body.reply_broadcast).toBe(true)
  })

  it('threadTs가 없으면(기능 이전 등록분) 기존처럼 최상위 메시지로 보낸다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes()))
    await notifyNewComment({ ...comment, threadTs: null })

    const body = bodyOf(0)
    expect(body.thread_ts).toBeUndefined()
    expect(body.reply_broadcast).toBeUndefined()
  })

  it('스레드가 사라져 답글이 실패하면 최상위 메시지로 폴백해 알림을 잃지 않는다', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error: 'thread_not_found' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ts: '1700000000.000200' }) })
    vi.stubGlobal('fetch', fetchMock)

    await notifyNewComment({ ...comment, threadTs: '1788177972.875829' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodyOf(0).thread_ts).toBe('1788177972.875829')
    expect(bodyOf(1).thread_ts).toBeUndefined()
    expect(bodyOf(1).text).toContain('1차 목록 정리 완료')
  })

  it('최상위 발송이 실패하면 재시도하지 않는다', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: false, error: 'channel_not_found' }) }))
    vi.stubGlobal('fetch', fetchMock)

    await notifyNewComment({ ...comment, threadTs: null })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('완료 알림도 같은 등록 스레드에 묶인다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okRes()))
    await notifyTaskDone({
      branch: '동대문', taskId: 't2', taskTitle: '린넨 취급 기준',
      taskMonth: '2026-08', assignee: null, doneMemo: null,
      threadTs: '1788177973.610479',
    })

    const body = bodyOf(0)
    expect(body.thread_ts).toBe('1788177973.610479')
    expect(body.reply_broadcast).toBe(true)
  })
})
