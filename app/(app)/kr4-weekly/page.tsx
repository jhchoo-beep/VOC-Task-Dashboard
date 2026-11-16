// 🔴 라우트 캐시를 걸지 않는다 — 주간 러너가 DB에 직접 쓰므로 revalidate 가 호출되지 않는다(lib/pageData.ts 상단 주석과 같은 이유).
export const dynamic = 'force-dynamic'

import { getKr4Props } from '@/lib/kr4Data'
import Kr4WeeklyClient from '@/components/Kr4WeeklyClient'

export default async function Kr4WeeklyPage() {
  const props = await getKr4Props()
  return <Kr4WeeklyClient {...props} />
}
