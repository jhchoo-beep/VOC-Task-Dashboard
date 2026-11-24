// 2.0 화면 공용 조각(서버·클라이언트 어디서나 쓰는 표시용). 계산은 lib/v2/metrics.ts.
import { TARGET_INDEX, toneOf, type Tone } from '@/lib/v2/metrics'

export const mLabel = (m: string) => `${+m.slice(5, 7)}월`
export const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`
export const f1 = (x: number | null | undefined) => (x == null ? '–' : x.toFixed(1))
export const f2 = (x: number | null | undefined) => (x == null ? '–' : x.toFixed(2))

export const toneClass = (t: Tone) => (t === 'over' ? 'tone-over' : t === 'ok' ? 'tone-ok' : 'dim')

export function Flag({ idx }: { idx: number | null }) {
  const t = toneOf(idx)
  if (t === 'none') return <span className="flag na">리뷰 없음</span>
  return t === 'over'
    ? <span className="flag over">목표 초과</span>
    : <span className="flag ok">목표 달성</span>
}

/** 홈 카드의 달별 막대. 마지막 막대가 지금 고른 달 */
export function Bars({ values, labels, overAt = TARGET_INDEX, max }: { values: (number | null)[]; labels: string[]; overAt?: number; max?: number }) {
  // 기준선이 있는 지표(불편 지수)는 기준의 1.4배를 위로 잡아 높이를 달끼리 비교하게 하고, 없으면 값 최대치에 맞춘다
  const peak = Math.max(0, ...values.map(v => v ?? 0))
  const top = max ?? (Math.max(overAt < 900 ? overAt * 1.4 : 0, peak * 1.1) || 1)
  return (
    <>
      <span className="bars" aria-hidden="true">
        {values.map((v, i) => (
          <i key={i} className={`${i === values.length - 1 ? 'on' : ''}${v != null && v >= overAt ? ' over' : ''}`}
            style={{ height: `${v == null ? 3 : Math.max(3, Math.round(v / top * 38))}px`, opacity: v == null ? 0.35 : 1 }} />
        ))}
      </span>
      <span className="bars-x" aria-hidden="true">
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </span>
    </>
  )
}

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" /><path d="M9.5 9.5L13 13" />
    </svg>
  )
}
