'use client'
import { useRouter } from 'next/navigation'

const MEDALS = ['🥇','🥈','🥉','4위']
const BRANCH_COLOR: Record<string, string> = {
  '제주시티':'var(--jeju)','제주':'var(--jeju)',
  '동대문':'var(--ddm)','신설':'var(--sinseol)','고성':'var(--goseong)',
}

function clxStatus(clx: number) {
  if (clx >= 120) return { text: '탁월', color: '#00E5FF' }
  if (clx >= 80)  return { text: '건강', color: 'var(--done)' }
  if (clx >= 40)  return { text: '보통', color: 'var(--medium)' }
  if (clx >= 0)   return { text: '주의', color: 'var(--high)' }
  return { text: '위험', color: 'var(--critical)' }
}

export default function ReportClient({ metrics, cci, triggers, months, currentMonth }: any) {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>월간 리포트</h1>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>지점별 CLX 분석 · 변심 트리거 & CCI</div>
        </div>
        <select value={currentMonth} onChange={e => router.push(`/report?month=${e.target.value}`)}
          className="input" style={{ width: 'auto', padding: '7px 12px' }}>
          {months.map((m: string) => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* 종합 성과 테이블 */}
      <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          🏆 종합 성과 ({currentMonth})
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['순위','지점','리뷰','평점','CLX','진단','충성','만족','위험','이탈'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0
                ? <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>데이터 없음</td></tr>
                : metrics.map((m: any, i: number) => {
                    const { text, color } = clxStatus(m.clx)
                    const bc = BRANCH_COLOR[m.branch] ?? 'var(--accent)'
                    return (
                      <tr key={m.branch} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td style={{ padding: '12px 14px', fontSize: 16 }}>{MEDALS[i] ?? ''}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: bc }} />
                            <span style={{ fontWeight: 600 }}>{m.branch}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-2)' }}>{m.total}건</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ color: m.avg_rating >= 9 ? 'var(--done)' : m.avg_rating >= 7 ? 'var(--accent)' : 'var(--medium)', fontWeight: 600 }}>
                            ★ {m.avg_rating}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="font-display" style={{ fontSize: 18, fontWeight: 800, color }}>
                            {m.clx >= 0 ? '+' : ''}{Math.round(m.clx)}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="badge" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>{text}</span>
                        </td>
                        {[m.loyal_pct, m.satisfied_pct, m.at_risk_pct, m.churned_pct].map((p: number, j: number) => (
                          <td key={j} style={{ padding: '12px 14px', color: j === 3 && p > 5 ? 'var(--critical)' : 'var(--text-2)' }}>{p}%</td>
                        ))}
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* CLX 기준 범례 */}
      <div className="card" style={{ padding: '12px 20px', marginBottom: 20, background: 'rgba(74,158,255,0.04)', borderColor: 'rgba(74,158,255,0.15)' }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
          {[
            { range: '120+', label: '탁월 (Excellent)', color: '#00E5FF' },
            { range: '80~119', label: '건강 (Healthy) — 목표', color: 'var(--done)' },
            { range: '40~79', label: '보통 (Average)', color: 'var(--medium)' },
            { range: '0~39', label: '주의 (Caution)', color: 'var(--high)' },
            { range: '0 미만', label: '위험 (Critical)', color: 'var(--critical)' },
          ].map(item => (
            <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
              <span style={{ color: 'var(--text-3)' }}>{item.range}</span>
              <span style={{ color: item.color, fontWeight: 500 }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 2컬럼 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* CCI Top 5 */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>📊 CCI Top 5 — 변심 기여 카테고리</div>
          {cci.length === 0
            ? <div style={{ color: 'var(--text-3)', fontSize: 13 }}>데이터 없음</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cci.map((item: any, i: number) => {
                  const score = Math.round(item.cnt * item.avg_severity * 10)
                  const maxScore = Math.round(cci[0].cnt * cci[0].avg_severity * 10)
                  const width = maxScore > 0 ? (score / maxScore) * 100 : 0
                  return (
                    <div key={item.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                        <span style={{ color: i === 0 ? 'var(--critical)' : i === 1 ? 'var(--high)' : 'var(--text-1)', fontWeight: 500 }}>
                          {i + 1}. {item.category} <span style={{ color: 'var(--text-3)' }}>({item.cnt}건)</span>
                        </span>
                        <span className="font-mono" style={{ color: 'var(--text-3)' }}>{score}</span>
                      </div>
                      <div className="progress">
                        <div className="progress-fill" style={{ width: `${width}%`, background: i === 0 ? 'var(--critical)' : i === 1 ? 'var(--high)' : 'var(--accent)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
          }
        </div>

        {/* 변심 트리거 */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚡ 변심 트리거 분석</div>
          {triggers.length === 0
            ? <div style={{ color: 'var(--text-3)', fontSize: 13 }}>데이터 없음</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {triggers.map((t: any) => (
                  <div key={t.trigger} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{t.trigger}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.cnt}건 발생</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: t.avg_rating < 5 ? 'var(--critical)' : 'var(--medium)' }}>★ {t.avg_rating}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>평균 평점</div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  )
}
