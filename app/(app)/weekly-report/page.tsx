// 🔴 revalidate(=라우트 캐시)를 걸지 않는다. 이 화면은 FO Weekly 회의에서 실시간으로 읽는다 —
//    낡은 주가 뜨면 회의가 한 주 전을 논의한다(2026-08-08 실측). 근거는 lib/pageData.ts의
//    getWeeklyReportProps 주석 참조.
export const dynamic = 'force-dynamic'

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
