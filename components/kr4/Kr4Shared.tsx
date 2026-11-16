'use client'
import type { CSSProperties } from 'react'
import { f2, tone, type Tone } from '../../lib/kr4'

export const TONE_COLOR: Record<Tone, string> = {
  none: 'var(--text-3)', red: 'var(--critical)', amber: 'var(--high)', green: 'var(--done)',
}
// 지점 색(OtaScoresClient BRANCH_COLOR 와 같은 값)
export const BRANCH_COLOR: Record<string, string> = {
  신설: '#00D4A0', 동대문: '#9B6FFF', 제주시티: '#00C9E0', 고성: '#FF9B3B',
}

/** 점수 숫자: 8.9 미만 빨강, 9.0 미만 주황, 이상 초록 */
export function Score({ v, size = 14, bold = true }: { v: number | null; size?: number; bold?: boolean }) {
  return <span style={{ color: TONE_COLOR[tone(v)], fontSize: size, fontWeight: bold ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{f2(v)}</span>
}
export function Gray({ v }: { v: number | null }) {
  return <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{f2(v)}</span>
}
export function Arrow({ d }: { d: number }) {
  return <span style={{ color: d < 0 ? 'var(--critical)' : 'var(--done)', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{d < 0 ? '▼' : '▲'}{Math.abs(d).toFixed(2)}</span>
}
export const CHIP = (active: boolean): CSSProperties => ({
  padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
  background: active ? 'var(--accent)' : 'var(--bg-card)', color: active ? '#fff' : 'var(--text-2)', fontWeight: active ? 600 : 400,
})
export const SECTION_TITLE: CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }
