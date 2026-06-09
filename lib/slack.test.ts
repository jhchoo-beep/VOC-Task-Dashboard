import { describe, it, expect } from 'vitest'
import { resolveBranchTarget, formatCommentForSlack } from './slack'

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
