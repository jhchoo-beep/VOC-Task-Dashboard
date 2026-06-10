export const revalidate = 60

import { supabase } from '@/lib/supabase'
import RawDataClient from '@/components/RawDataClient'

export default async function RawDataPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams

  // 월 목록만 컬럼 한정 조회 (1000행 기본 캡 회피)
  const { data: monthRows } = await supabase
    .from('raw_reviews')
    .select('review_month')
    .range(0, 9999)

  const months = [...new Set((monthRows ?? []).map((r: any) => r.review_month).filter(Boolean))].sort().reverse() as string[]
  const currentMonth = month ?? months[0] ?? ''

  // 선택된 월 데이터만 조회
  const { data: rawReviews } = currentMonth
    ? await supabase.from('raw_reviews').select('*').eq('review_month', currentMonth).order('rating').range(0, 9999)
    : { data: [] }

  return <RawDataClient rawReviews={rawReviews ?? []} months={months} currentMonth={currentMonth} />
}
