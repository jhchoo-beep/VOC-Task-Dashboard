'use client'
import { KR4_BRANCHES, avg, f2, kpiCells, rowsFor, prevKeys, type Kr4Data, type Kr4Mode, type OtaProperty, type OtaScore } from '../../lib/kr4'
import { Score, TONE_COLOR } from './Kr4Shared'
import { tone } from '../../lib/kr4'

// 지점 카드 = 지점 선택 + 세 칸(전체 누적 OTA 표시 평점 / 이번 달 누적 / 이번 주, 기간 선택과 무관) + 고른 기간 점수와 직전 대비
export default function Kr4Cards({ data, ota, mode, sel, branchSel, onPick }: {
  data: Kr4Data; ota: { props: OtaProperty[]; scores: OtaScore[] }; mode: Kr4Mode; sel: string[]; branchSel: string[]
  onPick: (b: string | null) => void
}) {
  const pk = prevKeys(data, mode, sel)
  const unit = mode === 'w' ? '주' : '달'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
      {[null, ...KR4_BRANCHES].map(b => {
        const on = b == null ? !branchSel.length : branchSel.includes(b)
        const bs = b == null ? [] : [b]
        const a = avg(rowsFor(data, mode, sel, bs)), p = pk ? avg(rowsFor(data, mode, pk, bs)) : null
        const d = a != null && p != null ? a - p : null
        const cells = kpiCells(data, ota, b)
        return (
          <button key={b ?? 'all'} onClick={() => onPick(b)} className="card" style={{
            textAlign: 'left', padding: '14px 16px', cursor: 'pointer', color: 'inherit', font: 'inherit',
            borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 1px var(--accent)' : undefined,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>{b ?? '전체'}</div>
            {cells.map(c => (
              <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '3px 0' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }} title={c.label === '전체 누적' ? 'OTA 사이트에 표시된 평점과 리뷰 수(VOC 대시보드 OTA 현황). 5점 만점 채널은 2배 환산, 리뷰 수 가중.' : undefined}>
                  {c.label}{c.label === '전체 누적' && <span style={{ marginLeft: 4, fontSize: 10 }}>OTA 표시 평점</span>}
                </span>
                {c.v == null
                  ? <span style={{ fontSize: 12, color: 'var(--text-3)' }}>리뷰 없음</span>
                  : <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <b style={{ fontSize: 20, color: TONE_COLOR[tone(c.v)], fontVariantNumeric: 'tabular-nums' }}>{f2(c.v)}</b>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.n.toLocaleString('en-US')}건</span>
                    </span>}
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              고른 기간 {a == null ? '리뷰 없음' : <Score v={a} size={13} />}
              {d != null
                ? <span> (직전 {sel.length}{unit} 대비 <span style={{ color: d < 0 ? 'var(--critical)' : 'var(--done)', fontWeight: 600 }}>{d >= 0 ? '+' : ''}{d.toFixed(2)}</span>)</span>
                : a != null && <span style={{ color: 'var(--text-3)' }}> (직전 비교 없음)</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
