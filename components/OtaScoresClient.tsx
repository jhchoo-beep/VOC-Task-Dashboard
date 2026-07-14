'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  buildTrendRows, rollupMonthly, drilldownMonths, INTEGRATED,
  type TrendRow,
} from '@/lib/otaTrend'

// ─── 타입 ────────────────────────────────────────────────────────────────────
type ScoreHistory  = Record<string, Record<string, number[]>>
type ReviewHistory = Record<string, Record<string, number[]>>
type ModalMode = 'basic' | 'review-rate' | 'score-dist' | 'complaints' | 'voc'

interface OtaEntry { name: string; max: number; okr: number }
interface AgodaDistWeek { week: string; scores: number[]; avgScore?: number }
interface AgodaReviewRateWeek { week: string; reviewCount: number; checkoutCount: number; ratePct: number }
type ViewState = { type: 'overview' } | { type: 'detail'; branch: string; ota: string }

interface OtaData {
  branches:        string[]
  otaList:         OtaEntry[]
  dateLabels:      string[]
  scoreHistory:    ScoreHistory
  reviewHistory:   ReviewHistory
  agodaDist:       Record<string, AgodaDistWeek[]>
  agodaComplaints: Record<string, { week: string; room: number; bathroom: number }[]>
  complaintMemos:  Record<string, string>
  agodaVoc:        Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]>
  agodaReviewRate: Record<string, AgodaReviewRateWeek[]>
}

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────
function weekMonth(week: string): string { return week.substring(0, 2) }

function groupDistByMonth(rows: AgodaDistWeek[]): AgodaDistWeek[] {
  const map = new Map<string, { scores: number[]; totalReviews: number; weightedSum: number }>()
  rows.forEach(({ week, scores, avgScore }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { scores: new Array(9).fill(0), totalReviews: 0, weightedSum: 0 })
    const acc = map.get(m)!
    scores.forEach((v, i) => { acc.scores[i] += v })
    const cnt = scores.reduce((s, v) => s + v, 0)
    if (avgScore && avgScore > 0 && cnt > 0) { acc.totalReviews += cnt; acc.weightedSum += avgScore * cnt }
  })
  return [...map.entries()].map(([m, { scores, totalReviews, weightedSum }]) => ({
    week: `${parseInt(m)}월`, scores,
    avgScore: totalReviews > 0 ? Math.round(weightedSum / totalReviews * 10) / 10 : undefined,
  }))
}

function groupComplaintsByMonth(rows: { week: string; room: number; bathroom: number }[]) {
  const map = new Map<string, { room: number; bathroom: number }>()
  rows.forEach(({ week, room, bathroom }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { room: 0, bathroom: 0 })
    const acc = map.get(m)!; acc.room += room; acc.bathroom += bathroom
  })
  return [...map.entries()].map(([m, v]) => ({ week: `${parseInt(m)}월`, ...v }))
}

function groupReviewRateByMonth(rows: AgodaReviewRateWeek[]): AgodaReviewRateWeek[] {
  const map = new Map<string, { reviewCount: number; checkoutCount: number }>()
  rows.forEach(({ week, reviewCount, checkoutCount }) => {
    const m = weekMonth(week)
    if (!map.has(m)) map.set(m, { reviewCount: 0, checkoutCount: 0 })
    const acc = map.get(m)!; acc.reviewCount += reviewCount; acc.checkoutCount += checkoutCount
  })
  return [...map.entries()].map(([m, { reviewCount, checkoutCount }]) => ({
    week: `${parseInt(m)}월`, reviewCount, checkoutCount,
    ratePct: checkoutCount > 0 ? Math.round(reviewCount / checkoutCount * 1000) / 10 : 0,
  }))
}

function heatCellStyle(value: number, max: number): { background: string; color: string } {
  if (value <= 0 || max <= 0) return { background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)' }
  const r = Math.min(value / max, 1); const alpha = 0.12 + r * 0.78
  return { background: `rgba(0, 212, 160, ${alpha.toFixed(2)})`, color: r > 0.52 ? '#04211a' : 'var(--text-1)' }
}

function calcWeekAvg(scores: number[]): number {
  let total = 0, count = 0
  scores.forEach((cnt, i) => { total += cnt * (i + 2); count += cnt })
  return count > 0 ? Math.round(total / count * 10) / 10 : 0
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const HEATMAP_BANDS = ['2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점']
const BRANCH_ORDER = ['신설','동대문','제주시티','고성']
const OTA_ORDER    = ['Agoda','Booking','Trip.com','Expedia','여기어때','Airbnb','NOL']
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

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'var(--text-1)' },
}
const TOGGLE_BTN = (active: boolean) => ({
  padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
  background: active ? 'var(--accent)' : 'var(--bg-card)',
  color: active ? '#fff' : 'var(--text-2)', fontWeight: active ? 600 : 400,
} as const)

