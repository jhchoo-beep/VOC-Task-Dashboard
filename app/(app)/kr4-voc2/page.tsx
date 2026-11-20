// 🔴 라우트 캐시를 걸지 않는다 — 분석 결과가 DB에 직접 쓰이므로 revalidate 가 호출되지 않는다(app/(app)/kr4-weekly 와 같은 이유).
export const dynamic = 'force-dynamic'

import { getKr4v2Props } from '@/lib/kr4v2Data'
import { getKr4Props } from '@/lib/kr4Data'
import Kr4Voc2Client from '@/components/Kr4Voc2Client'

export default async function Kr4Voc2Page() {
  const [props, kr4] = await Promise.all([getKr4v2Props(), getKr4Props()])
  return <Kr4Voc2Client {...props} kr4={kr4} />
}
