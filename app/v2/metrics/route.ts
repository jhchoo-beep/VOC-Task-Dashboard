// VOC V2 지표 — 로그인한 사람만. 요청마다 운영 DB 에서 읽어 지표 6장·은하 9칸을 계산해 돌려준다.
// 우주 화면(app/v2/universe/route.ts)과 같은 보호·같은 조립. 계산은 lib/v2/metrics.ts, 문서는 lib/v2/metricsPage.ts.
// 🔴 캐시 없음(force-dynamic + Cache-Control: no-store).
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getSupabase } from '@/lib/supabase'
import { loadMetricsFromDb, metricsErrorPage, metricsPageForLoad } from '@/lib/v2/metricsPage'
import type { PageOut } from '@/lib/v2/universePage'
import { METRICS_TEMPLATE } from '@/lib/v2/viewer/metricsTemplate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
  let page: PageOut
  try {
    const load = await loadMetricsFromDb(getSupabase())
    if (load.state === 'ready' && load.warnings.length) {
      console.warn(`[v2/metrics] 조립 경고 ${load.warnings.length}건`, load.warnings.slice(0, 20))
    }
    page = metricsPageForLoad(load, METRICS_TEMPLATE)
  } catch (e) {
    console.error('[v2/metrics] 읽기 실패', e)
    page = metricsErrorPage()
  }
  return new Response(page.html, {
    status: page.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-VOC-Metrics': page.state },
  })
}
