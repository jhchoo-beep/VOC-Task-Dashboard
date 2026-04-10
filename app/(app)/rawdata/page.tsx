export const revalidate = 60

import { supabase } from '@/lib/supabase'
import RawDataClient from '@/components/RawDataClient'

export default async function RawDataPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams

  const { data: rawReviews = [] } = await supabase
    .from('raw_reviews')
    .select('*')
    .order('review_month', { ascending: false })
    .order('rating')

  const months = [...new Set((rawReviews ?? []).map((r: any) => r.review_month).filter(Boolean))].sort().reverse() as string[]
  const currentMonth = month ?? months[0] ?? ''

  const filtered = currentMonth
    ? (rawReviews ?? []).filter((r: any) => r.review_month === currentMonth)
    : (rawReviews ?? [])

  return <RawDataClient rawReviews={filtered} months={months} currentMonth={currentMonth} />
}
