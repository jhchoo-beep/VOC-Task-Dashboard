// STAY VOC 2.0 리뷰 원문 — 서버에서 달 하나를 읽어 콘솔에 넘긴다. 앱(/v2/reviews)과 읽기 전용 임베드(/embed/v2/reviews)가 같이 쓴다.
// 달은 주소(?month=)로 서버에서 다시 읽고, 지점·탭·고른 리뷰는 주소를 처음 값으로만 쓰고 화면 안 상태로 바꾼다.
import { getReviewsData } from '@/lib/v2/reviews'
import { ALL, BRANCHES, type Scope } from '@/lib/v2/metrics'
import ReviewsConsole from './ReviewsConsole'

type SP = Promise<{ [k: string]: string | string[] | undefined }>

export default async function ReviewsScreen({ searchParams, readOnly = false }: { searchParams: SP; readOnly?: boolean }) {
  const sp = await searchParams
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const data = await getReviewsData(str('month'))
  const b = str('branch')
  const branch: Scope = b && (BRANCHES as readonly string[]).includes(b) ? (b as Scope) : ALL

  return (
    <ReviewsConsole
      key={data.month}
      data={data}
      initialBranch={branch}
      initialTab={str('tab') === 'raw' ? 'raw' : 'reviews'}
      initialReview={str('review') ?? null}
      readOnly={readOnly}
      // 임베드는 middleware 가 ?key= 로만 연다. 화면 안 링크가 같은 임베드로 가도록 이어 붙인다.
      embedKey={readOnly ? str('key') ?? null : null}
    />
  )
}
