// 🔴 라우트 캐시를 걸지 않는다 — 노션 임베드는 늘 같은 URL로 열리고, 주간 러너가 DB에 직접 쓰므로
//    revalidate 가 호출되지 않는다. 캐시가 붙으면 회의 참석자 전원이 낡은 화면을 본다(app/(app)/kr4-weekly 와 같은 이유).
export const dynamic = 'force-dynamic'

import { getKr4Props } from '@/lib/kr4Data'
import Kr4WeeklyClient from '@/components/Kr4WeeklyClient'

// 임베드는 사이드바·인증이 없는 레이아웃(app/embed/layout.tsx)에서 렌더된다. 접근 통제는 middleware의 ?key= 토큰 게이트.
// KR4 화면은 읽기 전용이고 링크 이동이 없어 실페이지 컴포넌트를 그대로 쓴다.
export default async function EmbedKr4WeeklyPage() {
  const props = await getKr4Props()
  return <Kr4WeeklyClient {...props} />
}
