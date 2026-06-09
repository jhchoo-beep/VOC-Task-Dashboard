export const revalidate = 60

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
