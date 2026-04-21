export const revalidate = 60 // 60초 캐시

import { supabase } from '@/lib/supabase'
import ReviewsClient from '@/components/ReviewsClient'

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ month?: string; branch?: string; severity?: string; review?: string }> }) {
  const { month, branch, severity, review } = await searchParams

  const { data: all = [] } = await supabase.from('reviews').select('review_month').order('review_month', { ascending: false })
  const months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))] as string[]
  const currentMonth = month ?? months[0] ?? ''

  let q = supabase.from('reviews').select('*')
  if (currentMonth) q = q.eq('review_month', currentMonth)
  if (branch) q = q.eq('branch', branch)
  if (severity) q = q.eq('severity', severity)
  q = q.order('severity', { ascending: true }).order('rating', { ascending: true })

  const { data: reviews = [] } = await q

  // 수행과제-리뷰 연결 맵 빌드
  const { data: linkedTasks = [] } = await supabase
    .from('tasks')
    .select('id, title, task_month, status, linked_review_ids')
    .not('linked_review_ids', 'is', null)

  const reviewTaskMap: Record<string, { id: string; title: string; task_month: string; status: string }[]> = {}
  for (const task of linkedTasks ?? []) {
    for (const rid of task.linked_review_ids ?? []) {
      if (!reviewTaskMap[rid]) reviewTaskMap[rid] = []
      reviewTaskMap[rid].push({ id: task.id, title: task.title, task_month: task.task_month, status: task.status })
    }
  }

  return <ReviewsClient reviews={reviews ?? []} months={months} currentMonth={currentMonth} reviewTaskMap={reviewTaskMap} highlightReviewId={review ?? null} />
}
