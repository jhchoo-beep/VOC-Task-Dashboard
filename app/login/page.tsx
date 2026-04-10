'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      {/* 배경 글로우 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(74,158,255,0.06) 0%, transparent 70%)',
      }} />

      <div className="fade-up" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        {/* 로고 */}
        <div style={{ marginBottom: 44 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 60, height: 60, borderRadius: 16,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            fontSize: 28, marginBottom: 16,
          }}>🧳</div>
          <div className="font-display" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 6 }}>
            MGRV VOC
          </div>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            OTA 리뷰 & 수행과제 대시보드
          </div>
        </div>

        {/* 카드 */}
        <div className="card" style={{ padding: 32 }}>
          <div style={{
            display: 'inline-block', marginBottom: 20,
            background: 'rgba(74,158,255,0.1)', color: 'var(--accent)',
            padding: '4px 14px', borderRadius: 20,
            fontSize: 12, fontWeight: 500,
            border: '1px solid rgba(74,158,255,0.2)',
          }}>
            🔒 @mgrv.company 계정 전용
          </div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>
            맹그로브 회사 Google 계정으로<br />로그인하세요
          </div>

          <button
            onClick={() => { setLoading(true); signIn('google', { callbackUrl: '/dashboard' }) }}
            disabled={loading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 12,
              background: loading ? '#e0e0e0' : '#fff',
              color: '#1a1a1a', border: 'none', borderRadius: 10,
              padding: '13px 20px', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', fontFamily: 'inherit',
            }}
          >
            {loading
              ? <div style={{ width: 18, height: 18, border: '2px solid #ccc', borderTopColor: '#666', borderRadius: '50%' }} className="spin" />
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
            }
            {loading ? '로그인 중...' : 'Google 계정으로 로그인'}
          </button>
        </div>

        <div style={{ marginTop: 20, color: 'var(--text-3)', fontSize: 11 }}>
          맹그로브 내부 전용 시스템
        </div>
      </div>
    </div>
  )
}
