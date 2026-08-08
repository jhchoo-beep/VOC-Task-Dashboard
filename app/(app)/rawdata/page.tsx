import { supabase } from '@/lib/supabase'
import RawDataClient from '@/components/RawDataClient'

// 🔴 unstable_cache로 감싸지 않는다(과거엔 revalidate:60·tags:['raw-reviews']였다).
//    raw_reviews의 실제 기록자는 앱의 쓰기 API가 아니라 **다른 PC에서 도는 수집 스크래퍼**이고,
//    스크래퍼는 Supabase에 직접 INSERT하므로 revalidateTag('raw-reviews')가 호출되지 않는다.
//    남는 TTL은 stale-while-revalidate라 만료 후 첫 요청이 낡은 값을 받는다 — 사내 저트래픽
//    앱에서는 화면을 여는 사람이 늘 그 첫 요청이다. 2026-08-08 실측: 첫 방문은 7월 167건,
//    재방문은 8월 53건이었다(8월 데이터가 08-06에 들어왔는데 화면은 07-30 스냅샷이었다).
//    한 달치 조회라 캐시 없이도 요청 두 번이면 끝난다. 자세한 논거는 lib/pageData.ts의
//    getWeeklyReportProps 주석 참조.
const getRawDataPageData = async (month?: string) => {
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
}

export default async function RawDataPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const { rawReviews, months, currentMonth } = await getRawDataPageData(month)

  return <RawDataClient rawReviews={rawReviews} months={months} currentMonth={currentMonth} />
}
