// STAY VOC 2.0 리뷰 원문 — B 관제 콘솔형. 1.0 「리뷰 데이터」와 「Raw Data」 기능을 한 탭에.
// 🔴 리뷰·Raw·분석은 배치와 스크래퍼가 DB 에 직접 쓰므로 캐시하지 않는다.
export const dynamic = 'force-dynamic'

import ReviewsScreen from '@/components/v2/reviews/ReviewsScreen'

export default function ReviewsPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return <ReviewsScreen searchParams={searchParams} />
}
