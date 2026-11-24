import { describe, expect, it } from 'vitest'
import {
  countTasks, editorKey, filterTasks, groupByTrigger, linkLogContent, logContent, logLines, parseLog, prefillFrom, sortTasks, type Task,
} from './tasks'

const task = (id: string, o: Partial<Task> = {}): Task => ({
  id, branch: '신설', task_month: '2026-10', title: `과제 ${id}`, severity: 'High', churn_trigger: [], problem_definition: null,
  solution: null, review_content: null, category: [], assignee: null, due_date: null, status: '시작전', linked_review_ids: [],
  link_url: null, link_label: null, priority_score: 0, ...o,
})

describe('groupByTrigger', () => {
  it('트리거 N개에 속한 과제는 N묶음에 모두 들어가고, 트리거가 없으면 미분류', () => {
    const g = groupByTrigger([task('a', { churn_trigger: ['청결', '소음'] }), task('b', { churn_trigger: ['청결'] }), task('c')])
    expect(g.map(x => x.trigger)).toEqual(['청결', '소음', '미분류'])
    expect(g[0].tasks.map(t => t.id)).toEqual(['a', 'b'])
    expect(g[1].tasks.map(t => t.id)).toEqual(['a'])
    expect(g[2].tasks.map(t => t.id)).toEqual(['c'])
  })
  it('묶음 순서: 미분류 맨 끝, 전부 보류는 뒤로, 진행중 많은 순, 안 끝난 과제 많은 순', () => {
    const g = groupByTrigger([
      task('h', { churn_trigger: ['보류만'], status: '보류' }),
      task('u', { status: '진행중' }),
      task('d1', { churn_trigger: ['끝남'], status: '완료' }),
      task('o1', { churn_trigger: ['열림'], status: '시작전' }),
      task('o2', { churn_trigger: ['열림'], status: '시작전' }),
      task('p', { churn_trigger: ['진행'], status: '진행중' }),
    ])
    expect(g.map(x => x.trigger)).toEqual(['진행', '열림', '끝남', '보류만', '미분류'])
  })
  it('묶음 안: 진행중 → 시작전 → 완료 → 보류, 같으면 심각도', () => {
    const g = groupByTrigger([
      task('done', { churn_trigger: ['x'], status: '완료' }),
      task('hold', { churn_trigger: ['x'], status: '보류' }),
      task('todoLow', { churn_trigger: ['x'], status: '시작전', severity: 'Low' }),
      task('todoCrit', { churn_trigger: ['x'], status: '시작전', severity: 'Critical' }),
      task('doing', { churn_trigger: ['x'], status: '진행중' }),
    ])
    expect(g[0].tasks.map(t => t.id)).toEqual(['doing', 'todoCrit', 'todoLow', 'done', 'hold'])
  })
})

describe('정렬·거르기·세기', () => {
  it('목록은 심각도 → priority_score 큰 순', () => {
    const s = sortTasks([task('a', { severity: 'Low' }), task('b', { severity: 'Critical', priority_score: 1 }), task('c', { severity: 'Critical', priority_score: 5 })])
    expect(s.map(t => t.id)).toEqual(['c', 'b', 'a'])
  })
  it('지점·상태·검색어(제목, 담당, 트리거, 카테고리 등)로 거른다', () => {
    const ts = [
      task('a', { branch: '신설', assignee: '전희재' }),
      task('b', { branch: '동대문', churn_trigger: ['출입 QR'] }),
      task('c', { branch: '동대문', status: '완료', category: ['청결'] }),
    ]
    expect(filterTasks(ts, { branch: '동대문', status: '전체', q: '' }).map(t => t.id)).toEqual(['b', 'c'])
    expect(filterTasks(ts, { branch: '전체', status: '완료', q: '' }).map(t => t.id)).toEqual(['c'])
    expect(filterTasks(ts, { branch: '전체', status: '전체', q: 'qr' }).map(t => t.id)).toEqual(['b'])
    expect(filterTasks(ts, { branch: '전체', status: '전체', q: '희재' }).map(t => t.id)).toEqual(['a'])
    expect(filterTasks(ts, { branch: '전체', status: '전체', q: '청결' }).map(t => t.id)).toEqual(['c'])
  })
  it('완료율 = 완료 ÷ 전체, 과제가 없으면 null', () => {
    const c = countTasks([task('a', { status: '완료' }), task('b', { status: '진행중' }), task('c', { status: '보류' })])
    expect(c).toMatchObject({ total: 3, done: 1, pct: 33, byStatus: { 시작전: 0, 진행중: 1, 완료: 1, 보류: 1 } })
    expect(countTasks([]).pct).toBeNull()
  })
})

