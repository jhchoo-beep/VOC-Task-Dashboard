import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/api/auth')) return NextResponse.next()

  // 임베드 경로: 로그인 대신 토큰(?key=)으로만 접근 허용 (노션 등 외부 iframe용)
  if (pathname.startsWith('/embed')) {
    const key = req.nextUrl.searchParams.get('key')
    if (key && key === process.env.EMBED_TOKEN) return NextResponse.next()
    return new NextResponse('Forbidden', { status: 403 })
  }

  const session = await auth()

  if (pathname === '/login') {
    if (session) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }
  if (!session) return NextResponse.redirect(new URL('/login', req.url))
  return NextResponse.next()
}

export const config = {
  // fonts/ = public/fonts 의 공개 글꼴 파일(데이터 없음). 임베드 경로(로그인 없음)의 V2 지표 화면도 같은 글꼴을 받게 통과시킨다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts/).*)'],
}
