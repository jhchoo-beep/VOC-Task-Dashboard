'use client'
import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Star } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────────────────────
type ScoreHistory  = Record<string, Record<string, number[]>>
type ReviewHistory = Record<string, Record<string, number[]>>

interface OtaEntry { name: string; max: number; okr: number }

interface AgodaDistWeek { week: string; scores: number[] }

interface OtaData {
  branches:        string[]
  otaList:         OtaEntry[]
  dateLabels:      string[]
  scoreHistory:    ScoreHistory
  reviewHistory:   ReviewHistory
  agodaDist:       Record<string, AgodaDistWeek[]>
  agodaComplaints: Record<string, { week: string; room: number; bathroom: number }[]>
  complaintMemos:  Record<string, string>
  agodaVoc:        Record<string, { band: string; sentiment: string; keyword: string }[]>
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const BRANCH_BADGE: Record<string, string> = {
  신설: 'badge-sinseol', 동대문: 'badge-ddm', 제주시티: 'badge-jeju', 고성: 'badge-goseong',
}
const BRANCH_COLOR: Record<string, string> = {
  신설: '#00D4A0', 동대문: '#9B6FFF', 제주시티: '#00C9E0', 고성: '#FF9B3B',
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
function scoreColor(score: number, okr: number) {
  if (score >= okr)        return 'var(--done)'
  if (score >= okr - 0.5) return 'var(--medium)'
  return 'var(--critical)'
}
function scoreBg(score: number, okr: number) {
  if (score >= okr)        return 'rgba(0,229,102,0.08)'
  if (score >= okr - 0.5) return 'rgba(245,200,66,0.08)'
  return 'rgba(255,59,92,0.08)'
}
function TrendBadge({ cur, prev }: { cur: number; prev: number }) {
  const d = Math.round((cur - prev) * 10) / 10
  if (d === 0) return <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2 }}><Minus size={9} /> 유지</span>
  return (
    <span style={{ fontSize: 10, color: d > 0 ? 'var(--done)' : 'var(--critical)', display: 'flex', alignItems: 'center', gap: 2 }}>
      {d > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {d > 0 ? '+' : ''}{d.toFixed(1)}
    </span>
  )
}

const INNER_TABS = ['종합 현황', 'OKR 트래커', 'OTA 추이', 'Agoda 상세'] as const
type InnerTab = typeof INNER_TABS[number]

// ════════════════════════════════════════════════════════════════════════════
// 탭 1 — 종합 현황
// ════════════════════════════════════════════════════════════════════════════
function TabOverview({ d, recordedAt }: { d: OtaData; recordedAt: string }) {
  return (
    <div>
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          📊 지점 × OTA 현재 점수 (기준일: {recordedAt})
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 18px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>OTA / 만점</th>
                {d.branches.map(b => (
                  <th key={b} style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 600, fontSize: 11 }}>
                    <span className={`badge ${BRANCH_BADGE[b]}`} style={{ fontSize: 10 }}>{b}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.otaList.map(({ name, max, okr }) => (
                <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>/{max}점 · OKR {okr}+</div>
                  </td>
                  {d.branches.map(b => {
                    const hist    = d.scoreHistory[b]?.[name] ?? []
                    const revHist = d.reviewHistory[b]?.[name] ?? []
                    const cur     = hist[hist.length - 1] ?? 0
                    const prev    = hist[hist.length - 2] ?? 0
                    const reviews = revHist[revHist.length - 1] ?? 0
                    if (!cur) return <td key={b} style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>—</td>
                    return (
                      <td key={b} style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                          padding: '7px 14px', borderRadius: 8,
                          background: scoreBg(cur, okr), border: `1px solid ${scoreColor(cur, okr)}28`, minWidth: 68,
                        }}>
                          <span className="font-display" style={{ fontSize: 18, fontWeight: 800, color: scoreColor(cur, okr), lineHeight: 1 }}>
                            {cur.toFixed(1)}
                          </span>
                          <TrendBadge cur={cur} prev={prev} />
                          <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{reviews.toLocaleString()}건</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 지점별 OKR 달성 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {d.branches.map(b => {
          const achieved = d.otaList.filter(({ name, okr }) => {
            const hist = d.scoreHistory[b]?.[name] ?? []
            const cur = hist[hist.length - 1] ?? 0
            return cur > 0 && cur >= okr
          }).length
          const total = d.otaList.filter(({ name }) => {
            const hist = d.scoreHistory[b]?.[name] ?? []
            return (hist[hist.length - 1] ?? 0) > 0
          }).length
          const pct = total > 0 ? Math.round(achieved / total * 100) : 0
          return (
            <div key={b} className="card" style={{ padding: '16px 18px' }}>
              <span className={`badge ${BRANCH_BADGE[b]}`} style={{ fontSize: 10, marginBottom: 10, display: 'inline-block' }}>{b}</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: pct === 100 ? 'var(--done)' : pct >= 60 ? 'var(--medium)' : 'var(--critical)' }}>
                {achieved}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-3)' }}>/{total}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>OKR 달성 OTA</div>
              <div className="progress">
                <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--done)' : pct >= 60 ? 'var(--medium)' : 'var(--critical)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 탭 2 — OKR 트래커
// ════════════════════════════════════════════════════════════════════════════
function TabOKR({ d }: { d: OtaData }) {
  const [selBranch, setSelBranch] = useState(d.branches[0] ?? '신설')
  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 18 }}>🎯 전체 OKR 달성 현황</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {d.otaList.map(({ name, okr, max }) => (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{name} <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>목표 {okr}/{max}</span></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {d.branches.map(b => {
                    const hist = d.scoreHistory[b]?.[name] ?? []
                    const cur = hist[hist.length - 1] ?? 0
                    if (!cur) return null
                    const met = cur >= okr
                    return (
                      <span key={b} style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: met ? 'rgba(0,229,102,0.12)' : 'rgba(255,59,92,0.1)',
                        color: met ? 'var(--done)' : 'var(--critical)',
                        border: `1px solid ${met ? 'rgba(0,229,102,0.25)' : 'rgba(255,59,92,0.2)'}`,
                      }}>
                        {b} {cur.toFixed(1)}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${d.branches.length},1fr)`, gap: 8 }}>
                {d.branches.map(b => {
                  const hist = d.scoreHistory[b]?.[name] ?? []
                  const cur = hist[hist.length - 1] ?? 0
                  if (!cur) return <div key={b} style={{ opacity: 0.2, fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28 }}>미운영</div>
                  const pct = Math.min((cur / okr) * 100, 100)
                  const gap = Math.round((cur - okr) * 10) / 10
                  return (
                    <div key={b}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10 }}>
                        <span style={{ color: 'var(--text-3)' }}>{b}</span>
                        <span style={{ color: gap >= 0 ? 'var(--done)' : 'var(--critical)', fontWeight: 600 }}>
                          {gap >= 0 ? '✓' : `${gap.toFixed(1)}`}
                        </span>
                      </div>
                      <div className="progress" style={{ height: 6 }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: scoreColor(cur, okr), borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 지점별 상세 OKR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {d.branches.map(b => (
          <button key={b} onClick={() => setSelBranch(b)}
            className={selBranch === b ? `badge ${BRANCH_BADGE[b]}` : 'badge'}
            style={{ cursor: 'pointer', border: 'none', fontSize: 11, padding: '4px 10px', opacity: selBranch === b ? 1 : 0.5 }}>
            {b}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {d.otaList.map(({ name, okr, max }) => {
          const hist = d.scoreHistory[selBranch]?.[name] ?? []
          const cur  = hist[hist.length - 1] ?? 0
          const prev = hist[hist.length - 2] ?? 0
          if (!cur) return (
            <div key={name} className="card" style={{ padding: '14px 16px', opacity: 0.4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>미운영</div>
            </div>
          )
          const met = cur >= okr
          const gap = Math.round((cur - okr) * 10) / 10
          const pct = Math.min(Math.round(cur / okr * 100), 100)
          return (
            <div key={name} className="card" style={{ padding: '14px 16px', borderColor: met ? 'rgba(0,229,102,0.25)' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>목표 {okr}/{max}</div>
                </div>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10,
                  background: met ? 'rgba(0,229,102,0.12)' : 'rgba(255,59,92,0.1)',
                  color: met ? 'var(--done)' : 'var(--critical)' }}>
                  {met ? '✓ 달성' : `${gap.toFixed(1)}`}
                </span>
              </div>
              <div className="font-display" style={{ fontSize: 26, fontWeight: 800, color: scoreColor(cur, okr), lineHeight: 1, marginBottom: 4 }}>
                {cur.toFixed(1)}
              </div>
              <TrendBadge cur={cur} prev={prev} />
              <div className="progress" style={{ marginTop: 10 }}>
                <div className="progress-fill" style={{ width: `${pct}%`, background: scoreColor(cur, okr), borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{pct}% of OKR</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 탭 3 — OTA 추이
// ════════════════════════════════════════════════════════════════════════════
function TabTrend({ d }: { d: OtaData }) {
  const [selOTA, setSelOTA]     = useState(d.otaList[0]?.name ?? 'Agoda')
  const [viewMode, setViewMode] = useState<'score' | 'reviews'>('score')

  const { okr } = d.otaList.find(o => o.name === selOTA) ?? { okr: 9.0 }

  const scoreChartData = d.dateLabels.map((label, i) => {
    const entry: any = { month: label }
    d.branches.forEach(b => {
      const v = d.scoreHistory[b]?.[selOTA]?.[i] ?? 0
      if (v > 0) entry[b] = v
    })
    return entry
  })

  const reviewChartData = d.dateLabels.map((label, i) => {
    const entry: any = { month: label }
    d.branches.forEach(b => {
      const v = d.reviewHistory[b]?.[selOTA]?.[i] ?? 0
      if (v > 0) entry[b] = v
    })
    return entry
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {d.otaList.map(o => (
            <button key={o.name} onClick={() => setSelOTA(o.name)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                background: selOTA === o.name ? 'var(--accent)' : 'var(--bg-card)',
                color: selOTA === o.name ? '#fff' : 'var(--text-2)',
                fontWeight: selOTA === o.name ? 600 : 400,
              }}>
              {o.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['score', 'reviews'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                background: viewMode === v ? 'var(--bg-card)' : 'transparent',
                color: viewMode === v ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: viewMode === v ? 600 : 400,
              }}>
              {v === 'score' ? '📈 평점 추이' : '📊 리뷰 수 추이'}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'score' && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
            {selOTA} 지점별 평점 추이
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>점선: OKR 목표 {okr}점</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={scoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--text-1)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => <span style={{ color: BRANCH_COLOR[v] }}>{v}</span>} />
              <ReferenceLine y={okr} stroke="rgba(255,255,255,0.2)" strokeDasharray="6 3" label={{ value: `OKR ${okr}`, fill: 'var(--text-3)', fontSize: 10, position: 'right' }} />
              {d.branches.map(b => (
                <Line key={b} type="monotone" dataKey={b}
                  stroke={BRANCH_COLOR[b]} strokeWidth={2}
                  dot={{ fill: BRANCH_COLOR[b], r: 4 }} activeDot={{ r: 6 }}
                  connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {viewMode === 'reviews' && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 20 }}>
            {selOTA} 누적 리뷰 수 추이
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={reviewChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--text-1)' }} formatter={(v: any) => [`${v.toLocaleString()}건`, '']} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => <span style={{ color: BRANCH_COLOR[v] }}>{v}</span>} />
              {d.branches.map(b => (
                <Line key={b} type="monotone" dataKey={b}
                  stroke={BRANCH_COLOR[b]} strokeWidth={2}
                  dot={{ fill: BRANCH_COLOR[b], r: 4 }} activeDot={{ r: 6 }}
                  connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 전 OTA 스냅샷 미니카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {d.otaList.map(({ name, okr: o }) => (
          <div key={name} className="card" style={{ padding: '12px 14px', cursor: 'pointer', borderColor: name === selOTA ? 'var(--accent)' : undefined }}
            onClick={() => setSelOTA(name)}>
            <div style={{ fontSize: 11, fontWeight: 600, color: name === selOTA ? 'var(--accent)' : 'var(--text-2)', marginBottom: 8 }}>{name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {d.branches.map(b => {
                const hist = d.scoreHistory[b]?.[name] ?? []
                const cur = hist[hist.length - 1] ?? 0
                if (!cur) return null
                return (
                  <div key={b} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{b}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(cur, o) }}>{cur.toFixed(1)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 탭 4 — Agoda 상세
// ════════════════════════════════════════════════════════════════════════════
type AgodaSubTab = 'OKR' | '리뷰 작성률' | '점수 분포' | '불만 분석' | 'VOC'

function TabAgoda({ d }: { d: OtaData }) {
  const [branch, setBranch]         = useState(d.branches[0] ?? '신설')
  const [sub, setSub]               = useState<AgodaSubTab>('OKR')
  const [distViewMode, setDistView] = useState<'count' | 'ratio'>('count')

  const agodaOTA   = d.otaList.find(o => o.name === 'Agoda') ?? { okr: 9.0, max: 10 }
  const scoreHist  = d.scoreHistory[branch]?.['Agoda'] ?? []
  const curScore   = scoreHist[scoreHist.length - 1] ?? 0
  const prevScore  = scoreHist[scoreHist.length - 2] ?? 0
  const totalReviews = (d.reviewHistory[branch]?.['Agoda'] ?? []).slice(-1)[0] ?? 0

  const scoreChartData = d.dateLabels.map((label, i) => ({
    month: label, 점수: scoreHist[i] ?? 0,
  })).filter(r => r.점수 > 0)

  const distHistory   = d.agodaDist[branch] ?? []
  const latestScores  = distHistory[distHistory.length - 1]?.scores ?? []
  const distData      = latestScores.map((cnt, i) => ({ score: `${i + 2}점`, 건수: cnt }))
  const latestDistWeek = distHistory[distHistory.length - 1]
  const SCORE_BANDS = [
    { label: '9~10점', color: 'var(--done)' },
    { label: '7~8점',  color: 'var(--accent)' },
    { label: '5~6점',  color: 'var(--medium)' },
    { label: '2~4점',  color: 'var(--critical)' },
  ]
  const trendData = distHistory.map(({ week, scores }) => {
    const bad  = (scores[0] ?? 0) + (scores[1] ?? 0) + (scores[2] ?? 0)
    const low  = (scores[3] ?? 0) + (scores[4] ?? 0)
    const mid  = (scores[5] ?? 0) + (scores[6] ?? 0)
    const high = (scores[7] ?? 0) + (scores[8] ?? 0)
    const total = bad + low + mid + high || 1
    return distViewMode === 'ratio'
      ? { week, '9~10점': Math.round(high/total*100), '7~8점': Math.round(mid/total*100), '5~6점': Math.round(low/total*100), '2~4점': Math.round(bad/total*100) }
      : { week, '9~10점': high, '7~8점': mid, '5~6점': low, '2~4점': bad }
  })

  const complaints = d.agodaComplaints[branch] ?? []
  const voc        = d.agodaVoc[branch] ?? []
  const allBands   = [...new Set(voc.map(v => v.band))]

  return (
    <div>
      {/* 지점 선택 + 서브탭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {d.branches.map(b => (
            <button key={b} onClick={() => setBranch(b)}
              className={branch === b ? `badge ${BRANCH_BADGE[b]}` : 'badge'}
              style={{ cursor: 'pointer', border: 'none', fontSize: 11, padding: '4px 10px', opacity: branch === b ? 1 : 0.5 }}>
              {b}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['OKR', '리뷰 작성률', '점수 분포', '불만 분석', 'VOC'] as AgodaSubTab[]).map(t => (
            <button key={t} onClick={() => setSub(t)}
              style={{
                padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
                background: sub === t ? 'var(--accent)' : 'var(--bg-card)',
                color: sub === t ? '#fff' : 'var(--text-2)',
                fontWeight: sub === t ? 600 : 400,
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 상단 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: '현재 점수',  value: curScore ? curScore.toFixed(1) : '—', sub: `목표 ${agodaOTA.okr}+`, color: curScore ? scoreColor(curScore, agodaOTA.okr) : 'var(--text-3)' },
          { label: '전주 대비',  value: curScore && prevScore ? `${(curScore - prevScore) >= 0 ? '+' : ''}${(curScore - prevScore).toFixed(1)}` : '—', sub: prevScore ? `이전 ${prevScore.toFixed(1)}` : '', color: curScore >= prevScore ? 'var(--done)' : 'var(--critical)' },
          { label: '리뷰 작성률', value: '—', sub: '체크아웃 대비', color: 'var(--accent)' },
          { label: '누적 리뷰',  value: totalReviews.toLocaleString(), sub: '건', color: 'var(--text-2)' },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{item.label}</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* OKR */}
      {sub === 'OKR' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 20 }}>Agoda 평점 추이 — {branch}</div>
          {scoreChartData.length < 2
            ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
            : <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={scoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={agodaOTA.okr} stroke="rgba(0,229,102,0.4)" strokeDasharray="6 3"
                    label={{ value: `OKR ${agodaOTA.okr}`, fill: 'var(--done)', fontSize: 10, position: 'right' }} />
                  <Line type="monotone" dataKey="점수" stroke={BRANCH_COLOR[branch] ?? 'var(--accent)'} strokeWidth={2.5}
                    dot={{ fill: BRANCH_COLOR[branch] ?? 'var(--accent)', r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {scoreChartData.map((p, i) => (
                  <div key={i} style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, textAlign: 'center',
                    background: p.점수 >= agodaOTA.okr ? 'rgba(0,229,102,0.1)' : 'rgba(255,59,92,0.08)',
                    border: `1px solid ${p.점수 >= agodaOTA.okr ? 'rgba(0,229,102,0.25)' : 'rgba(255,59,92,0.2)'}`,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{p.month}</div>
                    <div style={{ fontWeight: 700, color: p.점수 >= agodaOTA.okr ? 'var(--done)' : 'var(--critical)' }}>{p.점수.toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: p.점수 >= agodaOTA.okr ? 'var(--done)' : 'var(--critical)' }}>
                      {p.점수 >= agodaOTA.okr ? '✓' : `${(p.점수 - agodaOTA.okr).toFixed(1)}`}
                    </div>
                  </div>
                ))}
              </div>
            </>
          }
        </div>
      )}

      {/* 리뷰 작성률 */}
      {sub === '리뷰 작성률' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Agoda 리뷰 작성률 — {branch}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>체크아웃 고객 중 Agoda 리뷰를 작성한 비율</div>
          <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>리뷰 작성률 데이터 수집 예정</div>
        </div>
      )}

      {/* 점수 분포 */}
      {sub === '점수 분포' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 주별 점수대 추이 */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Agoda 점수대별 주별 추이 — {branch}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>주차별 점수 구간 리뷰 분포</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['count', 'ratio'] as const).map(v => (
                  <button key={v} onClick={() => setDistView(v)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                      background: distViewMode === v ? 'var(--accent)' : 'var(--bg-card)',
                      color: distViewMode === v ? '#fff' : 'var(--text-2)',
                      fontWeight: distViewMode === v ? 600 : 400,
                    }}>
                    {v === 'count' ? '📊 건수' : '📈 비율(%)'}
                  </button>
                ))}
              </div>
            </div>
            {trendData.length === 0
              ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
              : <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false}
                      tickFormatter={distViewMode === 'ratio' ? (v: number) => `${v}%` : (v: number) => `${v}`} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, name: any) => [distViewMode === 'ratio' ? `${v}%` : `${v}건`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="2~4점" stackId="a" fill="var(--critical)" />
                    <Bar dataKey="5~6점" stackId="a" fill="var(--medium)" />
                    <Bar dataKey="7~8점" stackId="a" fill="var(--accent)" />
                    <Bar dataKey="9~10점" stackId="a" fill="var(--done)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
            }
          </div>

          {/* 최근 주 세부 분포 */}
          {latestDistWeek && (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                이번 주 점수별 세부 분포 — {latestDistWeek.week}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>각 점수(2~10점)에 리뷰가 몇 건씩 들어왔는지</div>
              {distData.length === 0
                ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
                : <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="score" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                        formatter={(v: any) => [`${v}건`, '리뷰 수']} />
                      <Bar dataKey="건수" radius={[4,4,0,0]}>
                        {distData.map((_, i) => (
                          <Cell key={i} fill={i >= 7 ? 'var(--done)' : i >= 5 ? 'var(--accent)' : i >= 3 ? 'var(--medium)' : 'var(--critical)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              }
              <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {SCORE_BANDS.map(({ label, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                    <span style={{ color: 'var(--text-3)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 불만 분석 */}
      {sub === '불만 분석' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>⚠️ 주간 불만 추이 — {branch}</div>
              {complaints.length === 0
                ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
                : <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={complaints} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="var(--text-3)" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="room" name="객실 불만" stackId="a" fill="var(--high)" />
                      <Bar dataKey="bathroom" name="욕실 불만" stackId="a" fill="var(--critical)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
              }
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>이번 주 불만 현황</div>
              {complaints.length === 0
                ? <div style={{ color: 'var(--text-3)', fontSize: 13 }}>데이터 없음</div>
                : <>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    {[
                      { label: '객실 불만', value: complaints[complaints.length-1].room,     color: 'var(--high)',     bg: 'rgba(255,155,59,0.1)' },
                      { label: '욕실 불만', value: complaints[complaints.length-1].bathroom, color: 'var(--critical)', bg: 'rgba(255,59,92,0.1)' },
                    ].map(item => (
                      <div key={item.label} style={{ flex: 1, padding: '12px 14px', background: item.bg, borderRadius: 10, textAlign: 'center', border: `1px solid ${item.color}30` }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {d.complaintMemos[branch] && (
                    <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.7 }}>
                      {d.complaintMemos[branch]}
                    </div>
                  )}
                </>
              }
            </div>
          </div>
          {complaints.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>누적 불만 요약</div>
              <div style={{ display: 'flex', gap: 16 }}>
                {[
                  { label: '총 객실 불만', value: complaints.reduce((s,c) => s+c.room, 0), color: 'var(--high)' },
                  { label: '총 욕실 불만', value: complaints.reduce((s,c) => s+c.bathroom, 0), color: 'var(--critical)' },
                  { label: '주간 평균', value: ((complaints.reduce((s,c) => s+c.room+c.bathroom, 0)) / complaints.length).toFixed(1), color: 'var(--medium)', unit: '건/주' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.label}</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}<span style={{ fontSize: 12, fontWeight: 400 }}>{(item as any).unit ?? '건'}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VOC */}
      {sub === 'VOC' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>💬 VOC 키워드 — {branch} Agoda</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>점수대별 긍정/부정 키워드 분석 (최근 기록)</div>
          {voc.length === 0
            ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
            : allBands.map(band => {
              const items = voc.filter(v => v.band === band)
              const good  = items.filter(v => v.sentiment === 'good')
              const bad   = items.filter(v => v.sentiment === 'bad')
              return (
                <div key={band} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {band}
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: good.length && bad.length ? '1fr 1fr' : '1fr', gap: 12 }}>
                    {good.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--done)', fontWeight: 600, marginBottom: 6 }}>👍 좋아요</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {good.map((v, i) => (
                            <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,229,102,0.08)', border: '1px solid rgba(0,229,102,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' }}>
                              {v.keyword}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {bad.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--critical)', fontWeight: 600, marginBottom: 6 }}>👎 나빠요</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {bad.map((v, i) => (
                            <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' }}>
                              {v.keyword}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          }
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ════════════════════════════════════════════════════════════════════════════
interface OtaScoresClientProps {
  recordedAt?:      string
  scoreHistory?:    ScoreHistory
  reviewHistory?:   ReviewHistory
  dateLabels?:      string[]
  otaList?:         OtaEntry[]
  agodaDist?:       Record<string, AgodaDistWeek[]>
  agodaComplaints?: Record<string, { week: string; room: number; bathroom: number }[]>
  complaintMemos?:  Record<string, string>
  agodaVoc?:        Record<string, { band: string; sentiment: string; keyword: string }[]>
}

export default function OtaScoresClient({
  recordedAt      = '2026-05-18',
  scoreHistory    = {},
  reviewHistory   = {},
  dateLabels      = [],
  otaList         = [],
  agodaDist       = {},
  agodaComplaints = {},
  complaintMemos  = {},
  agodaVoc        = {},
}: OtaScoresClientProps) {
  const [tab, setTab] = useState<InnerTab>('종합 현황')

  const branches = [...new Set([
    ...Object.keys(scoreHistory),
    ...Object.keys(agodaDist),
    ...Object.keys(agodaComplaints),
    ...Object.keys(agodaVoc),
  ])].filter(b => ['신설','동대문','제주시티','고성'].includes(b))
    .sort((a, b) => ['신설','동대문','제주시티','고성'].indexOf(a) - ['신설','동대문','제주시티','고성'].indexOf(b))

  const data: OtaData = {
    branches,
    otaList:         otaList.length > 0 ? otaList : [
      { name: 'Agoda', max: 10, okr: 9.0 }, { name: 'Booking', max: 10, okr: 9.0 },
      { name: 'Trip.com', max: 10, okr: 9.0 }, { name: 'Expedia', max: 10, okr: 9.0 },
      { name: '여기어때', max: 10, okr: 9.0 }, { name: 'Airbnb', max: 5, okr: 4.5 },
      { name: 'NOL', max: 5, okr: 4.5 },
    ],
    dateLabels,
    scoreHistory,
    reviewHistory,
    agodaDist,
    agodaComplaints,
    complaintMemos,
    agodaVoc,
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Star size={20} color="var(--medium)" />
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>OTA 현황</h1>
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
          OTA 플랫폼 점수 · OKR 달성 추이 · Agoda 심층 분석
          <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>기준일: {recordedAt}</span>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {INNER_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--text-1)' : 'var(--text-3)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>
            {t === '종합 현황' && '📊 '}
            {t === 'OKR 트래커' && '🎯 '}
            {t === 'OTA 추이'   && '📈 '}
            {t === 'Agoda 상세' && '🔍 '}
            {t}
          </button>
        ))}
      </div>

      {/* OKR 기준 안내 */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '8px 16px', background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.15)', borderRadius: 8, fontSize: 11, flexWrap: 'wrap' }}>
        {[['var(--done)','OKR 달성','10점 ≥ 9.0 · 5점 ≥ 4.5'],['var(--medium)','근접','OKR -0.5 이내'],['var(--critical)','미달','OKR -0.5 초과']].map(([color, label, desc]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ color: color as string, fontWeight: 600 }}>{label}</span>
            <span style={{ color: 'var(--text-3)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {tab === '종합 현황' && <TabOverview d={data} recordedAt={recordedAt} />}
      {tab === 'OKR 트래커' && <TabOKR d={data} />}
      {tab === 'OTA 추이'   && <TabTrend d={data} />}
      {tab === 'Agoda 상세' && <TabAgoda d={data} />}
    </div>
  )
}
