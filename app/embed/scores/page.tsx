// 🔴 revalidate를 걸면 이 라우트는 searchParams를 안 읽어 **빌드 시점에 통째로 정적 생성**된다
//    (빌드 출력의 ○). 노션 임베드는 늘 같은 URL로 열리므로 회의 참석자 전원이 배포 시점의
//    화면을 본다. 근거는 lib/pageData.ts 상단 주석 참조.
export const dynamic = 'force-dynamic'

import { getOtaScoresProps } from '@/lib/pageData'
import OtaScoresClient from '@/components/OtaScoresClient'

export default async function EmbedScoresPage() {
  const props = await getOtaScoresProps()
  return <OtaScoresClient {...props} />
}
