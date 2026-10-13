// VOC V2 지표 — 임베드 경로. 구글 로그인 대신 middleware 의 ?key=EMBED_TOKEN 으로만 들어온다(/embed/v2-universe 와 같은 보호).
// 화면과 데이터는 /v2/metrics 와 같다. 화면 위 탭은 ?key= 를 그대로 들고 /embed/v2-universe 로 오간다.
// 🔴 캐시 없음(force-dynamic + Cache-Control: no-store).
import { getSupabase } from '@/lib/supabase'
import { loadMetricsFromDb, metricsErrorPage, metricsPageForLoad } from '@/lib/v2/metricsPage'
import type { PageOut } from '@/lib/v2/universePage'
import { METRICS_TEMPLATE } from '@/lib/v2/viewer/metricsTemplate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  let page: PageOut
  try {
    const load = await loadMetricsFromDb(getSupabase())
    if (load.state === 'ready' && load.warnings.length) {
      console.warn(`[embed/v2-metrics] 조립 경고 ${load.warnings.length}건`, load.warnings.slice(0, 20))
    }
    page = metricsPageForLoad(load, METRICS_TEMPLATE)
  } catch (e) {
    console.error('[embed/v2-metrics] 읽기 실패', e)
    page = metricsErrorPage()
  }
  return new Response(page.html, {
    status: page.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-VOC-Metrics': page.state },
  })
}
