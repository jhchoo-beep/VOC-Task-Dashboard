'use client'
import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Star } from 'lucide-react'

// ─── 타입 ────────────────────────────────────────────────────────────────────
type ScoreHistory  = Record<string, Record<string, number[]>>
type ReviewHistory = Record<string, Record<string, number[]>>

interface OtaEntry { name: string; max: number; okr: number }

interface AgodaDistWeek { week: string; scores: number[]; avgScore?: number }
interface AgodaReviewRateWeek { week: string; reviewCount: number; checkoutCount: number; ratePct: number }

interface OtaData {
  branches:         string[]
  otaList:          OtaEntry[]
  dateLabels:       string[]
  scoreHistory:     ScoreHistory
  reviewHistory:    ReviewHistory
  agodaDist:        Record<string, AgodaDistWeek[]>
  agodaComplaints:  Record<string, { week: string; room: number; bathroom: number }[]>
  complaintMemos:   Record<string, string>
  agodaVoc:         Record<string, { band: string; sentiment: string; keyword: string }[]>
  agodaReviewRate:  Record<string, AgodaReviewRateWeek[]>
}

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────
function weekMonth(week: string): string { return week.substring(0, 2) } // "05/11" → "05"

function groupDistByMonth(rows: AgodaDistWeek[]): AgodaDistWeek[] {
  const map = new Map<string, { scores: number[]; totalReviews: number; weightedSum: number }>()
  rows.forEach(({ week, scores, avgScore }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { scores: new Array(9).fill(0), totalReviews: 0, weightedSum: 0 })
    const acc = map.get(m)!
    scores.forEach((v, i) => { acc.scores[i] += v })
    const cnt = scores.reduce((s, v) => s + v, 0)
    if (avgScore && avgScore > 0 && cnt > 0) {
      acc.totalReviews += cnt
      acc.weightedSum += avgScore * cnt
    }
  })
  return [...map.entries()].map(([m, { scores, totalReviews, weightedSum }]) => ({
    week: `${parseInt(m)}월`,
    scores,
    avgScore: totalReviews > 0 ? Math.round(weightedSum / totalReviews * 10) / 10 : undefined,
  }))
}

function groupComplaintsByMonth(rows: { week: string; room: number; bathroom: number }[]) {
  const map = new Map<string, { room: number; bathroom: number }>()
  rows.forEach(({ week, room, bathroom }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { room: 0, bathroom: 0 })
    const acc = map.get(m)!
    acc.room += room; acc.bathroom += bathroom
  })
  return [...map.entries()].map(([m, v]) => ({ week: `${parseInt(m)}월`, ...v }))
}

function groupReviewRateByMonth(rows: AgodaReviewRateWeek[]): AgodaReviewRateWeek[] {
  const map = new Map<string, { reviewCount: number; checkoutCount: number }>()
  rows.forEach(({ week, reviewCount, checkoutCount }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { reviewCount: 0, checkoutCount: 0 })
    const acc = map.get(m)!
    acc.reviewCount += reviewCount; acc.checkoutCount += checkoutCount
  })
  return [...map.entries()].map(([m, { reviewCount, checkoutCount }]) => ({
    week: `${parseInt(m)}월`, reviewCount, checkoutCount,
    ratePct: checkoutCount > 0 ? Math.round(reviewCount / checkoutCount * 1000) / 10 : 0,
  }))
}

// 히트맵 셀 배경색: 앱 다크 테마에 맞게 투명(낮음) → 밝은 틸-그린(높음)
function heatCellStyle(value: number, max: number): { background: string; color: string } {
  if (value <= 0 || max <= 0) return { background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)' }
  const r = Math.min(value / max, 1)
  const alpha = 0.12 + r * 0.78   // 0.12 → 0.90
  return {
    background: `rgba(0, 212, 160, ${alpha.toFixed(2)})`,
    color: r > 0.52 ? '#04211a' : 'var(--text-1)',
  }
}

