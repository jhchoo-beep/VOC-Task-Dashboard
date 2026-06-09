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
