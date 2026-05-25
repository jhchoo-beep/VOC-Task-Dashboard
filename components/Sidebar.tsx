'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { LayoutDashboard, FileText, BarChart2, CheckSquare, TrendingUp, LogOut, Database, ExternalLink, Trophy, Star, Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

const EXTERNAL_LINKS: { href: string; icon: any; label: string }[] = []

type NavItem = { href: string; icon: any; label: string; mobileLabel: string }
type NavSection = { title?: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Dashboard',
    items: [
      { href: '/dashboard',   icon: LayoutDashboard, label: '대시보드',        mobileLabel: '대시보드' },
    ],
  },
  {
    title: 'Review & Data',
    items: [
      { href: '/ota-scores',  icon: Star,            label: 'OTA 점수 현황',   mobileLabel: 'OTA' },
      { href: '/reviews',     icon: FileText,        label: '리뷰 데이터',      mobileLabel: '리뷰' },
      { href: '/tasks',       icon: CheckSquare,     label: '수행과제',         mobileLabel: '수행과제' },
    ],
  },
  {
    title: 'Data Analysis',
    items: [
      { href: '/report',      icon: BarChart2,       label: '월간 리포트',      mobileLabel: '리포트' },
      { href: '/analytics',   icon: TrendingUp,      label: '분석 & 트렌드',    mobileLabel: '분석' },
      { href: '/achievement', icon: Trophy,          label: '성과 & 개선 이력', mobileLabel: '성과' },
    ],
  },
  {
    items: [
      { href: '/rawdata',     icon: Database,        label: 'Raw Data',        mobileLabel: 'Raw' },
    ],
  },
]

const NAV = NAV_SECTIONS.flatMap(s => s.items)

export default function Sidebar({ userName, userEmail, userImage }: { userName: string; userEmail: string; userImage: string }) {
  const path = usePathname()
  const { theme, toggle } = useTheme()

  return (
    <>
      {/* ─── 데스크탑 사이드바 (768px 이상) ─── */}
      <aside className="sidebar-desktop" style={{
        width: 220, minHeight: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50,
        background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 로고 */}
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid var(--border)' }}>
          <div className="font-display" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px' }}>
            🧳 MGRV VOC
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>리뷰 대시보드</div>
        </div>

        {/* 네비 */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {NAV_SECTIONS.map((section, si) => (
            <div key={si}>
              {/* 첫 섹션 제외 구분선 */}
              {si > 0 && (
                <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px 4px' }} />
              )}
              {/* 섹션 소제목 */}
              {section.title && (
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  color: 'var(--text-3)', textTransform: 'uppercase',
                  padding: '6px 12px 3px',
                }}>
                  {section.title}
                </div>
              )}
              {section.items.map(({ href, icon: Icon, label }) => {
                const active = path === href || path.startsWith(href + '/')
                return (
                  <Link key={href} href={href} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                    color: active ? 'var(--text-1)' : 'var(--text-2)',
                    background: active ? 'var(--bg-card)' : 'transparent',
                    border: active ? '1px solid var(--border)' : '1px solid transparent',
                    textDecoration: 'none', fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    transition: 'all 0.15s',
                  }}>
                    <Icon size={15} />
                    {label}
                  </Link>
                )
              })}
            </div>
          ))}

          {/* 외부 링크 탭 */}
          {EXTERNAL_LINKS.length > 0 && (
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px 4px' }} />
          )}
          {EXTERNAL_LINKS.map(({ href, icon: Icon, label }) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              color: 'var(--text-2)',
              background: 'transparent',
              border: '1px solid transparent',
              textDecoration: 'none', fontSize: 13,
              fontWeight: 400,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement
              el.style.color = 'var(--accent)'
              el.style.background = 'var(--bg-card)'
              el.style.borderColor = 'var(--border)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement
              el.style.color = 'var(--text-2)'
              el.style.background = 'transparent'
              el.style.borderColor = 'transparent'
            }}>
              <Icon size={15} />
              {label}
            </a>
          ))}
        </nav>

        {/* 테마 토글 */}
        <div style={{ padding: '8px 8px 0' }}>
          <button
            onClick={toggle}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px',
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer',
              fontSize: 13, borderRadius: 8, fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--bg-hover)'; el.style.color = 'var(--text-1)' }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'none'; el.style.color = 'var(--text-2)' }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? '라이트 모드' : '다크 모드'}
          </button>
        </div>

        {/* 유저 */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4 }}>
            {userImage
              ? <img src={userImage} style={{ width: 28, height: 28, borderRadius: '50%' }} alt="" />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                  {(userName || 'U')[0].toUpperCase()}
                </div>
            }
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px',
              background: 'none', border: 'none',
              color: 'var(--text-3)', cursor: 'pointer',
              fontSize: 13, borderRadius: 8, fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--critical)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,59,92,0.08)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <LogOut size={14} /> 로그아웃
          </button>
        </div>
      </aside>

      {/* ─── 모바일 하단 탭 바 (767px 이하) ─── */}
      <nav className="bottom-nav" style={{
        display: 'none',
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--bg-sidebar)', borderTop: '1px solid var(--border)',
        height: 'calc(60px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        alignItems: 'center', justifyContent: 'space-around',
      }}>
        {NAV.map(({ href, icon: Icon, mobileLabel }) => {
          const active = path === href || path.startsWith(href + '/')
          return (
            <Link key={href} href={href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              flex: 1, padding: '6px 2px',
              color: active ? 'var(--accent)' : 'var(--text-3)',
              textDecoration: 'none',
            }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              <span style={{ fontSize: 9, fontWeight: active ? 600 : 400, lineHeight: 1.1, textAlign: 'center' }}>
                {mobileLabel}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