// 주/월별 평균 점수 계산 (score_2=2점 ~ score_10=10점)
function calcWeekAvg(scores: number[]): number {
  let total = 0, count = 0
  scores.forEach((cnt, i) => { total += cnt * (i + 2); count += cnt })
  return count > 0 ? Math.round(total / count * 10) / 10 : 0
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
// 마지막 두 구간: score_9=9.x점, score_10=정확히 10점
const HEATMAP_BANDS = ['2점대','3점대','4점대','5점대','6점대','7점대','8점대','9~9.9점','10점']
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

const TOGGLE_BTN = (active: boolean) => ({
  padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
  background: active ? 'var(--accent)' : 'var(--bg-card)',
  color: active ? '#fff' : 'var(--text-2)',
  fontWeight: active ? 600 : 400,
} as const)

const SCORE_BANDS = [
  { label: '9~10점', color: 'var(--done)' },
  { label: '7~8점',  color: 'var(--accent)' },
  { label: '5~6점',  color: 'var(--medium)' },
  { label: '2~4점',  color: 'var(--critical)' },
]

function TabAgoda({ d }: { d: OtaData }) {
  const [branch, setBranch]         = useState(d.branches[0] ?? '신설')
  const [sub, setSub]               = useState<AgodaSubTab>('OKR')
  const [distViewMode, setDistView] = useState<'count' | 'ratio'>('count')
  const [timeMode, setTimeMode]     = useState<'weekly' | 'monthly'>('weekly')

  const agodaOTA     = d.otaList.find(o => o.name === 'Agoda') ?? { okr: 9.0, max: 10 }
  const scoreHist    = d.scoreHistory[branch]?.['Agoda'] ?? []
  const curScore     = scoreHist[scoreHist.length - 1] ?? 0
  const prevScore    = scoreHist[scoreHist.length - 2] ?? 0
  const totalReviews = (d.reviewHistory[branch]?.['Agoda'] ?? []).slice(-1)[0] ?? 0

  const scoreChartData = d.dateLabels.map((label, i) => ({
    month: label, 점수: scoreHist[i] ?? 0,
  })).filter(r => r.점수 > 0)

  // Score distribution — heatmap
  const distHistoryRaw = d.agodaDist[branch] ?? []
  const distHistory    = timeMode === 'monthly' ? groupDistByMonth(distHistoryRaw) : distHistoryRaw
  const heatmapMaxVal  = Math.max(
    ...distHistory.flatMap(({ scores }) => {
      const total = scores.reduce((s,v)=>s+v,0) || 1
      return distViewMode === 'ratio' ? scores.map(cnt => Math.round(cnt/total*1000)/10) : scores
    }), 1
  )

  // Complaints
  const complaintsRaw    = d.agodaComplaints[branch] ?? []
  const complaints       = timeMode === 'monthly' ? groupComplaintsByMonth(complaintsRaw) : complaintsRaw
  const baseRoom         = complaintsRaw.slice(0, 4).reduce((s,c)=>s+c.room,0) / Math.max(complaintsRaw.slice(0,4).length,1)
  const baseBath         = complaintsRaw.slice(0, 4).reduce((s,c)=>s+c.bathroom,0) / Math.max(complaintsRaw.slice(0,4).length,1)
  const latestComplaint  = complaintsRaw[complaintsRaw.length - 1]

  // Review rate
  const reviewRateRaw  = d.agodaReviewRate?.[branch] ?? []
  const reviewRate     = timeMode === 'monthly' ? groupReviewRateByMonth(reviewRateRaw) : reviewRateRaw
  const latestRate     = reviewRateRaw[reviewRateRaw.length - 1]

  const voc      = d.agodaVoc[branch] ?? []
  const allBands = [...new Set(voc.map(v => v.band))]

  const timeModeToggle = (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['weekly', 'monthly'] as const).map(m => (
        <button key={m} onClick={() => setTimeMode(m)} style={TOGGLE_BTN(timeMode === m)}>
          {m === 'weekly' ? '📅 주별' : '📅 월별'}
        </button>
      ))}
    </div>
  )

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
          { label: '현재 점수',   value: curScore ? curScore.toFixed(1) : '—', sub: `목표 ${agodaOTA.okr}+`, color: curScore ? scoreColor(curScore, agodaOTA.okr) : 'var(--text-3)' },
          { label: '전주 대비',   value: curScore && prevScore ? `${(curScore-prevScore)>=0?'+':''}${(curScore-prevScore).toFixed(1)}` : '—', sub: prevScore ? `이전 ${prevScore.toFixed(1)}` : '', color: curScore >= prevScore ? 'var(--done)' : 'var(--critical)' },
          { label: '리뷰 작성률', value: latestRate ? `${latestRate.ratePct}%` : '—', sub: latestRate ? `${latestRate.reviewCount}/${latestRate.checkoutCount}건` : '체크아웃 대비', color: 'var(--accent)' },
          { label: '누적 리뷰',   value: totalReviews.toLocaleString(), sub: '건', color: 'var(--text-2)' },
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Agoda 리뷰 작성률 추이 — {branch}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>체크아웃 고객 중 리뷰 작성 비율 (막대: 리뷰 건수, 선: 작성률)</div>
            </div>
            {timeModeToggle}
          </div>
          {reviewRate.length === 0
            ? (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 13, marginBottom: 6 }}>리뷰 작성률 데이터가 없습니다</div>
                <div style={{ fontSize: 11 }}>체크아웃 건수와 리뷰 건수를 매주 입력하면 작성률이 표시됩니다</div>
              </div>
            )
            : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={reviewRate} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--done)" tick={{ fontSize: 11 }}
                    tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any, name: any) => name === '작성률(%)' ? [`${v}%`, name] : [`${v}건`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="reviewCount" name="리뷰 건수" fill="var(--accent)" opacity={0.8} radius={[3,3,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="ratePct" name="작성률(%)" stroke="var(--done)"
                    strokeWidth={2.5} dot={{ fill: 'var(--done)', r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )
          }
        </div>
      )}

      {/* 점수 분포 — 히트맵 */}
      {sub === '점수 분포' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>점수 분포 히트맵 — {branch}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
              {timeModeToggle}
              <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 4px' }} />
              {(['ratio', 'count'] as const).map(v => (
                <button key={v} onClick={() => setDistView(v)} style={TOGGLE_BTN(distViewMode === v)}>
                  {v === 'ratio' ? '비율' : '건수'}
                </button>
              ))}
            </div>
          </div>

          {distHistory.length === 0
            ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 3, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-3)', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap', width: 64 }}>구간</th>
                      {distHistory.map(({ week }, wi) => (
                        <th key={week} style={{ textAlign: 'center', color: 'var(--text-3)', fontWeight: 500, fontSize: 10, paddingBottom: 6, minWidth: 56 }}>
                          {timeMode === 'weekly' ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 11 }}>W{wi + 1}</div>
                              <div style={{ fontSize: 10 }}>{week}</div>
                            </>
                          ) : week}
                        </th>
                      ))}
                    </tr>
                    {/* 평균 점수 행 */}
                    <tr>
                      <td style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-3)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', paddingBottom: 10 }}>
                        평균 점수
                      </td>
                      {distHistory.map(({ week, scores, avgScore }) => {
                        const avg = avgScore && avgScore > 0 ? avgScore : calcWeekAvg(scores)
                        return (
                          <td key={week} style={{ paddingBottom: 10 }}>
                            <div style={{
                              textAlign: 'center', borderRadius: 8, padding: '6px 4px',
                              background: avg > 0 ? scoreBg(avg, agodaOTA.okr) : 'var(--bg-card)',
                              border: avg > 0 ? `1px solid ${scoreColor(avg, agodaOTA.okr)}40` : '1px solid var(--border)',
                              color: avg > 0 ? scoreColor(avg, agodaOTA.okr) : 'var(--text-3)',
                              fontWeight: 700, fontSize: 13,
                            }}>
                              {avg > 0 ? avg.toFixed(1) : '—'}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {HEATMAP_BANDS.map((label, bandIdx) => (
                      <tr key={label}>
                        <td style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-3)', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', paddingBottom: 3 }}>
                          {label}
                        </td>
                        {distHistory.map(({ week, scores }) => {
                          const total = scores.reduce((s,v)=>s+v,0) || 1
                          const raw = scores[bandIdx] ?? 0
                          const display = distViewMode === 'ratio' ? Math.round(raw/total*1000)/10 : raw
                          const { background, color } = heatCellStyle(display, heatmapMaxVal)
                          return (
                            <td key={week} style={{
                              textAlign: 'center', borderRadius: 6, padding: '7px 4px',
                              background, color, fontWeight: display > 0 ? 600 : 400,
                              fontSize: 11, transition: 'background 0.2s',
                            }}>
                              {display > 0 ? (distViewMode === 'ratio' ? `${display}%` : `${display}`) : '0'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          {/* 범례 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 11, color: 'var(--text-3)' }}>
            <span>낮음</span>
            <div style={{
              width: 120, height: 10, borderRadius: 5,
              background: 'linear-gradient(to right, rgba(0,212,160,0.12), rgba(0,212,160,0.5), rgba(0,212,160,0.9))',
            }} />
            <span>높음</span>
            <span style={{ marginLeft: 8 }}>색이 진할수록 해당 구간 비율이 높음</span>
          </div>
        </div>
      )}

      {/* 불만 분석 */}
      {sub === '불만 분석' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>주간 불만 추이 — {branch}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>점선: 초기 4주 평균 기준선</div>
              </div>
              {timeModeToggle}
            </div>
            {complaints.length === 0
              ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
              : <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={complaints} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, name: any) => [`${v}건`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {timeMode === 'weekly' && baseRoom > 0 && (
                      <ReferenceLine y={Math.round(baseRoom*10)/10} stroke="var(--high)" strokeDasharray="6 3" opacity={0.5}
                        label={{ value: '기준', fill: 'var(--high)', fontSize: 9, position: 'insideTopRight' }} />
                    )}
                    {timeMode === 'weekly' && baseBath > 0 && (
                      <ReferenceLine y={Math.round(baseBath*10)/10} stroke="var(--critical)" strokeDasharray="6 3" opacity={0.5} />
                    )}
                    <Line type="monotone" dataKey="room" name="객실 불만" stroke="var(--high)" strokeWidth={2.5}
                      dot={{ fill: 'var(--high)', r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="bathroom" name="욕실 불만" stroke="var(--critical)" strokeWidth={2.5}
                      dot={{ fill: 'var(--critical)', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
            }
          </div>

          {complaintsRaw.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>이번 주 현황</div>
                {latestComplaint && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    {[
                      { label: '객실 불만', value: latestComplaint.room,     color: 'var(--high)',     bg: 'rgba(255,155,59,0.1)' },
                      { label: '욕실 불만', value: latestComplaint.bathroom, color: 'var(--critical)', bg: 'rgba(255,59,92,0.1)' },
                    ].map(item => (
                      <div key={item.label} style={{ flex: 1, padding: '12px 14px', background: item.bg, borderRadius: 10, textAlign: 'center', border: `1px solid ${item.color}30` }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { label: '총 객실 불만', value: complaintsRaw.reduce((s,c)=>s+c.room,0), color: 'var(--high)' },
                    { label: '총 욕실 불만', value: complaintsRaw.reduce((s,c)=>s+c.bathroom,0), color: 'var(--critical)' },
                    { label: '주간 평균', value: (complaintsRaw.reduce((s,c)=>s+c.room+c.bathroom,0)/complaintsRaw.length).toFixed(1), color: 'var(--medium)', unit: '건/주' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}<span style={{ fontSize: 11, fontWeight: 400 }}>{(item as any).unit ?? '건'}</span></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>운영 메모</div>
                {d.complaintMemos[branch]
                  ? <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.8 }}>
                      {d.complaintMemos[branch]}
                    </div>
                  : <div style={{ fontSize: 12, color: 'var(--text-3)' }}>메모 없음</div>
                }
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
  recordedAt?:       string
  scoreHistory?:     ScoreHistory
  reviewHistory?:    ReviewHistory
  dateLabels?:       string[]
  otaList?:          OtaEntry[]
  agodaDist?:        Record<string, AgodaDistWeek[]>
  agodaComplaints?:  Record<string, { week: string; room: number; bathroom: number }[]>
  complaintMemos?:   Record<string, string>
  agodaVoc?:         Record<string, { band: string; sentiment: string; keyword: string }[]>
  agodaReviewRate?:  Record<string, AgodaReviewRateWeek[]>
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
  agodaReviewRate = {},
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
    agodaReviewRate,
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