describe('진행 사항 접두사', () => {
  it('업데이트·이슈·해결·링크를 1.0 과 같은 접두사로 읽고 쓴다', () => {
    expect(logContent('이슈', ' 누수 재발 ')).toBe('[이슈] 누수 재발')
    expect(logContent('업데이트', '점검')).toBe('점검')
    expect(parseLog('[해결] 교체 완료')).toEqual({ kind: '해결', body: '교체 완료' })
    expect(parseLog('그냥 글')).toEqual({ kind: '업데이트', body: '그냥 글' })
    expect(linkLogContent('https://a.b', '')).toBe('[링크] https://a.b||https://a.b')
    expect(parseLog(linkLogContent('https://a.b', '체크리스트'))).toEqual({ kind: '링크', label: '체크리스트', href: 'https://a.b' })
  })
  it('본문 줄: 글머리표와 들여쓰기(공백 2칸 = 1단계)', () => {
    expect(logLines('첫 줄\n- 하나\n    • 둘\n\n  셋')).toEqual([
      { level: 0, bullet: false, text: '첫 줄', blank: false },
      { level: 0, bullet: true, text: '하나', blank: false },
      { level: 2, bullet: true, text: '둘', blank: false },
      { level: 0, bullet: false, text: '', blank: true },
      { level: 1, bullet: false, text: '셋', blank: false },
    ])
  })
})

describe('입력창 키', () => {
  const none = { shift: false, ctrl: false }
  it('Ctrl+Enter 는 추가', () => {
    expect(editorKey('abc', 3, 3, 'Enter', { shift: false, ctrl: true })).toEqual({ kind: 'submit' })
  })
  it("줄 시작의 '- ' 는 글머리표로 바뀐다", () => {
    expect(editorKey('첫\n  -', 5, 5, ' ', none)).toEqual({ kind: 'edit', value: '첫\n  • ', start: 6, end: 6 })
    expect(editorKey('a -', 3, 3, ' ', none)).toBeNull()
  })
  it('글머리 줄에서 Enter 는 같은 들여쓰기로 이어가고, 빈 글머리에서 Enter 는 빠져나간다', () => {
    expect(editorKey('• 하나', 4, 4, 'Enter', none)).toEqual({ kind: 'edit', value: '• 하나\n• ', start: 7, end: 7 })
    expect(editorKey('• 하나\n  • ', 9, 9, 'Enter', none)).toEqual({ kind: 'edit', value: '• 하나\n', start: 5, end: 5 })
    expect(editorKey('보통 줄', 4, 4, 'Enter', none)).toBeNull()
  })
  it('Tab 은 들여쓰기, Shift+Tab 은 내어쓰기', () => {
    expect(editorKey('a\nb', 3, 3, 'Tab', none)).toEqual({ kind: 'edit', value: 'a\n  b', start: 5, end: 5 })
    expect(editorKey('a\n  b', 5, 5, 'Tab', { shift: true, ctrl: false })).toEqual({ kind: 'edit', value: 'a\nb', start: 3, end: 3 })
    expect(editorKey('x\ny', 0, 3, 'Tab', none)).toEqual({ kind: 'edit', value: '  x\n  y', start: 2, end: 7 })
  })
})

describe('prefillFrom', () => {
  const B = ['신설', '동대문', '제주시티', '고성']
  it('?new=1 일 때만, 지점은 네 지점 중 하나일 때만 받는다', () => {
    expect(prefillFrom({ new: '1', branch: '동대문', title: ' 출입 QR 번거로움 ' }, B)).toEqual({ branch: '동대문', title: '출입 QR 번거로움' })
    expect(prefillFrom({ new: '1', branch: '', title: 'x' }, B)).toEqual({ branch: '', title: 'x' })
    expect(prefillFrom({ new: '1', branch: '전체' }, B)).toEqual({ branch: '', title: '' })
    expect(prefillFrom({ branch: '신설', title: 'x' }, B)).toBeNull()
  })
})
