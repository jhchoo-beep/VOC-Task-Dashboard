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
import { bandsFor, granularityForOtaName } from '@/lib/otaDetail'

// ─── 타입 ────────────────────────────────────────────────────────────────────
type ScoreHistory  = Record<string, Record<string, number[]>>
type ReviewHistory = Record<string, Record<string, number[]>>
type ModalMode = 'basic' | 'checkouts' | 'score-dist' | 'complaints' | 'voc'

interface OtaEntry { name: string; max: number; okr: number }
interface DistWeek { week: string; scores: number[]; avgScore?: number; granularity?: 'week' | 'month' }
interface ReviewRateWeek { week: string; reviewCount: number; checkoutCount: number; ratePct: number }
type ViewState = { type: 'overview' } | { type: 'detail'; branch: string; ota: string }

interface OtaData {
  branches:        string[]
  otaList:         OtaEntry[]
  dateLabels:      string[]
  dates:           string[]   // 점수 스냅샷 기준일(ISO, 오름차순)
  scoreHistory:    ScoreHistory
  reviewHistory:   ReviewHistory
  scoreDist:       Record<string, Record<string, DistWeek[]>>
  complaints:      Record<string, Record<string, { week: string; room: number; bathroom: number }[]>>
  complaintMemos:  Record<string, Record<string, string>>
  voc:             Record<string, Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]>>
  reviewRate:      Record<string, Record<string, ReviewRateWeek[]>>
  scoreMaxByBranchOta: Record<string, Record<string, number>>
  snapshotDatesByChannel: Record<string, Record<string, string[]>>  // 지점×채널별 작성률 조인 가능한 스냅샷 기준일
}

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────
function weekMonth(week: string): string { return week.substring(0, 2) }