// ════════════════════════════════════════════════════════════════════════════
// OTA 서브 사이드바
// ════════════════════════════════════════════════════════════════════════════
function OtaSubSidebar({
  branches, scoreHistory, otaList, view, expandedBranches,
  onToggleBranch, onSelectOverview, onSelectOTA,
}: {
  branches: string[]
  scoreHistory: ScoreHistory
  otaList: OtaEntry[]
  view: ViewState
  expandedBranches: Record<string, boolean>
  onToggleBranch: (b: string) => void
  onSelectOverview: () => void
  onSelectOTA: (branch: string, ota: string) => void
}) {
  const branchOtas: Record<string, string[]> = {}
  branches.forEach(b => {
    branchOtas[b] = OTA_ORDER.filter(o => (scoreHistory[b]?.[o] ?? []).some(v => v > 0))
  })

  return (
    <div style={{
      width: 200, borderRight: '1px solid var(--border)', height: '100vh',
      overflowY: 'auto', flexShrink: 0, background: 'var(--bg-sidebar)',
    }}>
      <div style={{ padding: '16px 12px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        OTA 현황
      </div>

      {/* 종합 현황 */}
      <div onClick={onSelectOverview} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
        cursor: 'pointer', fontSize: 13, transition: 'background 0.15s',
        background: view.type === 'overview' ? 'rgba(0,212,160,0.1)' : 'transparent',
        color: view.type === 'overview' ? 'var(--accent)' : 'var(--text-2)',
        fontWeight: view.type === 'overview' ? 600 : 400,
      }}>
        📊 종합 현황
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

      {/* 지점별 OTA 목록 */}
      {branches.map(branch => {
        const isExpanded = !!expandedBranches[branch]
        const otas = branchOtas[branch] ?? []
        return (
          <div key={branch}>
            <div onClick={() => onToggleBranch(branch)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-2)',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRANCH_COLOR[branch], display: 'inline-block', flexShrink: 0 }} />
              {branch}
              <span style={{ marginLeft: 'auto', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
            </div>

            {isExpanded && otas.map(ota => {
              const hist    = scoreHistory[branch]?.[ota] ?? []
              const cur     = hist[hist.length - 1] ?? 0
              const entry   = otaList.find(o => o.name === ota)
              const isActive = view.type === 'detail' && view.branch === branch && view.ota === ota
              return (
                <div key={ota} onClick={() => onSelectOTA(branch, ota)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 12px 5px 28px', cursor: 'pointer', fontSize: 12,
                    transition: 'background 0.15s',
                    background: isActive ? 'rgba(0,212,160,0.08)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-3)',
                    fontWeight: isActive ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span>{ota}</span>
                  {cur > 0 && entry && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(cur, entry.okr) }}>
                      {cur.toFixed(1)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 지점별 점수 추이 (종합) — 주차별 변화 시각화 + 하락 시 원인 리뷰 드릴다운
// ════════════════════════════════════════════════════════════════════════════
// reviews.ota_site는 한글명이므로 ota_properties의 영문명과 매핑이 필요하다
const OTA_SITE_ALIAS: Record<string, string[]> = {
  Agoda: ['아고다'], Booking: ['부킹닷컴'], 'Trip.com': ['트립닷컴'],
  Expedia: ['익스피디아'], Airbnb: ['에어비앤비'], 여기어때: ['여기어때'], NOL: ['NOL', '야놀자'],
}

interface DrillTarget {
  branch: string
  ota: string            // INTEGRATED 또는 OTA명
  label: string          // '7월 1주차'
  delta: number | null
  months: string[]       // 하락 구간이 걸치는 월들 (최신 먼저)
}

interface DrillReview {
  id: string; ota_site: string; rating: number
  content_ko: string | null; content: string | null
  categories: string[] | null; severity: string | null
}

function ratingColor(r: number) {
  if (r >= 9) return 'var(--done)'
  if (r >= 7) return 'var(--medium)'
  if (r >= 5) return 'var(--high)'
  return 'var(--critical)'
}

const SEVERITY_COLOR: Record<string, string> = {
  Critical: 'var(--critical)', High: 'var(--high)', Medium: 'var(--medium)', Low: 'var(--text-3)',
}

function DrilldownPanel({ target, onClose }: { target: DrillTarget; onClose: () => void }) {
  const [month, setMonth]     = useState(target.months[0])
  const [lowOnly, setLowOnly] = useState(true)
  const [reviews, setReviews] = useState<DrillReview[] | null>(null)

  useEffect(() => { setMonth(target.months[0]); setLowOnly(true) }, [target])

  useEffect(() => {
    let cancelled = false
    setReviews(null)
    ;(async () => {
      let q = supabase.from('reviews')
        .select('id,ota_site,rating,content_ko,content,categories,severity')
        .eq('branch', target.branch)
        .eq('review_month', month)
        .order('rating', { ascending: true })
        .limit(30)
      if (target.ota !== INTEGRATED) q = q.in('ota_site', OTA_SITE_ALIAS[target.ota] ?? [target.ota])
      if (lowOnly) q = q.lte('rating', 8)
      const { data, error } = await q
      if (!cancelled) setReviews(error ? [] : ((data as DrillReview[]) ?? []))
    })()
    return () => { cancelled = true }
  }, [target, month, lowOnly])

  const monthChip = (m: string) => `${parseInt(m.substring(5, 7))}월 리뷰`

  return (
    <div className="card" style={{ marginTop: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRANCH_COLOR[target.branch], display: 'inline-block' }} />
            {target.branch} · {target.ota === INTEGRATED ? '전체 OTA' : target.ota} — {target.label} 원인 리뷰
            {target.delta != null && target.delta < 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--critical)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <TrendingDown size={12} /> {target.delta.toFixed(2)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            리뷰 데이터는 월 단위 수집 — 하락 구간이 걸치는 월의 리뷰를 낮은 점수부터 표시
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {target.months.map(m => (
          <button key={m} onClick={() => setMonth(m)} style={TOGGLE_BTN(month === m)}>{monthChip(m)}</button>
        ))}
        <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', margin: '0 4px' }} />
        {([['low', '8점 이하'], ['all', '전체']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setLowOnly(key === 'low')} style={TOGGLE_BTN(lowOnly === (key === 'low'))}>{label}</button>
        ))}
      </div>

      {reviews === null
        ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28, fontSize: 13 }}>리뷰 불러오는 중…</div>
        : reviews.length === 0
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28, fontSize: 13 }}>
              {lowOnly ? '해당 월에 8점 이하 리뷰가 없습니다 — "전체"로 확인해보세요' : '해당 월에 리뷰가 없습니다'}
            </div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {reviews.map(r => (
                <div key={r.id} style={{ padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className="font-display" style={{
                      fontSize: 14, fontWeight: 800, color: ratingColor(r.rating),
                      background: 'var(--bg-card)', borderRadius: 6, padding: '2px 8px',
                      border: `1px solid ${ratingColor(r.rating)}40`,
                    }}>{Number(r.rating).toFixed(1)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.ota_site}</span>
                    {r.severity && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: SEVERITY_COLOR[r.severity] ?? 'var(--text-3)' }}>{r.severity}</span>
                    )}
                    {(r.categories ?? []).map(c => (
                      <span key={c} style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-card)', borderRadius: 10, padding: '2px 8px', border: '1px solid var(--border)' }}>{c}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {r.content_ko || r.content || '(본문 없음)'}
                  </div>
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}

function BranchTrendSection({ d, dates }: { d: OtaData; dates: string[] }) {
  const [trendOta, setTrendOta]         = useState<string>(INTEGRATED)
  const [timeMode, setTimeMode]         = useState<'weekly' | 'monthly'>('weekly')
  const [selBranches, setSelBranches]   = useState<string[]>([])   // 빈 배열 = 전체 지점
  const [drill, setDrill]               = useState<DrillTarget | null>(null)

  const visibleBranches = selBranches.length ? selBranches : d.branches

  // 전체 상태에서 지점 클릭 = 그 지점만 격리, 이후 클릭 = 추가/해제, 전부 해제 = 전체 복귀
  const toggleBranch = (b: string) => {
    setSelBranches(prev => {
      let next: string[]
      if (prev.length === 0) next = [b]
      else if (prev.includes(b)) next = prev.filter(x => x !== b)
      else next = [...prev, b]
      const covers = next.length === 0 || d.branches.every(x => next.includes(x))
      const result = covers ? [] : next
      // 드릴다운 중인 지점이 숨겨지면 패널도 닫는다
      const vis = result.length ? result : d.branches
      setDrill(cur => (cur && !vis.includes(cur.branch) ? null : cur))
      return result
    })
  }

  const weeklyRows = useMemo(
    () => buildTrendRows(d.branches, d.otaList, d.scoreHistory, d.reviewHistory, dates, trendOta),
    [d.branches, d.otaList, d.scoreHistory, d.reviewHistory, dates, trendOta],
  )
  const rows: TrendRow[] = useMemo(
    () => timeMode === 'monthly' ? rollupMonthly(weeklyRows, d.branches) : weeklyRows.slice(-12),
    [weeklyRows, timeMode, d.branches],
  )

  if (dates.length === 0) return null

  const chartData = rows.map(r => {
    const rec: Record<string, any> = { label: r.label, dateIso: r.dateIso, prevIso: r.prevIso }
    d.branches.forEach(b => { rec[b] = r.values[b]; rec[`${b}__d`] = r.deltas[b] })
    return rec
  })

  const otaEntry = d.otaList.find(o => o.name === trendOta)
  const okr      = trendOta === INTEGRATED ? 9.0 : (otaEntry?.okr ?? 9.0)
  const scaleMax = trendOta === INTEGRATED ? 10  : (otaEntry?.max ?? 10)
  const vals = chartData.flatMap(r => visibleBranches.map(b => r[b]).filter((v): v is number => v != null))
  const yDomain: [number, number] = vals.length
    ? [Math.max(0, Math.min(...vals, okr) - 0.4), Math.min(scaleMax, Math.max(...vals, okr) + 0.2)]
    : [0, scaleMax]

  const otaChips = [
    INTEGRATED,
    ...d.otaList
      .filter(o => d.branches.some(b => (d.scoreHistory[b]?.[o.name] ?? []).some(v => v > 0)))
      .map(o => o.name),
  ]

  const openDrill = (branch: string, payload: any) => {
    setDrill({
      branch,
      ota: trendOta,
      label: payload.label,
      delta: payload[`${branch}__d`] ?? null,
      months: timeMode === 'monthly'
        ? [payload.dateIso.substring(0, 7)]
        : drilldownMonths(payload.dateIso, payload.prevIso),
    })
  }

  // 하락 스냅샷은 빨간 점으로 마킹, 모든 점은 클릭 시 원인 리뷰 드릴다운
  const renderDot = (branch: string) => (p: any) => {
    const { cx, cy, payload, index } = p
    if (cx == null || cy == null || payload[branch] == null) return <g key={`${branch}-${index}`} />
    const delta  = payload[`${branch}__d`]
    const isDrop = delta != null && delta < 0
    return (
      <g key={`${branch}-${index}`} onClick={() => openDrill(branch, payload)} style={{ cursor: 'pointer' }}>
        <circle cx={cx} cy={cy} r={11} fill="transparent" />
        <circle cx={cx} cy={cy} r={isDrop ? 5.5 : 4}
          fill={isDrop ? 'var(--critical)' : BRANCH_COLOR[branch]}
          stroke="var(--bg-card)" strokeWidth={2} />
      </g>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>📈 지점별 점수 추이</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              통합 = OTA 점수 10점 환산 후 리뷰 수 가중 평균 · <span style={{ color: 'var(--critical)' }}>●</span> 하락 지점 · 점 클릭 시 원인 리뷰
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['weekly', 'monthly'] as const).map(m => (
              <button key={m} onClick={() => { setTimeMode(m); setDrill(null) }} style={TOGGLE_BTN(timeMode === m)}>
                {m === 'weekly' ? '📅 주별' : '📅 월별'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {otaChips.map(name => (
            <button key={name} onClick={() => { setTrendOta(name); setDrill(null) }} style={TOGGLE_BTN(trendOta === name)}>
              {name === INTEGRATED ? '⭐ 통합' : name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <button onClick={() => setSelBranches([])} style={TOGGLE_BTN(selBranches.length === 0)}>
            전체 지점
          </button>
          {d.branches.map(b => {
            const active = visibleBranches.includes(b)
            return (
              <button key={b} onClick={() => toggleBranch(b)}
                style={{
                  ...TOGGLE_BTN(selBranches.length > 0 && active),
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  opacity: active ? 1 : 0.45,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: BRANCH_COLOR[b], display: 'inline-block' }} />
                {b}
              </button>
            )
          })}
        </div>

        {vals.length === 0
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
          : <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--text-3)" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} domain={yDomain}
                  tickFormatter={(v: number) => v.toFixed(1)} width={40} />
                <Tooltip {...CHART_TOOLTIP_STYLE}
                  formatter={(v: any, name: any, item: any) => {
                    const delta = item?.payload?.[`${name}__d`]
                    const deltaTxt = delta == null ? '' : ` (${delta > 0 ? '+' : ''}${Number(delta).toFixed(2)})`
                    return [`${Number(v).toFixed(2)}점${deltaTxt}`, name]
                  }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={okr} stroke="rgba(0,229,102,0.45)" strokeDasharray="6 3"
                  label={{ value: `OKR ${okr}`, fill: 'var(--done)', fontSize: 10, position: 'right' }} />
                {visibleBranches.map(b => (
                  <Line key={b} type="monotone" dataKey={b} name={b}
                    stroke={BRANCH_COLOR[b]} strokeWidth={2.2} connectNulls
                    dot={renderDot(b)}
                    activeDot={{ r: 6, style: { pointerEvents: 'none' } }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
        }
      </div>

      {drill && <DrilldownPanel target={drill} onClose={() => setDrill(null)} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 종합 현황 탭
// ════════════════════════════════════════════════════════════════════════════
function TabOverview({ d, recordedAt, dates }: { d: OtaData; recordedAt: string; dates: string[] }) {
  return (
    <div>
      <BranchTrendSection d={d} dates={dates} />
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: BRANCH_COLOR[b], display: 'inline-block' }} />
                      {b}
                    </span>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRANCH_COLOR[b] }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{b}</span>
              </div>
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
// 기본 추이 — 8주 평점 + 리뷰 수 차트
// ════════════════════════════════════════════════════════════════════════════
function OtaDetailBasic({
  branch, ota, otaEntry, last8Labels, last8Scores, weeklyReviews,
}: {
  branch: string; ota: string; otaEntry?: OtaEntry
  last8Labels: string[]; last8Scores: number[]; weeklyReviews: number[]
}) {
  const okr   = otaEntry?.okr ?? 9.0
  const color = BRANCH_COLOR[branch] ?? 'var(--accent)'

  const scoreData  = last8Labels.map((w, i) => ({ week: w, 평점: last8Scores[i] ?? 0 })).filter(d => d.평점 > 0)
  const reviewData = last8Labels.map((w, i) => ({ week: w, 신규리뷰: weeklyReviews[i] ?? 0 }))

  const yMin = scoreData.length ? Math.max(0, Math.min(...scoreData.map(d => d.평점)) - 0.5) : 0
  const yMax = scoreData.length ? Math.min(otaEntry?.max ?? 10, Math.max(...scoreData.map(d => d.평점)) + 0.3) : otaEntry?.max ?? 10

  return (
    <div>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>지난 8주 평점 추이</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>점선: OKR 목표 {okr}</div>
          </div>
        </div>
        {scoreData.length < 2
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
          : <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scoreData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} domain={[yMin, yMax]} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <ReferenceLine y={okr} stroke="rgba(0,229,102,0.45)" strokeDasharray="6 3"
                  label={{ value: `OKR ${okr}`, fill: 'var(--done)', fontSize: 10, position: 'right' }} />
                <Line type="monotone" dataKey="평점" stroke={color} strokeWidth={2.5}
                  dot={{ fill: color, r: 5, stroke: 'var(--bg-card)', strokeWidth: 2 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
        }
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>지난 8주 주간 신규 리뷰 수</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>총 리뷰 수 증가분 (이번 주 총 리뷰 − 전 주 총 리뷰)</div>
          </div>
        </div>
        {reviewData.every(d => d.신규리뷰 === 0)
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
          : <ResponsiveContainer width="100%" height={220}>
              <BarChart data={reviewData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v}건`, '신규 리뷰']} />
                <Bar dataKey="신규리뷰" fill={color} opacity={0.75} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
        }
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Agoda 상세 서브탭
// ════════════════════════════════════════════════════════════════════════════
type AgodaSubTab = '리뷰 작성률' | '점수 분포' | '불만 분석' | 'VOC'

function AgodaDetailTabs({ branch, d, sub, onSubChange }: {
  branch: string; d: OtaData
  sub: AgodaSubTab
  onSubChange: (s: AgodaSubTab) => void
}) {
  const setSub = onSubChange
  const [distViewMode, setDistView] = useState<'count' | 'ratio'>('count')
  const [timeMode, setTimeMode]     = useState<'weekly' | 'monthly'>('weekly')
  const [vocTimeMode, setVocTimeMode] = useState<'weekly' | 'monthly'>('weekly')
  const [vocPeriod, setVocPeriod]     = useState<string>('')

  const agodaOTA    = d.otaList.find(o => o.name === 'Agoda') ?? { okr: 9.0, max: 10 }
  const scoreHist   = d.scoreHistory[branch]?.['Agoda'] ?? []
  const curScore    = scoreHist[scoreHist.length - 1] ?? 0
  const prevScore   = scoreHist[scoreHist.length - 2] ?? 0
  const reviewHist   = d.reviewHistory[branch]?.['Agoda'] ?? []
  const totalReviews = reviewHist[reviewHist.length - 1] ?? 0

  const distHistoryRaw = d.agodaDist[branch] ?? []
  const distHistory    = timeMode === 'monthly' ? groupDistByMonth(distHistoryRaw) : distHistoryRaw
  const heatmapMaxVal  = Math.max(
    ...distHistory.flatMap(({ scores }) => {
      const total = scores.reduce((s, v) => s + v, 0) || 1
      return distViewMode === 'ratio' ? scores.map(cnt => Math.round(cnt / total * 1000) / 10) : scores
    }), 1
  )

  const complaintsRaw   = d.agodaComplaints[branch] ?? []
  const complaints      = timeMode === 'monthly' ? groupComplaintsByMonth(complaintsRaw) : complaintsRaw
  const baseRoom        = complaintsRaw.slice(0, 4).reduce((s, c) => s + c.room, 0) / Math.max(complaintsRaw.slice(0, 4).length, 1)
  const baseBath        = complaintsRaw.slice(0, 4).reduce((s, c) => s + c.bathroom, 0) / Math.max(complaintsRaw.slice(0, 4).length, 1)
  const latestComplaint = complaintsRaw[complaintsRaw.length - 1]

  const reviewRateRaw = d.agodaReviewRate?.[branch] ?? []
  const reviewRate    = timeMode === 'monthly' ? groupReviewRateByMonth(reviewRateRaw) : reviewRateRaw
  const latestRate    = reviewRateRaw[reviewRateRaw.length - 1]

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
      {/* Agoda 요약 스탯 */}
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

      {/* 서브탭 바 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['리뷰 작성률', '점수 분포', '불만 분석', 'VOC'] as AgodaSubTab[]).map(t => (
            <button key={t} onClick={() => setSub(t)} style={{
              padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
              background: sub === t ? 'var(--accent)' : 'var(--bg-card)',
              color: sub === t ? '#fff' : 'var(--text-2)', fontWeight: sub === t ? 600 : 400,
            }}>{t}</button>
          ))}
        </div>
        {sub !== 'VOC' && timeModeToggle}
      </div>

      {/* 리뷰 작성률 */}
      {sub === '리뷰 작성률' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Agoda 리뷰 작성률 추이 — {branch}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>체크아웃 고객 중 리뷰 작성 비율 (막대: 리뷰 건수, 선: 작성률)</div>
          {reviewRate.length === 0
            ? <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 13 }}>리뷰 작성률 데이터가 없습니다</div>
              </div>
            : <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={reviewRate} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--done)" tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any, name: any) => name === '작성률(%)' ? [`${v}%`, name] : [`${v}건`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="reviewCount" name="리뷰 건수" fill="var(--accent)" opacity={0.8} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="ratePct" name="작성률(%)" stroke="var(--done)" strokeWidth={2.5} dot={{ fill: 'var(--done)', r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
          }
        </div>
      )}

      {/* 점수 분포 */}
      {sub === '점수 분포' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>점수 분포 히트맵 — {branch}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
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
                          {timeMode === 'weekly' ? (<><div style={{ fontWeight: 600, fontSize: 11 }}>W{wi + 1}</div><div style={{ fontSize: 10 }}>{week}</div></>) : week}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-3)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', paddingBottom: 10 }}>평균 점수</td>
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
                        <td style={{ textAlign: 'right', paddingRight: 12, color: 'var(--text-3)', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', paddingBottom: 3 }}>{label}</td>
                        {distHistory.map(({ week, scores }) => {
                          const total = scores.reduce((s, v) => s + v, 0) || 1
                          const raw = scores[bandIdx] ?? 0
                          const display = distViewMode === 'ratio' ? Math.round(raw / total * 1000) / 10 : raw
                          const { background, color } = heatCellStyle(display, heatmapMaxVal)
                          return (
                            <td key={week} style={{ textAlign: 'center', borderRadius: 6, padding: '7px 4px', background, color, fontWeight: display > 0 ? 600 : 400, fontSize: 11 }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 11, color: 'var(--text-3)' }}>
            <span>낮음</span>
            <div style={{ width: 120, height: 10, borderRadius: 5, background: 'linear-gradient(to right, rgba(0,212,160,0.12), rgba(0,212,160,0.5), rgba(0,212,160,0.9))' }} />
            <span>높음</span>
          </div>

          {(() => {
            const avgData = distHistory
              .map(({ week, scores, avgScore }, wi) => ({ label: `W${wi + 1} ${week}`, avg: avgScore && avgScore > 0 ? avgScore : calcWeekAvg(scores) }))
              .filter(d => d.avg > 0)
            if (avgData.length === 0) return null
            const minAvg = Math.max(0, Math.min(...avgData.map(d => d.avg)) - 0.5)
            const maxAvg = Math.min(10, Math.max(...avgData.map(d => d.avg)) + 0.3)
            return (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10 }}>{timeMode === 'monthly' ? '월별' : '주별'} 평균 점수 추이</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={avgData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e91e8c" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#e91e8c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[minAvg, maxAvg]} tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}점`} width={44} />
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${Number(v).toFixed(2)}점`, '평균 점수']} />
                    <Area type="monotone" dataKey="avg" stroke="#e91e8c" strokeWidth={2} fill="url(#avgGrad)" dot={{ r: 4, fill: '#e91e8c', stroke: 'var(--bg-card)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
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
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any, name: any) => [`${v}건`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {timeMode === 'weekly' && baseRoom > 0 && (
                      <ReferenceLine y={Math.round(baseRoom * 10) / 10} stroke="var(--high)" strokeDasharray="6 3" opacity={0.5}
                        label={{ value: '기준', fill: 'var(--high)', fontSize: 9, position: 'insideTopRight' }} />
                    )}
                    {timeMode === 'weekly' && baseBath > 0 && (
                      <ReferenceLine y={Math.round(baseBath * 10) / 10} stroke="var(--critical)" strokeDasharray="6 3" opacity={0.5} />
                    )}
                    <Line type="monotone" dataKey="room" name="객실 불만" stroke="var(--high)" strokeWidth={2.5} dot={{ fill: 'var(--high)', r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="bathroom" name="욕실 불만" stroke="var(--critical)" strokeWidth={2.5} dot={{ fill: 'var(--critical)', r: 4 }} activeDot={{ r: 6 }} />
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
                    { label: '총 객실 불만', value: complaintsRaw.reduce((s, c) => s + c.room, 0), color: 'var(--high)' },
                    { label: '총 욕실 불만', value: complaintsRaw.reduce((s, c) => s + c.bathroom, 0), color: 'var(--critical)' },
                    { label: '주간 평균', value: (complaintsRaw.reduce((s, c) => s + c.room + c.bathroom, 0) / complaintsRaw.length).toFixed(1), color: 'var(--medium)', unit: '건/주' },
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
                  ? <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.8 }}>{d.complaintMemos[branch]}</div>
                  : <div style={{ fontSize: 12, color: 'var(--text-3)' }}>메모 없음</div>
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* VOC */}
      {sub === 'VOC' && (() => {
        const allVoc    = d.agodaVoc[branch] ?? []
        const allWeeks  = [...new Set(allVoc.map(v => v.week_start))].sort().reverse()
        const allMonths = [...new Set(allVoc.map(v => v.week_start.substring(0, 7)))].sort().reverse()

        const effectivePeriod = vocPeriod ||
          (vocTimeMode === 'weekly' ? (allWeeks[0] ?? '') : (allMonths[0] ?? ''))

        const filteredVoc = vocTimeMode === 'weekly'
          ? allVoc.filter(v => v.week_start === effectivePeriod)
          : allVoc.filter(v => v.week_start.startsWith(effectivePeriod))

        const vocBands = [...new Set(filteredVoc.map(v => v.band))]

        const fmtWeekChip  = (ws: string) => `${parseInt(ws.substring(5, 7))}/${parseInt(ws.substring(8, 10))}`
        const fmtMonthChip = (ym: string) => `${parseInt(ym.substring(5, 7))}월`
        const fmtMonthFull = (ym: string) => `${ym.substring(0, 4)}년 ${parseInt(ym.substring(5, 7))}월`

        const periodLabel = effectivePeriod
          ? (vocTimeMode === 'weekly' ? `${fmtWeekChip(effectivePeriod)} 주` : fmtMonthFull(effectivePeriod))
          : ''

        return (
          <div className="card" style={{ padding: 24 }}>
            {/* 헤더 + 시간 모드 토글 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>💬 VOC 키워드 — {branch} Agoda</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['weekly', 'monthly'] as const).map(m => (
                  <button key={m} onClick={() => { setVocTimeMode(m); setVocPeriod('') }} style={TOGGLE_BTN(vocTimeMode === m)}>
                    {m === 'weekly' ? '📅 주별' : '📅 월별'}
                  </button>
                ))}
              </div>
            </div>

            {/* 기간 선택 칩 */}
            {(vocTimeMode === 'weekly' ? allWeeks : allMonths).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {(vocTimeMode === 'weekly' ? allWeeks : allMonths).map(p => (
                  <button
                    key={p}
                    onClick={() => setVocPeriod(p)}
                    style={TOGGLE_BTN(effectivePeriod === p)}
                  >
                    {vocTimeMode === 'weekly' ? fmtWeekChip(p) : fmtMonthChip(p)}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
              점수대별 긍정/부정 키워드 분석{periodLabel ? ` · ${periodLabel}` : ''}
            </div>

            {filteredVoc.length === 0
              ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
              : vocBands.map(band => {
                  const items = filteredVoc.filter(v => v.band === band)
                  const good  = items.filter(v => v.sentiment === 'good')
                  const bad   = items.filter(v => v.sentiment === 'bad')
                  return (
                    <div key={band} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {band}<div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: good.length && bad.length ? '1fr 1fr' : '1fr', gap: 12 }}>
                        {good.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--done)', fontWeight: 600, marginBottom: 6 }}>👍 좋아요</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {good.map((v, i) => (
                                <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,229,102,0.08)', border: '1px solid rgba(0,229,102,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' }}>{v.keyword}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {bad.length > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--critical)', fontWeight: 600, marginBottom: 6 }}>👎 나빠요</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {bad.map((v, i) => (
                                <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' }}>{v.keyword}</div>
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
        )
      })()}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 데이터 입력 모달
// ════════════════════════════════════════════════════════════════════════════
const MODAL_TITLE: Record<ModalMode, string> = {
  'basic':       '기본 추이 입력 — 평점 & 리뷰 수',
  'review-rate': 'Agoda 리뷰 작성률 입력',
  'score-dist':  'Agoda 점수 분포 입력',
  'complaints':  'Agoda 불만 분석 입력',
  'voc':         'Agoda VOC 키워드 입력',
}

const VOC_BANDS = ['10점', '9점대', '8점대', '7점대', '6점대 이하']

function InputModal({
  branch, ota, propertyId, otaEntry, mode, onClose, onSaved,
}: {
  branch: string; ota: string; propertyId?: number; otaEntry?: OtaEntry
  mode: ModalMode
  onClose: () => void; onSaved: () => void
}) {
  const today = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const [date, setDate]           = useState(todayStr)
  const [score, setScore]         = useState('')
  const [reviews, setReviews]     = useState('')
  const [checkouts, setCheckouts] = useState('')
  const [s2,setS2]   = useState('0'); const [s3,setS3]   = useState('0'); const [s4,setS4]   = useState('0')
  const [s5,setS5]   = useState('0'); const [s6,setS6]   = useState('0'); const [s7,setS7]   = useState('0')
  const [s8,setS8]   = useState('0'); const [s9,setS9]   = useState('0'); const [s10,setS10] = useState('0')
  const [roomComp, setRoom] = useState('0')
  const [bathComp, setBath] = useState('0')
  const [memo, setMemo]     = useState('')
  const [vocItems, setVocItems] = useState<{ band: string; sentiment: 'good' | 'bad'; keyword: string }[]>([
    { band: '10점', sentiment: 'good', keyword: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const rateDisplay = reviews && checkouts
    ? `${(parseInt(reviews) / parseInt(checkouts) * 100).toFixed(1)}%` : ''

  const addVocItem = () => setVocItems(prev => [...prev, { band: '10점', sentiment: 'good', keyword: '' }])
  const removeVocItem = (i: number) => setVocItems(prev => prev.filter((_, idx) => idx !== i))
  const updateVocItem = (i: number, field: string, value: string) =>
    setVocItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))

  const save = async () => {
    if (!propertyId) { setError('property_id를 찾을 수 없습니다. 관리자에게 문의하세요.'); return }
    setSaving(true); setError('')
    try {
      if (mode === 'basic') {
        if (!date || !score || !reviews) { setError('날짜, 평점, 리뷰 수는 필수입니다.'); setSaving(false); return }
        const res = await fetch('/api/ota/scores', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, recordedAt: date, overallScore: parseFloat(score), reviewCount: parseInt(reviews) }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'review-rate') {
        if (!date || !reviews || !checkouts) { setError('날짜, 리뷰 수, 체크아웃 수는 필수입니다.'); setSaving(false); return }
        const res = await fetch('/api/ota/agoda-rate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, reviewCount: parseInt(reviews), checkoutCount: parseInt(checkouts), ratePct: parseFloat(rateDisplay) }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'score-dist') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const distVals = [s2,s3,s4,s5,s6,s7,s8,s9,s10].map(Number)
        if (!distVals.some(v => v > 0)) { setError('점수 분포 값을 1개 이상 입력하세요.'); setSaving(false); return }
        const res = await fetch('/api/ota/agoda-dist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, score2:distVals[0],score3:distVals[1],score4:distVals[2],score5:distVals[3],score6:distVals[4],score7:distVals[5],score8:distVals[6],score9:distVals[7],score10:distVals[8] }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'complaints') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const res = await fetch('/api/ota/agoda-complaints', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, roomComplaints: parseInt(roomComp)||0, bathroomComplaints: parseInt(bathComp)||0, memo }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'voc') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const validItems = vocItems.filter(v => v.keyword.trim())
        if (!validItems.length) { setError('키워드를 1개 이상 입력하세요.'); setSaving(false); return }
        const res = await fetch('/api/ota/agoda-voc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, items: validItems }),
        })
        if (!res.ok) throw new Error(await res.text())
      }

      onSaved()
    } catch (e: any) {
      setError(e.message ?? '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 13 }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 520, maxHeight: '84vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>
          {MODAL_TITLE[mode]}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>{branch} · {ota}</div>

        {/* 날짜 — 공통 */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>기준 날짜 (주 시작일)</label>
          <input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {/* ── 기본 추이: 평점 + 리뷰 수 ── */}
        {mode === 'basic' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>평점</label>
              <input style={inputStyle} type="number" step="0.1" min="0" max={otaEntry?.max ?? 10} placeholder="예: 9.2" value={score} onChange={e => setScore(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>리뷰 수 (누적)</label>
              <input style={inputStyle} type="number" placeholder="예: 1580" value={reviews} onChange={e => setReviews(e.target.value)} />
            </div>
          </div>
        )}

        {/* ── 리뷰 작성률: 체크아웃 + 리뷰 수 ── */}
        {mode === 'review-rate' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>체크아웃 수</label>
              <input style={inputStyle} type="number" placeholder="예: 120" value={checkouts} onChange={e => setCheckouts(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>리뷰 수</label>
              <input style={inputStyle} type="number" placeholder="예: 58" value={reviews} onChange={e => setReviews(e.target.value)} />
            </div>
            {rateDisplay && (
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>리뷰 작성률 (자동 계산)</label>
                <div style={{ ...inputStyle, background: 'var(--bg-hover)', color: 'var(--done)', fontWeight: 700, fontSize: 18, textAlign: 'center' }}>
                  {rateDisplay}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 점수 분포 ── */}
        {mode === 'score-dist' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[['2점대',s2,setS2],['3점대',s3,setS3],['4점대',s4,setS4],['5점대',s5,setS5],['6점대',s6,setS6],['7점대',s7,setS7],['8점대',s8,setS8],['9점대',s9,setS9],['10점',s10,setS10]].map(([label, val, setter]) => (
              <div key={label as string}>
                <label style={labelStyle}>{label as string}</label>
                <input style={inputStyle} type="number" min="0" value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} />
              </div>
            ))}
          </div>
        )}

        {/* ── 불만 분석 ── */}
        {mode === 'complaints' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>객실 정비 불만 건수</label>
                <input style={inputStyle} type="number" min="0" value={roomComp} onChange={e => setRoom(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>욕실 불만 건수</label>
                <input style={inputStyle} type="number" min="0" value={bathComp} onChange={e => setBath(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>운영 메모</label>
              <input style={inputStyle} type="text" placeholder="예: 3층 욕실 배수 점검 완료" value={memo} onChange={e => setMemo(e.target.value)} />
            </div>
          </>
        )}

        {/* ── VOC 키워드 ── */}
        {mode === 'voc' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>점수 밴드별 긍정/부정 키워드를 입력합니다.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {vocItems.map((item, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    {i === 0 && <label style={labelStyle}>점수 밴드</label>}
                    <select style={selectStyle} value={item.band} onChange={e => updateVocItem(i, 'band', e.target.value)}>
                      {VOC_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>감정</label>}
                    <select style={selectStyle} value={item.sentiment} onChange={e => updateVocItem(i, 'sentiment', e.target.value)}>
                      <option value="good">👍 좋아요</option>
                      <option value="bad">👎 나빠요</option>
                    </select>
                  </div>
                  <div>
                    {i === 0 && <label style={labelStyle}>키워드</label>}
                    <input style={inputStyle} type="text" placeholder="예: 청결한 침구" value={item.keyword} onChange={e => updateVocItem(i, 'keyword', e.target.value)} />
                  </div>
                  <button onClick={() => removeVocItem(i)} style={{ padding: '8px 10px', background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 6, color: 'var(--critical)', cursor: 'pointer', fontSize: 12, marginBottom: 0 }}>✕</button>
                </div>
              ))}
            </div>
            <button onClick={addVocItem} style={{ padding: '7px 14px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              + 키워드 추가
            </button>
          </div>
        )}

        {error && <div style={{ fontSize: 12, color: 'var(--critical)', marginTop: 14, padding: '8px 12px', background: 'rgba(255,59,92,0.08)', borderRadius: 6 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-hover)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>취소</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', background: saving ? 'var(--bg-hover)' : 'var(--accent)', color: saving ? 'var(--text-3)' : '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// OTA 상세 뷰 (지점 + OTA 선택 시)
// ════════════════════════════════════════════════════════════════════════════
function OtaDetailView({
  branch, ota, d, branchOtaToId, onSaved,
}: {
  branch: string; ota: string; d: OtaData
  branchOtaToId: Record<string, Record<string, number>>
  onSaved: () => void
}) {
  const [mainTab, setMainTab]   = useState<'basic' | 'agoda'>('basic')
  const [agodaSub, setAgodaSub] = useState<AgodaSubTab>('리뷰 작성률')
  const [showModal, setShowModal] = useState(false)

  function getModalMode(): ModalMode {
    if (ota !== 'Agoda' || mainTab === 'basic') return 'basic'
    if (agodaSub === '리뷰 작성률') return 'review-rate'
    if (agodaSub === '점수 분포')   return 'score-dist'
    if (agodaSub === '불만 분석')   return 'complaints'
    return 'voc'
  }

  const otaEntry      = d.otaList.find(o => o.name === ota)
  const allScores     = d.scoreHistory[branch]?.[ota] ?? []
  const allReviews    = d.reviewHistory[branch]?.[ota] ?? []  // 누적 총 리뷰수 시계열
  const last8Labels   = d.dateLabels.slice(-8)
  const last8Scores   = allScores.slice(-8)
  const curScore      = allScores[allScores.length - 1] ?? 0
  const prevScore     = allScores[allScores.length - 2] ?? 0
  const curReviews    = allReviews[allReviews.length - 1] ?? 0   // 최신 총 리뷰수
  const prevReviews   = allReviews[allReviews.length - 2] ?? 0
  const weeklyNew     = curReviews > 0 && prevReviews > 0 ? curReviews - prevReviews : 0
  const propertyId    = branchOtaToId?.[branch]?.[ota]

  // 주간 신규 리뷰 = 누적값 차이 (delta). 한 주 앞 값이 필요하므로 9개 슬라이스
  const last9Reviews  = allReviews.slice(-9)
  const weeklyReviews = last8Labels.map((_, i) => {
    const cur  = last9Reviews[i + 1] ?? 0
    const prev = last9Reviews[i] ?? 0
    return cur > 0 && prev > 0 ? Math.max(0, cur - prev) : 0
  })

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: BRANCH_COLOR[branch], display: 'inline-block' }} />
            {branch} · {ota}
          </div>
          <h2 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>{ota}</h2>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
          background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} /> 데이터 입력
        </button>
      </div>

      {/* 요약 스탯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>현재 평점</div>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 800, color: curScore && otaEntry ? scoreColor(curScore, otaEntry.okr) : 'var(--text-3)', lineHeight: 1 }}>
            {curScore ? curScore.toFixed(1) : '—'}
          </div>
          {otaEntry && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>OKR 목표 {otaEntry.okr} · {curScore >= otaEntry.okr ? '✓ 달성' : '미달'}</div>}
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>전주 대비</div>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 800, color: curScore >= prevScore ? 'var(--done)' : 'var(--critical)', lineHeight: 1 }}>
            {curScore && prevScore ? `${(curScore - prevScore) >= 0 ? '+' : ''}${(curScore - prevScore).toFixed(1)}` : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>직전주 {prevScore ? prevScore.toFixed(1) : '—'}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>총 리뷰 수</div>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
            {curReviews.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            {weeklyNew > 0 ? `이번 주 신규 +${weeklyNew.toLocaleString()}건` : '이전 데이터 없음'}
          </div>
        </div>
      </div>

      {/* 탭바 (Agoda만) */}
      {ota === 'Agoda' && (
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {([['basic', '📊 기본 추이'], ['agoda', '🔍 Agoda 상세']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setMainTab(key)} style={{
              padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: mainTab === key ? 700 : 400,
              color: mainTab === key ? 'var(--accent)' : 'var(--text-3)',
              borderBottom: mainTab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* 기본 추이 */}
      {(mainTab === 'basic' || ota !== 'Agoda') && (
        <OtaDetailBasic branch={branch} ota={ota} otaEntry={otaEntry}
          last8Labels={last8Labels} last8Scores={last8Scores} weeklyReviews={weeklyReviews} />
      )}

      {/* Agoda 상세 */}
      {mainTab === 'agoda' && ota === 'Agoda' && (
        <AgodaDetailTabs branch={branch} d={d} sub={agodaSub} onSubChange={setAgodaSub} />
      )}

      {/* 입력 모달 */}
      {showModal && (
        <InputModal branch={branch} ota={ota} propertyId={propertyId} otaEntry={otaEntry}
          mode={getModalMode()}
          onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); onSaved() }} />
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
  dates?:            string[]   // ISO 스냅샷 날짜 (추이 섹션용)
  otaList?:          OtaEntry[]
  agodaDist?:        Record<string, AgodaDistWeek[]>
  agodaComplaints?:  Record<string, { week: string; room: number; bathroom: number }[]>
  complaintMemos?:   Record<string, string>
  agodaVoc?:         Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]>
  agodaReviewRate?:  Record<string, AgodaReviewRateWeek[]>
  branchOtaToId?:    Record<string, Record<string, number>>
}

export default function OtaScoresClient({
  recordedAt      = '—',
  scoreHistory    = {},
  reviewHistory   = {},
  dateLabels      = [],
  dates           = [],
  otaList         = [],
  agodaDist       = {},
  agodaComplaints = {},
  complaintMemos  = {},
  agodaVoc        = {},
  agodaReviewRate = {},
  branchOtaToId   = {},
}: OtaScoresClientProps) {
  const router = useRouter()
  const [view, setView]   = useState<ViewState>({ type: 'overview' })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 신설: true })

  const branches = BRANCH_ORDER.filter(b =>
    Object.keys(scoreHistory).includes(b) || Object.keys(agodaDist).includes(b)
  )

  const data: OtaData = {
    branches,
    otaList: otaList.length > 0 ? otaList : [
      { name: 'Agoda', max: 10, okr: 9.0 }, { name: 'Booking', max: 10, okr: 8.8 },
      { name: 'Trip.com', max: 10, okr: 8.8 }, { name: 'Expedia', max: 10, okr: 8.8 },
      { name: '여기어때', max: 10, okr: 9.0 }, { name: 'Airbnb', max: 5, okr: 4.8 },
      { name: 'NOL', max: 5, okr: 4.5 },
    ],
    dateLabels, scoreHistory, reviewHistory,
    agodaDist, agodaComplaints, complaintMemos, agodaVoc, agodaReviewRate,
  }

  const handleToggleBranch = (b: string) =>
    setExpanded(prev => ({ ...prev, [b]: !prev[b] }))

  const handleSelectOTA = (branch: string, ota: string) => {
    setView({ type: 'detail', branch, ota })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 좌측 OTA 서브 사이드바 */}
      <OtaSubSidebar
        branches={branches}
        scoreHistory={scoreHistory}
        otaList={data.otaList}
        view={view}
        expandedBranches={expanded}
        onToggleBranch={handleToggleBranch}
        onSelectOverview={() => setView({ type: 'overview' })}
        onSelectOTA={handleSelectOTA}
      />

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view.type === 'overview' ? (
          <div style={{ padding: '28px 32px' }}>
            <div style={{ marginBottom: 24 }}>
              <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>⭐ OTA 현황 — 종합</h1>
              <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>기준일: {recordedAt}</div>
            </div>
            <TabOverview d={data} recordedAt={recordedAt} dates={dates} />
          </div>
        ) : (
          <OtaDetailView
            branch={view.branch}
            ota={view.ota}
            d={data}
            branchOtaToId={branchOtaToId}
            onSaved={() => router.refresh()}
          />
        )}
      </div>
    </div>
  )
}
