// 🔴 라우트 캐시를 걸지 않는다 — 노션 임베드는 늘 같은 URL로 열리고 분석 결과가 DB에 직접 쓰인다.
export const dynamic = 'force-dynamic'

import { getKr4v2Props } from '@/lib/kr4v2Data'
import { getKr4Props } from '@/lib/kr4Data'
import Kr4Voc2Client from '@/components/Kr4Voc2Client'

// 임베드는 사이드바·인증이 없는 레이아웃(app/embed/layout.tsx). 접근 통제는 middleware의 ?key= 토큰 게이트.
export default async function EmbedKr4Voc2Page() {
  const [props, kr4] = await Promise.all([getKr4v2Props(), getKr4Props()])
  return <Kr4Voc2Client {...props} kr4={kr4} />
}
