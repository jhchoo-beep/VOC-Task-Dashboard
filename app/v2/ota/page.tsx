// STAY VOC 2.0 OTA 점수 — B 관제 콘솔형. 1.0 「OTA 점수 현황」(/ota-scores)과 같은 데이터·같은 기능, 디자인만 2.0.
// ?branch=<지점> 으로 열면 그 지점이 골라진 채로, &ch=<채널> 이면 그 채널 상세로 연다.
// 🔴 캐시하지 않는다 — 근거는 lib/pageData.ts 상단 주석(수집 스크래퍼가 DB 에 직접 쓴다).
export const dynamic = 'force-dynamic'

import OtaPage from '@/components/v2/ota/OtaPage'

export default async function Page({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  return <OtaPage sp={await searchParams} readOnly={false} />
}
