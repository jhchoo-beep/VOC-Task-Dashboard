// 🔴 라우트 캐시를 걸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
export const dynamic = 'force-dynamic'

import { getOtaScoresProps } from '@/lib/pageData'
import OtaScoresClient from '@/components/OtaScoresClient'

export default async function OtaScoresPage() {
  const props = await getOtaScoresProps()
  return <OtaScoresClient {...props} />
}
