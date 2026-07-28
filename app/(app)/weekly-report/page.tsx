export const revalidate = 300

import { getWeeklyReportProps, getWeeklyTasks } from '@/lib/pageData'
import WeeklyReportClient from '@/components/WeeklyReportClient'

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const props = await getWeeklyReportProps(week)
  // 요청한 주가 아니라 리포트가 실제로 고른 주로 조회한다 — week 미지정이면 최신 주다.
  const weeklyTasks = await getWeeklyTasks(props.week)
  return <WeeklyReportClient {...props} weeklyTasks={weeklyTasks} basePath="/weekly-report" />
}
