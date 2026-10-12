// VOC V2 우주(3D) — 로그인한 사람만, 요청마다 운영 DB 에서 읽어 B 화면에 넣어 돌려준다.
//
// (app) 그룹 밖에 둔다: 사이드바 없이 전체 화면으로 보이게. 로그인 보호는 middleware(로그인 없으면 /login)가
// 먼저 하고, 여기서 auth() 로 한 번 더 확인한다.
// 🔴 캐시 없음(force-dynamic + Cache-Control: no-store). 조립은 lib/v2/universeFromDb.ts, 문서는 lib/v2/universePage.ts.
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getSupabase } from '@/lib/supabase'
import { loadUniverseFromDb } from '@/lib/v2/universeFromDb'
import { errorPage, pageForLoad, type PageOut } from '@/lib/v2/universePage'
import { UNIVERSE_TEMPLATE } from '@/lib/v2/viewer/universeTemplate'

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
    const load = await loadUniverseFromDb(getSupabase())
    if (load.state === 'ready' && load.warnings.length) {
      console.warn(`[v2/universe] 조립 경고 ${load.warnings.length}건`, load.warnings.slice(0, 20))
    }
    page = pageForLoad(load, UNIVERSE_TEMPLATE)
  } catch (e) {
    console.error('[v2/universe] 읽기 실패', e)
    page = errorPage()
  }
  return new Response(page.html, {
    status: page.status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-VOC-Universe': page.state },
  })
}
