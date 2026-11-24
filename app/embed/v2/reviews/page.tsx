// 2.0 리뷰 원문 읽기 전용 임베드(노션·확인용). 추가·수정·삭제·업로드 컨트롤을 그리지 않는다.
export const dynamic = 'force-dynamic'

import ReviewsScreen from '@/components/v2/reviews/ReviewsScreen'

export default function EmbedReviewsPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return <ReviewsScreen searchParams={searchParams} readOnly />
}
