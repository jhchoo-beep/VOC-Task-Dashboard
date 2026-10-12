// VOC V2 우주(3D) — 로그인한 사람만, 요청마다 운영 DB 에서 읽어 B 화면에 넣어 돌려준다.
//
// (app) 그룹 밖에 둔다: 사이드바 없이 전체 화면으로 보이게. 로그인 보호는 middleware(로그인 없으면 /login)가
// 먼저 하고, 여기서 auth() 로 한 번 더 확인한다.
// 🔴 캐시 없음(force-dynamic + Cache-Control: no-store). 조립은 lib/v2/universeFromDb.ts, 문서는 lib/v2/universePage.ts.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getSupabase } from '@/lib/supabase'
import { loadUniverseFromDb } from '@/lib/v2/universeFromDb'
import { renderStatusPage, renderUniversePage } from '@/lib/v2/universePage'
import { UNIVERSE_TEMPLATE } from '@/lib/v2/viewer/universeTemplate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const headers = (state: 'ready' | 'empty' | 'error') => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-VOC-Universe': state,
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  try {
    const load = await loadUniverseFromDb(getSupabase())
    if (load.state === 'empty') {
      const t = load.tables
      const line = load.reason === 'tables_missing'
        ? 'V2 표 없음'
        : `별 ${t.voc_stars ?? 0} · 별자리 ${t.voc_constellations ?? 0}`
      return new Response(renderStatusPage({ heading: '데이터 적재 전', lines: [line] }), { status: 200, headers: headers('empty') })
    }
    if (load.warnings.length) console.warn(`[v2/universe] 조립 경고 ${load.warnings.length}건`, load.warnings.slice(0, 20))
    return new Response(renderUniversePage(UNIVERSE_TEMPLATE, load.universe), { status: 200, headers: headers('ready') })
  } catch (e) {
    console.error('[v2/universe] 읽기 실패', e)
    return new Response(renderStatusPage({ heading: '데이터를 읽지 못했습니다', lines: ['잠시 뒤 새로고침'] }), { status: 500, headers: headers('error') })
  }
}
