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
