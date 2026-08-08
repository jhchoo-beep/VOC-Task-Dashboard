// 🔴 revalidate(=라우트 캐시)를 걸지 않는다. 노션 임베드는 항상 같은 URL로 열리므로
//    라우트 캐시가 붙으면 회의 참석자 전원이 같은 낡은 화면을 본다. 실페이지보다 더 나쁘다.
//    근거는 lib/pageData.ts의 getWeeklyReportProps 주석 참조.
export const dynamic = 'force-dynamic'

import { getWeeklyReportProps, getWeeklyTasks } from '@/lib/pageData'
import WeeklyReportClient from '@/components/WeeklyReportClient'

// 임베드는 사이드바·인증이 없는 레이아웃(app/embed/layout.tsx)에서 렌더된다.
// 접근 통제는 middleware의 ?key= 토큰 게이트다 — 주를 이동해도 key가 사라지면
// 다음 주 페이지가 403이 되므로, 이동 링크에 key를 그대로 실어 보낸다.
export default async function EmbedWeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; key?: string }>
}) {
  const { week, key } = await searchParams
  const props = await getWeeklyReportProps(week)
  const weeklyTasks = await getWeeklyTasks(props.week)
  return (
    <WeeklyReportClient
      {...props}
      weeklyTasks={weeklyTasks}
      embed
      basePath="/embed/weekly-report"
      extraQuery={key ? `key=${encodeURIComponent(key)}` : ''}
    />
  )
}
