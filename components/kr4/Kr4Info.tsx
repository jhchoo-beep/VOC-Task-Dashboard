'use client'
import type { ReactNode } from 'react'

// ⓘ 안내 = 누르면 펼쳐지는 작은 상자(현재 HTML 의 details.info 와 같은 역할)
export default function Kr4Info({ children, width = 420, align = 'left' }: { children: ReactNode; width?: number; align?: 'left' | 'right' }) {
  return (
    <details style={{ position: 'relative', display: 'inline-block' }}>
      <summary style={{ cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, listStyle: 'none', userSelect: 'none' }} title="안내">ⓘ</summary>
      <div style={{
        position: 'absolute', zIndex: 30, top: 24, [align]: 0, width, maxWidth: '80vw', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,.18)', padding: '10px 14px', fontSize: 12, fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.6, textAlign: 'left',
      }}>
        {children}
      </div>
    </details>
  )
}
export const InfoList = ({ items }: { items: ReactNode[] }) => (
  <ul style={{ margin: 0, paddingLeft: 16 }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
)
