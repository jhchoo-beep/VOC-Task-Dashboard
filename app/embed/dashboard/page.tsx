export const revalidate = 60

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
