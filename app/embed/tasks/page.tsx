// 🔴 라우트 캐시를 걸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
export const dynamic = 'force-dynamic'

import { getTasksProps } from '@/lib/pageData'
import TasksClient from '@/components/TasksClient'

export default async function EmbedTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; task?: string }>
}) {
  const { month, task } = await searchParams
  const props = await getTasksProps(month, task)
  return <TasksClient {...props} embed />
}
