// 🔴 라우트 캐시를 걸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
export const dynamic = 'force-dynamic'

import { getAnalyticsProps } from '@/lib/pageData'
import AnalyticsClient from '@/components/AnalyticsClient'

export default async function AnalyticsPage() {
  const props = await getAnalyticsProps()
  return <AnalyticsClient {...props} />
}
