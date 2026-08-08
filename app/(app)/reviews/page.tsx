import { supabase } from '@/lib/supabase'
import ReviewsClient from '@/components/ReviewsClient'

// 🔴 unstable_cache로 감싸지 않는다 — 근거는 lib/pageData.ts 상단 주석 참조.
const getReviewsPageData = async (month?: string, branch?: string, severity?: string) => {
  function buildReviewsQuery(m: string) {
    let q = supabase.from('reviews').select('*')
    if (m) q = q.eq('review_month', m)
    if (branch) q = q.eq('branch', branch)
    if (severity) q = q.eq('severity', severity)
    return q.order('severity', { ascending: true }).order('rating', { ascending: true })
  }

  const monthsQuery = supabase.from('reviews').select('review_month').order('review_month', { ascending: false }).range(0, 9999)
  const linkedTasksQuery = supabase
    .from('tasks')
    .select('id, title, task_month, status, linked_review_ids')
    .not('linked_review_ids', 'is', null)

  let months: string[]
  let currentMonth: string
  let reviews: any[]
  let linkedTasksData: any[]

  if (month) {
    // month가 URL에 있으면 3개 쿼리 모두 병렬 실행
    const [{ data: all }, { data: reviewsData }, { data: lt }] = await Promise.all([
      monthsQuery,
      buildReviewsQuery(month),
      linkedTasksQuery,
    ])
    months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))] as string[]
    currentMonth = month
    reviews = reviewsData ?? []
    linkedTasksData = lt ?? []
  } else {
    // month 미지정: months + linkedTasks 병렬, 이후 reviews
    const [{ data: all }, { data: lt }] = await Promise.all([monthsQuery, linkedTasksQuery])
    months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))] as string[]
    currentMonth = months[0] ?? ''
    const { data: reviewsData } = await buildReviewsQuery(currentMonth)
    reviews = reviewsData ?? []
    linkedTasksData = lt ?? []
  }

  const reviewTaskMap: Record<string, { id: string; title: string; task_month: string; status: string }[]> = {}
  for (const task of linkedTasksData) {
    for (const rid of task.linked_review_ids ?? []) {
      if (!reviewTaskMap[rid]) reviewTaskMap[rid] = []
      reviewTaskMap[rid].push({ id: task.id, title: task.title, task_month: task.task_month, status: task.status })
    }
  }

  return { reviews, months, currentMonth, reviewTaskMap }
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; branch?: string; severity?: string; review?: string }>
}) {
  const { month, branch, severity, review } = await searchParams
  const { reviews, months, currentMonth, reviewTaskMap } = await getReviewsPageData(month, branch, severity)

  return (
    <ReviewsClient
      reviews={reviews}
      months={months}
      currentMonth={currentMonth}
      reviewTaskMap={reviewTaskMap}
      highlightReviewId={review ?? null}
    />
  )
}
