import { unstable_cache } from 'next/cache'
import { supabase } from '@/lib/supabase'
import RawDataClient from '@/components/RawDataClient'

// 페이지가 auth()로 동적 렌더링되므로 데이터 레이어를 unstable_cache로 캐시.
// 쓰기 API(/api/rawdata*)의 revalidateTag('raw-reviews')로 즉시 무효화된다.
const getRawDataPageData = unstable_cache(async (month?: string) => {
  // 월 목록만 컬럼 한정 조회 — 행 수가 range를 넘어도 최신 월이 누락되지 않도록 반드시 최신순 정렬
  const { data: monthRows } = await supabase
    .from('raw_reviews')
    .select('review_month')
    .order('review_month', { ascending: false })
    .range(0, 9999)

  const months = [...new Set((monthRows ?? []).map((r: any) => r.review_month).filter(Boolean))].sort().reverse() as string[]
  const currentMonth = month ?? months[0] ?? ''

  // 선택된 월 데이터만 조회
  const { data: rawReviews } = currentMonth
    ? await supabase.from('raw_reviews').select('*').eq('review_month', currentMonth).order('rating').range(0, 9999)
    : { data: [] }

  return { rawReviews: rawReviews ?? [], months, currentMonth }
}, ['rawdata-page-data'], { revalidate: 60, tags: ['raw-reviews'] })

export default async function RawDataPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const { rawReviews, months, currentMonth } = await getRawDataPageData(month)

  return <RawDataClient rawReviews={rawReviews} months={months} currentMonth={currentMonth} />
}