function groupDistByMonth(rows: DistWeek[]): DistWeek[] {
  const map = new Map<string, { scores: number[]; totalReviews: number; weightedSum: number }>()
  rows.forEach(({ week, scores, avgScore }) => {
    const m = weekMonth(week)
    // 밴드 수는 척도(10점/5점)에 따라 다르므로 행의 길이를 그대로 따른다
    if (!map.has(m)) map.set(m, { scores: new Array(scores.length).fill(0), totalReviews: 0, weightedSum: 0 })
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

function groupReviewRateByMonth(rows: ReviewRateWeek[]): ReviewRateWeek[] {
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

// scores[i]는 밴드 i(= score_{i+1})의 건수 — 대표값은 i+1점.
// (쓰기 API `/api/ota/score-dist`의 가중 평균 계산과 같은 규약)
function calcWeekAvg(scores: number[]): number {
  let total = 0, count = 0
  scores.forEach((cnt, i) => { total += cnt * (i + 1); count += cnt })
  return count > 0 ? Math.round(total / count * 10) / 10 : 0
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
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
// OTA 상세 서브탭 — 전 채널
// ════════════════════════════════════════════════════════════════════════════
type DetailSubTab = '점수 분포' | '불만 분석' | 'VOC' | '리뷰 작성률'

function OtaDetailTabs({ branch, ota, d, sub, onSubChange }: {
  branch: string; ota: string; d: OtaData
  sub: DetailSubTab
  onSubChange: (s: DetailSubTab) => void
}) {
  const setSub = onSubChange
  const [distViewMode, setDistView] = useState<'count' | 'ratio'>('count')
  const [timeMode, setTimeMode]     = useState<'weekly' | 'monthly'>('weekly')
  const [vocTimeMode, setVocTimeMode] = useState<'weekly' | 'monthly'>('weekly')
  const [vocPeriod, setVocPeriod]     = useState<string>('')

  const otaEntry    = d.otaList.find(o => o.name === ota) ?? { okr: 9.0, max: 10 }
  const scoreMax    = d.scoreMaxByBranchOta[branch]?.[ota] ?? 10
  const bands       = bandsFor(scoreMax)
  const scoreHist   = d.scoreHistory[branch]?.[ota] ?? []
  const curScore    = scoreHist[scoreHist.length - 1] ?? 0
  const prevScore   = scoreHist[scoreHist.length - 2] ?? 0
  const reviewHist   = d.reviewHistory[branch]?.[ota] ?? []
  const totalReviews = reviewHist[reviewHist.length - 1] ?? 0

  const distHistoryRaw = d.scoreDist[branch]?.[ota] ?? []
  // 원본이 이미 월 단위인 채널(에어비앤비·여기어때)은 주별 집계가 불가능하다.
  // 쌓인 행을 보고 추론하지 않는다 — 행이 0개인 채널(여기어때)이 주 단위로 오판된다.
  const monthlyOnly    = granularityForOtaName(ota) === 'month'
  const effectiveTime  = monthlyOnly ? 'monthly' : timeMode
  const distHistory    = (effectiveTime === 'monthly' && !monthlyOnly) ? groupDistByMonth(distHistoryRaw) : distHistoryRaw
  const heatmapMaxVal  = Math.max(
    ...distHistory.flatMap(({ scores }) => {
      const total = scores.reduce((s, v) => s + v, 0) || 1
      return distViewMode === 'ratio' ? scores.map(cnt => Math.round(cnt / total * 1000) / 10) : scores
    }), 1
  )

  const complaintsRaw   = d.complaints[branch]?.[ota] ?? []
  const complaints      = (effectiveTime === 'monthly' && !monthlyOnly) ? groupComplaintsByMonth(complaintsRaw) : complaintsRaw
  const baseRoom        = complaintsRaw.slice(0, 4).reduce((s, c) => s + c.room, 0) / Math.max(complaintsRaw.slice(0, 4).length, 1)
  const baseBath        = complaintsRaw.slice(0, 4).reduce((s, c) => s + c.bathroom, 0) / Math.max(complaintsRaw.slice(0, 4).length, 1)
  const latestComplaint = complaintsRaw[complaintsRaw.length - 1]

  const reviewRateRaw = d.reviewRate[branch]?.[ota] ?? []
  const reviewRate    = (effectiveTime === 'monthly' && !monthlyOnly) ? groupReviewRateByMonth(reviewRateRaw) : reviewRateRaw
  const latestRate    = reviewRateRaw[reviewRateRaw.length - 1]

  const timeModeToggle = monthlyOnly ? (
    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
      이 채널은 OTA가 월 단위 날짜만 제공합니다 — 월별로만 표시
    </div>
  ) : (
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
      {/* 채널 요약 스탯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: '현재 점수',   value: curScore ? curScore.toFixed(1) : '—', sub: `목표 ${otaEntry.okr}+`, color: curScore ? scoreColor(curScore, otaEntry.okr) : 'var(--text-3)' },
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
          {(['점수 분포', '불만 분석', 'VOC', '리뷰 작성률'] as DetailSubTab[]).map(t => (
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>{ota} 리뷰 작성률 추이 — {branch}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>{ota} 체크아웃 고객 중 리뷰 작성 비율 (막대: 리뷰 건수, 선: 작성률)</div>
          {reviewRate.length === 0
            ? <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 13 }}>체크아웃 수가 입력되지 않았습니다</div>
                <div style={{ fontSize: 11, marginTop: 6 }}>우측 상단 「데이터 입력」에서 {branch} {ota}의 주간 체크아웃 수를 넣으면 이 채널의 작성률이 산출됩니다</div>
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
                          {effectiveTime === 'weekly' ? (<><div style={{ fontWeight: 600, fontSize: 11 }}>W{wi + 1}</div><div style={{ fontSize: 10 }}>{week}</div></>) : week}
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
                              background: avg > 0 ? scoreBg(avg, otaEntry.okr) : 'var(--bg-card)',
                              border: avg > 0 ? `1px solid ${scoreColor(avg, otaEntry.okr)}40` : '1px solid var(--border)',
                              color: avg > 0 ? scoreColor(avg, otaEntry.okr) : 'var(--text-3)',
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
                    {bands.map((label, bandIdx) => (
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
            const maxAvg = Math.min(scoreMax, Math.max(...avgData.map(d => d.avg)) + 0.3)
            return (
              <div style={{ marginTop: 28 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10 }}>{effectiveTime === 'monthly' ? '월별' : '주별'} 평균 점수 추이</div>
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
            {/* 주별/월별 컨트롤(월 단위 채널에서는 안내 문구)은 서브탭 바에 한 번만 둔다 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>주간 불만 추이 — {branch}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>점선: 초기 4주 평균 기준선</div>
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
                    {effectiveTime === 'weekly' && baseRoom > 0 && (
                      <ReferenceLine y={Math.round(baseRoom * 10) / 10} stroke="var(--high)" strokeDasharray="6 3" opacity={0.5}
                        label={{ value: '기준', fill: 'var(--high)', fontSize: 9, position: 'insideTopRight' }} />
                    )}
                    {effectiveTime === 'weekly' && baseBath > 0 && (
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
                {d.complaintMemos[branch]?.[ota]
                  ? <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.8 }}>{d.complaintMemos[branch]?.[ota]}</div>
                  : <div style={{ fontSize: 12, color: 'var(--text-3)' }}>메모 없음</div>
                }
              </div>
            </div>
          )}
        </div>
      )}

      {/* VOC */}
      {sub === 'VOC' && (() => {
        const allVoc    = d.voc[branch]?.[ota] ?? []
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
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>💬 VOC 키워드 — {branch} {ota}</div>
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
  'basic':      '기본 추이 입력 — 평점 & 리뷰 수',
  'checkouts':  '채널 주간 체크아웃 수 입력',
  'score-dist': '점수 분포 입력',
  'complaints': '불만 분석 입력',
  'voc':        'VOC 키워드 입력',
}

// 10점 척도의 밴드 라벨은 기존 ota_voc 데이터와 맞추기 위해 그대로 둔다.
// 5점 척도(에어비앤비·NOL)는 1~5점을 그대로 쓴다 — 10점으로 환산하지 않는다.
const VOC_BANDS_10 = ['10점', '9점대', '8점대', '7점대', '6점대 이하']
function vocBandsFor(scoreMax: number): string[] {
  return scoreMax === 5 ? [...bandsFor(5)].reverse() : VOC_BANDS_10
}

// 스냅샷 날짜(ISO)를 읽기 쉬운 한글 표기로 — 값 자체는 원본 ISO를 그대로 전송한다
function fmtSnapshotDate(iso: string): string {
  return `${parseInt(iso.substring(5, 7))}월 ${parseInt(iso.substring(8, 10))}일`
}

function InputModal({
  branch, ota, propertyId, otaEntry, scoreMax, mode, checkoutDates, granularity, onClose, onSaved,
}: {
  branch: string; ota: string; propertyId?: number; otaEntry?: OtaEntry
  scoreMax: number
  mode: ModalMode
  // 이 채널에서 작성률 조인이 실제로 성립하는 스냅샷 기준일(ISO, 오름차순).
  // 지점 합집합도, 전 지점 합집합도 아니다 — 조인 안 되는 날짜를 고를 수 있으면
  // '저장은 됐는데 화면은 그대로'인 막다른 길이 된다. 분모가 채널 단위이므로
  // 같은 지점의 다른 채널에만 있는 날짜도 여기 들어오면 안 된다.
  // 채널의 가장 이른 스냅샷은 직전 값이 없어 제외돼 있다.
  checkoutDates: string[]
  granularity: 'week' | 'month'        // 채널이 저장하는 단위 — 월 단위 채널은 월로 저장해야 한다
  onClose: () => void; onSaved: () => void
}) {
  const today = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  // 모달은 showModal일 때만 마운트되므로, 채널을 바꿔 다시 열면 아래 초기값이 새 scoreMax로 다시 잡힌다
  const vocBands = vocBandsFor(scoreMax)

  // granularity를 함께 저장하는 모드들. checkouts는 주 단위 고정이라 granularity가 없다.
  const usesGranularity = mode === 'score-dist' || mode === 'complaints' || mode === 'voc'
  // 월 단위 채널(에어비앤비·여기어때)은 배치와 같은 키(YYYY-MM-01)로 써야 주/월 행이 섞이지 않는다
  const monthlyInput    = usesGranularity && granularity === 'month'
  // 체크아웃은 점수 스냅샷 기준일과 정확히 일치해야 작성률 조인이 성립한다 (최신 먼저)
  const snapshotDates   = useMemo(() => [...checkoutDates].sort().reverse(), [checkoutDates])
  const useSnapshotPick = mode === 'checkouts' && snapshotDates.length > 0
  // 고를 수 있는 날짜가 하나도 없는 채널 — 빈 select를 띄우지 않고 사유를 밝힌다
  const noCheckoutDate  = mode === 'checkouts' && snapshotDates.length === 0

  const [date, setDate]           = useState(() => {
    if (mode === 'checkouts') return checkoutDates[checkoutDates.length - 1] ?? ''
    if (usesGranularity && granularity === 'month') return `${todayStr.substring(0, 7)}-01`
    return todayStr
  })
  const [score, setScore]         = useState('')
  const [reviews, setReviews]     = useState('')
  const [checkouts, setCheckouts] = useState('')
  // 빈 문자열을 허용해야 앞자리 0이 남지 않는다 — 숫자 변환은 저장 시점에만
  const [distVals, setDistVals]   = useState<string[]>(() => new Array(scoreMax === 5 ? 5 : 10).fill(''))
  const [roomComp, setRoom] = useState('0')
  const [bathComp, setBath] = useState('0')
  const [memo, setMemo]     = useState('')
  const [headline, setHeadline] = useState('')
  const [vocItems, setVocItems] = useState<{ band: string; sentiment: 'good' | 'bad'; keyword: string }[]>([
    { band: vocBands[0], sentiment: 'good', keyword: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const addVocItem = () => setVocItems(prev => [...prev, { band: vocBands[0], sentiment: 'good', keyword: '' }])
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

      } else if (mode === 'checkouts') {
        if (!date || !checkouts) { setError('날짜와 체크아웃 수는 필수입니다.'); setSaving(false); return }
        const res = await fetch('/api/ota/channel-checkouts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, checkoutCount: parseInt(checkouts) }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'score-dist') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const nums = distVals.map(v => parseInt(v) || 0)
        const counts: Record<string, number> = {}
        nums.forEach((v, i) => { counts[`score_${i + 1}`] = v })
        if (!nums.some(v => v > 0)) { setError('점수 분포 값을 1개 이상 입력하세요.'); setSaving(false); return }
        const res = await fetch('/api/ota/score-dist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, granularity, scoreMax, counts }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'complaints') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const res = await fetch('/api/ota/complaints', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, granularity, roomComplaints: parseInt(roomComp)||0, bathroomComplaints: parseInt(bathComp)||0, memo, headline }),
        })
        if (!res.ok) throw new Error(await res.text())

      } else if (mode === 'voc') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const validItems = vocItems.filter(v => v.keyword.trim())
        if (!validItems.length) { setError('키워드를 1개 이상 입력하세요.'); setSaving(false); return }
        const res = await fetch('/api/ota/voc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, granularity, items: validItems }),
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

        {/* 날짜 — 공통 (체크아웃은 스냅샷 선택, 월 단위 채널은 월 선택) */}
        {useSnapshotPick ? (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>대상 주 (점수 스냅샷 기준일)</label>
            <select style={selectStyle} value={date} onChange={e => setDate(e.target.value)}>
              {snapshotDates.map(dt => <option key={dt} value={dt}>{fmtSnapshotDate(dt)}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.7 }}>
              작성률은 이 채널의 점수 스냅샷과 같은 날짜에만 산출됩니다 — 스냅샷이 있는 주만 선택할 수 있습니다.
              직전 스냅샷이 없는 첫 주는 신규 리뷰 수를 낼 수 없어 목록에서 빠집니다.
            </div>
          </div>
        ) : noCheckoutDate ? (
          <div style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.8 }}>
            {branch} {ota}에는 지금 체크아웃 수를 넣을 수 있는 주가 없습니다.
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              작성률의 분자는 이 채널의 점수 스냅샷 두 개의 차이로 냅니다. 아직 스냅샷이 한 번뿐이거나
              없어서 어떤 주를 넣어도 값이 나오지 않습니다 — 다음 주 점수 수집 이후에 입력해 주세요.
            </div>
          </div>
        ) : monthlyInput ? (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>기준 월</label>
            <input style={inputStyle} type="month" value={date.substring(0, 7)}
              onChange={e => setDate(e.target.value ? `${e.target.value}-01` : '')} />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.7 }}>
              이 채널은 OTA가 월 단위 날짜만 제공합니다 — 해당 월 1일자로 저장됩니다.
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>기준 날짜 (주 시작일)</label>
            <input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        )}

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

        {/* ── 채널 주간 체크아웃 수 (작성률의 분모 — 이 채널 전용) ── */}
        {mode === 'checkouts' && !noCheckoutDate && (
          <div>
            <label style={labelStyle}>{branch} {ota} 주간 체크아웃 수</label>
            <input style={inputStyle} type="number" placeholder="예: 120" value={checkouts} onChange={e => setCheckouts(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.7 }}>
              이 채널 전용값입니다 — {ota}로 예약한 고객의 체크아웃 수만 넣습니다.
              지점 전체 체크아웃 수가 아니며, 같은 지점의 다른 채널에는 반영되지 않습니다.
              분자(이 채널의 신규 리뷰 수)는 주간 점수 스냅샷에서 자동으로 계산됩니다.
            </div>
          </div>
        )}

        {/* ── 점수 분포 ── */}
        {mode === 'score-dist' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {bandsFor(scoreMax).map((label, i) => (
              <div key={label}>
                <label style={labelStyle}>{label}</label>
                <input style={inputStyle} type="number" min="0" placeholder="0" value={distVals[i] ?? ''}
                  onChange={e => setDistVals(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} />
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
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>한 줄 요약</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="한 줄 요약 — 원인만, 예: 욕실 배수 불량 수리 요청 후 미조치"
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                maxLength={60}
              />
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
                      {vocBands.map(b => <option key={b} value={b}>{b}</option>)}
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
          <button onClick={save} disabled={saving || noCheckoutDate} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', background: (saving || noCheckoutDate) ? 'var(--bg-hover)' : 'var(--accent)', color: (saving || noCheckoutDate) ? 'var(--text-3)' : '#fff', cursor: (saving || noCheckoutDate) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
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
  const [mainTab, setMainTab]   = useState<'basic' | 'detail'>('basic')
  const [detailSub, setDetailSub] = useState<DetailSubTab>('점수 분포')
  const [showModal, setShowModal] = useState(false)

  function getModalMode(): ModalMode {
    if (mainTab === 'basic')          return 'basic'
    if (detailSub === '리뷰 작성률')  return 'checkouts'
    if (detailSub === '점수 분포')    return 'score-dist'
    if (detailSub === '불만 분석')    return 'complaints'
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

  // 채널의 저장 단위 — 파생 배치(scripts/derive-ota-detail.ts)와 같은 함수로 판정한다.
  // 월 단위 채널(에어비앤비·여기어때)에 주 단위 행을 섞어 넣으면 월별 집계 키가 충돌한다.
  // 쌓인 행으로 추론하면 행이 0개인 채널을 주 단위로 오판한다(여기어때 3개 지점 전부 0행).
  const granularity = granularityForOtaName(ota)

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

      {/* 탭바 — 전 채널 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([['basic', '📊 기본 추이'], ['detail', `🔍 ${ota} 상세`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setMainTab(key)} style={{
            padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: mainTab === key ? 700 : 400,
            color: mainTab === key ? 'var(--accent)' : 'var(--text-3)',
            borderBottom: mainTab === key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {mainTab === 'basic' && (
        <OtaDetailBasic branch={branch} ota={ota} otaEntry={otaEntry}
          last8Labels={last8Labels} last8Scores={last8Scores} weeklyReviews={weeklyReviews} />
      )}

      {mainTab === 'detail' && (
        <OtaDetailTabs branch={branch} ota={ota} d={d} sub={detailSub} onSubChange={setDetailSub} />
      )}

      {/* 입력 모달 */}
      {showModal && (
        <InputModal branch={branch} ota={ota} propertyId={propertyId} otaEntry={otaEntry}
          scoreMax={d.scoreMaxByBranchOta[branch]?.[ota] ?? 10}
          mode={getModalMode()}
          checkoutDates={d.snapshotDatesByChannel[branch]?.[ota] ?? []}
          granularity={granularity}
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
  scoreDist?:        Record<string, Record<string, DistWeek[]>>
  complaints?:       Record<string, Record<string, { week: string; room: number; bathroom: number }[]>>
  complaintMemos?:   Record<string, Record<string, string>>
  voc?:              Record<string, Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]>>
  reviewRate?:       Record<string, Record<string, ReviewRateWeek[]>>
  scoreMaxByBranchOta?: Record<string, Record<string, number>>
  snapshotDatesByChannel?: Record<string, Record<string, string[]>>  // 지점×채널별 작성률 조인 가능한 스냅샷 기준일
  branchOtaToId?:    Record<string, Record<string, number>>
}

export default function OtaScoresClient({
  recordedAt      = '—',
  scoreHistory    = {},
  reviewHistory   = {},
  dateLabels      = [],
  dates           = [],
  otaList         = [],
  scoreDist       = {},
  complaints      = {},
  complaintMemos  = {},
  voc             = {},
  reviewRate      = {},
  scoreMaxByBranchOta = {},
  snapshotDatesByChannel = {},
  branchOtaToId   = {},
}: OtaScoresClientProps) {
  const router = useRouter()
  const [view, setView]   = useState<ViewState>({ type: 'overview' })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 신설: true })

  const branches = BRANCH_ORDER.filter(b =>
    Object.keys(scoreHistory).includes(b) || Object.keys(scoreDist).includes(b)
  )

  const data: OtaData = {
    branches,
    otaList: otaList.length > 0 ? otaList : [
      { name: 'Agoda', max: 10, okr: 9.0 }, { name: 'Booking', max: 10, okr: 8.8 },
      { name: 'Trip.com', max: 10, okr: 8.8 }, { name: 'Expedia', max: 10, okr: 8.8 },
      { name: '여기어때', max: 10, okr: 9.0 }, { name: 'Airbnb', max: 5, okr: 4.8 },
      { name: 'NOL', max: 5, okr: 4.5 },
    ],
    dateLabels, dates, scoreHistory, reviewHistory,
    scoreDist, complaints, complaintMemos, voc, reviewRate, scoreMaxByBranchOta,
    snapshotDatesByChannel,
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
