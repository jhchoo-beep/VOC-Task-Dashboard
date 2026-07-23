export const revalidate = 300

import { getWeeklyReportProps } from '@/lib/pageData'
import WeeklyReportClient from '@/components/WeeklyReportClient'

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const props = await getWeeklyReportProps(week)
  return <WeeklyReportClient {...props} basePath="/weekly-report" />
}
