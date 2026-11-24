// 2.0 OTA 점수 노션 임베드 — 읽기 전용(데이터 입력 등 쓰기 컨트롤을 그리지 않는다). ?key= 토큰은 middleware 가 확인.
export const dynamic = 'force-dynamic'

import OtaPage from '@/components/v2/ota/OtaPage'

export default async function EmbedOtaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return <OtaPage sp={await searchParams} readOnly />
}
