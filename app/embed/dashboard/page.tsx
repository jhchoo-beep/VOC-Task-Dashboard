// 🔴 라우트 캐시를 걸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
export const dynamic = 'force-dynamic'

import { getDashboardProps } from '@/lib/pageData'
import DashboardClient from '@/components/DashboardClient'

export default async function EmbedDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const props = await getDashboardProps(month)
  return <DashboardClient {...props} embed />
}
