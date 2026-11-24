'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// 2.0 메뉴. 순서 = 회의에서 보는 순서(홈 → 불편 지수 → 수행과제 → 근거 데이터 → 리포트).
const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/v2', label: '홈', match: p => p === '/v2' },
  { href: '/v2/discomfort', label: '불편 지수', match: p => p.startsWith('/v2/discomfort') },
  { href: '/v2/tasks', label: '수행과제', match: p => p.startsWith('/v2/tasks') },
  { href: '/v2/ota', label: 'OTA 점수', match: p => p.startsWith('/v2/ota') },
  { href: '/v2/reviews', label: '리뷰 원문', match: p => p.startsWith('/v2/reviews') },
  { href: '/v2/report', label: '리포트', match: p => p.startsWith('/v2/report') },
  { href: '/v2/trends', label: '분석', match: p => p.startsWith('/v2/trends') },
]

type Theme = 'dark' | 'light'

export default function V2Header() {
  const path = usePathname() ?? '/v2'
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const t = document.getElementById('v2root')?.getAttribute('data-theme')
    setTheme(t === 'light' ? 'light' : 'dark')
  }, [])

  const pick = (t: Theme) => {
    setTheme(t)
    document.getElementById('v2root')?.setAttribute('data-theme', t)
    try { localStorage.setItem('voc2-theme', t) } catch { /* 저장 못 해도 화면은 바뀐다 */ }
  }

  return (
    <header className="v2-header">
      <Link href="/v2" className="v2-brand">STAY VOC<small>2.0</small></Link>
      <nav className="v2-nav" aria-label="2.0 메뉴">
        {TABS.map(t => (
          <Link key={t.href} href={t.href} className={`tab${t.match(path) ? ' on' : ''}`} aria-current={t.match(path) ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="v2-head-r">
        <div className="thm-wrap" role="group" aria-label="화면 색">
          <button type="button" className={`thm${theme === 'dark' ? ' on' : ''}`} aria-pressed={theme === 'dark'} onClick={() => pick('dark')}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 8.6A5.4 5.4 0 0 1 5.4 2a5.4 5.4 0 1 0 6.6 6.6z" /></svg>
            <span className="lbl">다크</span>
          </button>
          <button type="button" className={`thm${theme === 'light' ? ' on' : ''}`} aria-pressed={theme === 'light'} onClick={() => pick('light')}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="2.6" /><path d="M7 1v1.4M7 11.6V13M1 7h1.4M11.6 7H13M2.8 2.8l1 1M10.2 10.2l1 1M2.8 11.2l1-1M10.2 3.8l1-1" /></svg>
            <span className="lbl">라이트</span>
          </button>
        </div>
        <Link href="/dashboard" className="chip-line">1.0 화면</Link>
      </div>
    </header>
  )
}
