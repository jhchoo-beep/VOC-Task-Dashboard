// VOC V2 우주(3D) — 임베드 경로. 구글 로그인 대신 middleware 의 ?key=EMBED_TOKEN 으로만 들어온다(V1 노션 임베드와 같은 보호).
//
// 왜: Vercel 미리보기는 NEXTAUTH_URL 이 운영 주소라 구글 로그인 뒤 운영(V1)으로 돌아가 /v2/universe 를 볼 수 없다(2026-10-13 재헌 확인).
// 화면과 데이터는 /v2/universe 와 같다(조립 lib/v2/universeFromDb.ts, 문서 lib/v2/universePage.ts). 노션 회의록에도 같은 방식으로 임베드할 수 있다.
// 🔴 캐시 없음(force-dynamic + Cache-Control: no-store).
import { getSupabase } from '@/lib/supabase'
import { loadUniverseFromDb } from '@/lib/v2/universeFromDb'
import { errorPage, pageForLoad, type PageOut } from '@/lib/v2/universePage'
import { UNIVERSE_TEMPLATE } from '@/lib/v2/viewer/universeTemplate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  let page: PageOut
  try {
    const load = await loadUniverseFromDb(getSupabase())
    if (load.state === 'ready' && load.warnings.length) {
      console.warn(`[embed/v2-universe] 조립 경고 ${load.warnings.length}건`, load.warnings.slice(0, 20))
    }
    page = pageForLoad(load, UNIVERSE_TEMPLATE)
  } catch (e) {
    console.error('[embed/v2-universe] 읽기 실패', e)
    page = errorPage()
  }
  return new Response(page.html, {
    status: page.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-VOC-Universe': page.state },
  })
}
