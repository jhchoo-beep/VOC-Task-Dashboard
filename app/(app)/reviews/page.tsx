export const revalidate = 60 // 60초 캐시

import { supabase } from '@/lib/supabase'
import ReviewsClient from '@/components/ReviewsClient'

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ month?: string; branch?: string; severity?: string }> }) {
  const { month, branch, severity } = await searchParams

  const { data: all = [] } = await supabase.from('reviews').select('review_month').order('review_month', { ascending: false })
  const months = [...new Set((all ?? []).map((r: any) => r.review_month).filter(Boolean))] as string[]
  const currentMonth = month ?? months[0] ?? ''

  let q = supabase.from('reviews').select('*')
  if (currentMonth) q = q.eq('review_month', currentMonth)
  if (branch) q = q.eq('branch', branch)
  if (severity) q = q.eq('severity', severity)
  q = q.order('severity', { ascending: true }).order('rating', { ascending: true })

  const { data: reviews = [] } = await q

  return <ReviewsClient reviews={reviews ?? []} months={months} currentMonth={currentMonth} />
}
