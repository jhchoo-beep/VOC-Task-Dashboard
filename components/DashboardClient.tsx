'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatMonth } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckSquare, CheckCircle2 } from 'lucide-react'

const BRANCH_COLOR: Record<string, string> = {
  '제주시티': 'var(--jeju)', '제주': 'var(--jeju)',
  '동대문': 'var(--ddm)', '신설': 'var(--sinseol)', '고성': 'var(--goseong)',
}
const BRANCH_BADGE: Record<string, string> = {
  '제주시티': 'badge-jeju', '제주': 'badge-jeju',
  '동대문': 'badge-ddm', '신설': 'badge-sinseol', '고성': 'badge-goseong',
}
const SEV_BADGE: Record<string, string> = {
  Critical: 'badge-critical', High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low',
}

function clxLabel(clx: number) {
  if (clx >= 120) return { text: '탁월', color: '#00E5FF' }
  if (clx >= 80)  return { text: '건강', color: 'var(--done)' }
  if (clx >= 40)  return { text: '보통', color: 'var(--medium)' }
  if (clx >= 0)   return { text: '주의', color: 'var(--high)' }
  return { text: '위험', color: 'var(--critical)' }
}

export default function DashboardClient({ clxData, criticals, completedCriticals = [], taskProgress, currentMonth, months = [] }: any) {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* 헤더 */}
      <div className="fade-up" style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>대시보드</h1>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            {currentMonth ? `${formatMonth(currentMonth)} 기준` : '데이터 없음'} · 전 지점 현황
          </div>
        </div>
        {/* 월 선택 드롭다운 */}
        {months.length > 0 && (
          <select
            value={currentMonth}
            onChange={e => router.push(`/dashboard?month=${e.target.value}`)}
            className="input"
            style={{ width: 'auto', padding: '7px 12px', fontSize: 13 }}
          >
            {months.map((m: string) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Critical Alert */}
      {criticals.length > 0 && (
        <div className="fade-up delay-1" style={{
          background: 'rgba(255,59,92,0.07)', border: '1px solid rgba(255,59,92,0.25)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <AlertTriangle size={17} color="var(--critical)" />
          <div style={{ flex: 1, fontSize: 13 }}>
            <span style={{ color: 'var(--critical)', fontWeight: 600 }}>미처리 이슈 {criticals.length}건</span>
            <span style={{ color: 'var(--text-2)', marginLeft: 8 }}>
              Critical {criticals.filter((c: any) => c.severity === 'Critical').length}건 · High {criticals.filter((c: any) => c.severity === 'High').length}건
            </span>
          </div>
          <a href="/reviews" style={{ color: 'var(--critical)', fontSize: 12, textDecoration: 'none' }}>확인 →</a>
        </div>
      )}

      {/* CLX 카드 */}
      <div className="fade-up delay-2" style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          지점별 CLX (고객 충성도 지수)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
          {clxData.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, gridColumn: '1/-1', padding: '24px 0' }}>
              데이터가 없습니다. Claude Code로 리뷰를 수집해주세요.
            </div>
          ) : clxData.map((item: any, i: number) => {
            const { text, color } = clxLabel(item.clx)
            const bc = BRANCH_COLOR[item.branch] ?? 'var(--accent)'
            const medals = ['🥇','🥈','🥉','']
            return (
              <div key={item.branch} className="card" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle, ${bc}18 0%, transparent 70%)`, pointerEvents: 'none' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: bc }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.branch}</span>
                  </div>
                  <span style={{ fontSize: 16 }}>{medals[i] ?? ''}</span>
                </div>
                <div className="font-display" style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>
                  {item.clx >= 0 ? '+' : ''}{Math.round(item.clx)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>CLX · <span style={{ color }}>{text}</span></div>
                {item.diff !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: item.diff > 0 ? 'var(--done)' : item.diff < 0 ? 'var(--critical)' : 'var(--text-3)' }}>
                    {item.diff > 0 ? <TrendingUp size={12} /> : item.diff < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                    {item.diff > 0 ? '+' : ''}{Math.round(item.diff)} 전월
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)' }}>
                  <span>평균</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>★ {item.avg_rating}</span>
                </div>
                {/* 세그먼트 미니바 */}
                <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 8, gap: 1 }}>
                  <div style={{ width: `${item.loyal_pct}%`, background: 'var(--done)', borderRadius: 2 }} />
                  <div style={{ width: `${item.satisfied_pct}%`, background: 'var(--accent)' }} />
                  <div style={{ width: `${item.at_risk_pct}%`, background: 'var(--medium)' }} />
                  <div style={{ width: `${item.churned_pct}%`, background: 'var(--critical)' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 하단 2컬럼 */}
      <div className="fade-up delay-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 수행과제 진행률 */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
            <CheckSquare size={14} /> 수행과제 진행률 ({formatMonth(currentMonth)})
          </div>
          {taskProgress.length === 0
            ? <div style={{ color: 'var(--text-3)', fontSize: 13 }}>이번 달 수행과제 없음</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {taskProgress.map((tp: any) => {
                  const pct = tp.total > 0 ? Math.round(tp.done / tp.total * 100) : 0
                  return (
                    <div key={tp.branch}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span className={`badge ${BRANCH_BADGE[tp.branch] ?? 'badge-low'}`}>{tp.branch}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{tp.done}/{tp.total} ({pct}%)</span>
                      </div>
                      <div className="progress">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--done)' : 'var(--accent)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
          }
          <a href={`/tasks?month=${currentMonth}`} style={{ display: 'inline-block', marginTop: 16, color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>수행과제 전체 보기 →</a>
        </div>

        {/* 미처리 이슈 */}
        <CriticalList criticals={criticals} completedCriticals={completedCriticals} />
      </div>
    </div>
  )
}

/* ─── 미처리 이슈 카드 (번역 표시 + 처리완료/되돌리기 버튼) ─── */
function CriticalList({ criticals: initial, completedCriticals = [] }: any) {
  const router = useRouter()
  const [items, setItems]         = useState<any[]>(initial ?? [])
  const [done,  setDone]          = useState<any[]>(completedCriticals)
  const [loading, setLoading]     = useState<string|null>(null)
  const [showDone, setShowDone]   = useState(false)

  useEffect(() => {
    setItems(initial ?? [])
    setDone(completedCriticals ?? [])
  }, [initial, completedCriticals])

  const handleComplete = async (e: React.MouseEvent, item: any) => {
    e.preventDefault(); e.stopPropagation()
    setLoading(item.id)
    await fetch('/api/reviews/update', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, status: '완료' }),
    })
    setItems(prev => prev.filter(c => c.id !== item.id))
    setDone(prev => [{ ...item, status: '완료' }, ...prev])
    setLoading(null)
    router.refresh()
  }

  const handleUndo = async (e: React.MouseEvent, item: any) => {
    e.preventDefault(); e.stopPropagation()
    setLoading(item.id)
    await fetch('/api/reviews/update', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, status: '미처리' }),
    })
    setDone(prev => prev.filter(c => c.id !== item.id))
    setItems(prev => [{ ...item, status: '미처리' }, ...prev])
    setLoading(null)
    router.refresh()
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          <AlertTriangle size={14} /> 미처리 Critical / High
        </div>
        <button onClick={() => setShowDone(!showDone)}
            style={{ fontSize: 11, color: 'var(--done)', background: 'rgba(0,229,102,0.08)', border: '1px solid rgba(0,229,102,0.25)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
            처리완료 {done.length}건 {showDone ? '▲' : '▼'}
          </button>
      </div>

      {/* 미처리 목록 */}
      {items.length === 0 && done.length === 0
        ? <div style={{ color: 'var(--done)', fontSize: 13 }}>✓ 모든 이슈 처리 완료</div>
        : items.length === 0
          ? <div style={{ color: 'var(--done)', fontSize: 13, marginBottom: 8 }}>✓ 미처리 이슈 없음</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: done.length > 0 ? 8 : 0 }}>
              {items.slice(0, 5).map((c: any) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span className={`badge ${SEV_BADGE[c.severity] ?? 'badge-low'}`} style={{ flexShrink: 0, marginTop: 1 }}>{c.severity}</span>
                  <a href={`/reviews?month=${c.review_month}&review=${c.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>{(c.content_ko ?? c.content ?? '').slice(0, 60)}...</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{c.branch} · {c.ota_site} · ★{c.rating}</div>
                  </a>
                  {/* 처리완료 버튼 - 눈에 잘 띄게 */}
                  <button onClick={e => handleComplete(e, c)} disabled={loading === c.id} title="처리 완료로 변경"
                    style={{ background: 'rgba(0,229,102,0.12)', border: '1px solid rgba(0,229,102,0.4)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'var(--done)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 11, fontWeight: 600, transition: 'all 0.15s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(0,229,102,0.22)' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(0,229,102,0.12)' }}>
                    {loading === c.id ? '...' : <><CheckCircle2 size={12} /> 처리완료</>}
                  </button>
                </div>
              ))}
            </div>
      }

      {/* 처리완료된 항목 (토글) */}
      {showDone && done.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, fontWeight: 600 }}>처리완료 항목</div>
          {done.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border)', opacity: 0.7 }}>
              <span className={`badge ${SEV_BADGE[c.severity] ?? 'badge-low'}`} style={{ flexShrink: 0, marginTop: 1 }}>{c.severity}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{(c.content_ko ?? c.content ?? '').slice(0, 60)}...</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>{c.branch} · {c.ota_site} · ★{c.rating}</div>
              </div>
              {/* 되돌리기 버튼 */}
              <button onClick={e => handleUndo(e, c)} disabled={loading === c.id} title="미처리로 되돌리기"
                style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'var(--critical)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 11, fontWeight: 600, transition: 'all 0.15s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,59,92,0.2)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,59,92,0.1)' }}>
                {loading === c.id ? '...' : '↩ 되돌리기'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
