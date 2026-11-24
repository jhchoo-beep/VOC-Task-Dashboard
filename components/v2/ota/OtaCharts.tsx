'use client'
// OTA 점수 2.0 — 그래프 조각. 색은 CSS 변수(app/v2/ota/ota.css)만 쓴다(다크·라이트 각자 단계).
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '@/lib/supabase'
import { drilldownMonths } from '@/lib/otaTrend'
import { ratingInChannelScale } from '@/lib/otaDetail'
import {
  INTEGRATED, digitsOf, fmtDelta, newReviewSeries, scaleOf, siteAliases, targetOf, visibleRows, weeklyRows,
  type OtaProps, type TimeMode,
} from '@/lib/v2/ota'

// 지점 색은 지점에 고정한다(필터로 지점 수가 바뀌어도 남은 지점의 색이 바뀌지 않게)
const BRANCH_VAR: Record<string, string> = { 신설: 'var(--ota-b1)', 동대문: 'var(--ota-b2)', 제주시티: 'var(--ota-b3)', 고성: 'var(--ota-b4)' }
export const colorOf = (b: string) => BRANCH_VAR[b] ?? 'var(--ink)'

export const AXIS = { stroke: 'var(--line)', tick: { fontSize: 11, fill: 'var(--dim)' }, tickLine: false } as const
export const GRID = { stroke: 'var(--line2)', vertical: false } as const

export interface TipItem { color?: string; name: string; value: string; sub?: string }

export function ChartTip({ title, items }: { title: string; items: TipItem[] }) {
  if (!items.length) return null
  return (
    <div className="ota-tip">
      <div className="ota-tip-t">{title}</div>
      {items.map(it => (
        <div key={it.name} className="ota-tip-r">
          {it.color && <i style={{ background: it.color }} aria-hidden="true" />}
          <span>{it.name}</span>
          <b className="num">{it.value}</b>
          {it.sub && <span className="num dim">{it.sub}</span>}
        </div>
      ))}
    </div>
  )
}

export function DropMark({ size = 10 }: { size?: number }) {
  const h = size / 2
  return (
    <svg width={size + 2} height={size + 2} viewBox={`0 0 ${size + 2} ${size + 2}`} aria-hidden="true" style={{ flex: 'none' }}>
      <path d={`M1,${1 + h * 0.4} L${size + 1},${1 + h * 0.4} L${h + 1},${size + 1} Z`} fill="var(--warn)" />
    </svg>
  )
}

interface Drill { branch: string; ota: string; label: string; dateIso: string; delta: number | null; months: string[] }

/**
 * 점수 추이 + 하락 점 → 저평점 리뷰. 고른 화면마다 하나만 그린다(부모가 key 로 새로 만든다).
 * branches = Δ 계산에 쓰는 전 지점, visible = 실제로 그리는 지점.
 */
export function TrendBlock({ data, branches, visible, ota, mode, legend }: {
  data: OtaProps; branches: string[]; visible: string[]; ota: string; mode: TimeMode; legend?: React.ReactNode
}) {
  const all = useMemo(() => weeklyRows(data, branches, ota), [data, branches, ota])
  const rows = useMemo(() => visibleRows(all, branches, mode), [all, branches, mode])
  const [drill, setDrill] = useState<Drill | null>(null)
  const shown = drill && visible.includes(drill.branch) ? drill : null

  const ref = visible[0] ?? branches[0]
  const target = targetOf(data, ref, ota)
  const scale = scaleOf(data, ref, ota)
  const digits = digitsOf(scale, ota)

  const chartData = rows.map(r => {
    const rec: Record<string, string | number | null> = { label: r.label, dateIso: r.dateIso, prevIso: r.prevIso }
    for (const b of branches) { rec[b] = r.values[b]; rec[`${b}__d`] = r.deltas[b] }
    return rec
  })
  const vals = rows.flatMap(r => visible.map(b => r.values[b]).filter((v): v is number => v != null))
  const yDomain: [number, number] = vals.length
    ? [Math.max(0, Math.min(...vals, target) - 0.4), Math.min(scale, Math.max(...vals, target) + 0.2)]
    : [0, scale]

  const open = (b: string, r: { label: string; dateIso: string; prevIso: string | null; delta: number | null }) => setDrill({
    branch: b, ota, label: r.label, dateIso: r.dateIso, delta: r.delta,
    months: mode === 'monthly' ? [r.dateIso.substring(0, 7)] : drilldownMonths(r.dateIso, r.prevIso),
  })

  // 하락 점(키보드로도 열 수 있게 그래프 아래 버튼으로도 둔다). 최신 순
  const drops = rows.flatMap(r => visible.filter(b => (r.deltas[b] ?? 0) < 0).map(b => ({ b, r, d: r.deltas[b]! }))).reverse()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderDot = (b: string) => function DotMark(p: any) {
    const { cx, cy, payload, index } = p
    if (cx == null || cy == null || payload[b] == null) return <g key={`${b}-${index}`} />
    const d = payload[`${b}__d`] as number | null
    const drop = d != null && d < 0
    const on = shown && shown.branch === b && shown.dateIso === payload.dateIso
    return (
      <g key={`${b}-${index}`} style={{ cursor: 'pointer' }}
        onClick={() => open(b, { label: payload.label, dateIso: payload.dateIso, prevIso: payload.prevIso, delta: d })}>
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        {on && <circle cx={cx} cy={cy} r={9} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
        {drop
          ? <path d={`M${cx - 6},${cy - 4} L${cx + 6},${cy - 4} L${cx},${cy + 6} Z`} fill="var(--warn)" stroke="var(--bg)" strokeWidth={1.5} />
          : <circle cx={cx} cy={cy} r={4} fill={colorOf(b)} stroke="var(--bg)" strokeWidth={2} />}
      </g>
    )
  }

  return (
    <div className="ota-block">
      {legend}
      {vals.length === 0
        ? <div className="ota-none">데이터 없음</div>
        : (
          <div className="ota-chart" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 56, left: 0, bottom: 4 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
                <YAxis {...AXIS} axisLine={false} domain={yDomain} width={44} tickFormatter={(v: number) => v.toFixed(digits === 2 ? 2 : 1)} />
                <Tooltip cursor={{ stroke: 'var(--dim)', strokeDasharray: '3 3' }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={(t: any) => {
                    if (!t.active || !t.payload?.length) return null
                    const rec = t.payload[0].payload
                    return <ChartTip title={`${rec.label} · ${rec.dateIso}`} items={visible.filter(b => rec[b] != null).map(b => ({
                      color: colorOf(b), name: b, value: Number(rec[b]).toFixed(digits), sub: fmtDelta(rec[`${b}__d`], digits),
                    }))} />
                  }} />
                <ReferenceLine y={target} stroke="var(--dim)" strokeDasharray="6 4"
                  label={{ value: `목표 ${target.toFixed(1)}`, fill: 'var(--mute)', fontSize: 11, position: 'right' }} />
                {visible.map(b => (
                  <Line key={b} type="monotone" dataKey={b} name={b} stroke={colorOf(b)} strokeWidth={2} connectNulls
                    isAnimationActive={false} dot={renderDot(b)} activeDot={{ r: 6, style: { pointerEvents: 'none' } }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

      {drops.length > 0 && (
        <div className="ota-drops" role="group" aria-label="하락 지점">
          <span className="ota-drops-k"><DropMark />하락 <span className="num">{drops.length}</span></span>
          {drops.slice(0, 8).map(({ b, r, d }) => {
            const on = shown && shown.branch === b && shown.dateIso === r.dateIso
            return (
              <button type="button" key={`${b}-${r.dateIso}`} className={`ota-chip${on ? ' on' : ''}`} aria-pressed={!!on}
                onClick={() => open(b, { label: r.label, dateIso: r.dateIso, prevIso: r.prevIso, delta: d })}>
                {visible.length > 1 && <i style={{ background: colorOf(b) }} aria-hidden="true" />}
                {visible.length > 1 ? `${b} · ` : ''}{r.label} <span className="num tone-over">{fmtDelta(d, digits)}</span>
              </button>
            )
          })}
        </div>
      )}

      {shown && <DrillPanel key={`${shown.branch}-${shown.ota}-${shown.dateIso}-${mode}`} target={shown} digits={digits} scale={scale} goal={target} onClose={() => setDrill(null)} />}
    </div>
  )
}

interface DrillReview { id: string; ota_site: string; rating: number; content_ko: string | null; content: string | null; categories: string[] | null; severity: string | null }

/**
 * 하락 구간이 걸치는 달의 리뷰(reviews 표, 낮은 점수부터 30건).
 * reviews.rating 은 10점 환산 저장이라 조회 조건(8 이하)은 그대로 두고, 5점제 채널 화면에서는
 * 표시만 채널 척도로 되돌린다(lib/otaDetail.ratingInChannelScale). 통합(전체 채널)은 10점 그대로.
 */
function DrillPanel({ target, digits, scale, goal, onClose }: { target: Drill; digits: number; scale: number; goal: number; onClose: () => void }) {
  const five = scale === 5 && target.ota !== INTEGRATED
  const shownRating = (r: number) => (five ? ratingInChannelScale(r, 5) ?? r : Number(r))
  const lowLabel = five ? 4 : 8
  const [month, setMonth] = useState(target.months[0])
  const [lowOnly, setLowOnly] = useState(true)
  // 결과를 조회 조건(달·점수 범위)과 함께 들고 있다가, 조건이 바뀌면 맞는 결과가 올 때까지 「불러오는 중」
  const qk = `${month}|${lowOnly}`
  const [res, setRes] = useState<{ k: string; reviews: DrillReview[]; failed: boolean } | null>(null)
  const reviews = res && res.k === qk ? res.reviews : null
  const failed = !!(res && res.k === qk && res.failed)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let q = supabase.from('reviews')
        .select('id,ota_site,rating,content_ko,content,categories,severity')
        .eq('branch', target.branch)
        .eq('review_month', month)
        .order('rating', { ascending: true })
        .limit(30)
      if (target.ota !== INTEGRATED) q = q.in('ota_site', siteAliases(target.ota))
      if (lowOnly) q = q.lte('rating', 8)
      const { data, error } = await q
      if (cancelled) return
      setRes({ k: `${month}|${lowOnly}`, reviews: error ? [] : ((data as DrillReview[]) ?? []), failed: !!error })
    })()
    return () => { cancelled = true }
  }, [target, month, lowOnly])

  return (
    <section className="ota-drill" aria-label="저평점 리뷰">
      <div className="ota-drill-h">
        <div>
          <div className="detail-meta"><span>{target.branch} · {target.ota === INTEGRATED ? '전체 채널' : target.ota} · {target.label}</span></div>
          <div className="ota-drill-t">
            저평점 리뷰
            {target.delta != null && target.delta < 0 && <span className="pill warn">전 스냅샷 대비 <span className="num">{fmtDelta(target.delta, digits)}</span></span>}
          </div>
        </div>
        <button type="button" className="act" onClick={onClose}>닫기</button>
      </div>
      <div className="ota-row-ctl">
        <div className="segs" role="group" aria-label="리뷰 달">
          {target.months.map(m => (
            <button type="button" key={m} className={`seg${month === m ? ' on' : ''}`} aria-pressed={month === m} onClick={() => setMonth(m)}>
              <span className="num">{+m.substring(5, 7)}</span>월 리뷰
            </button>
          ))}
        </div>
        <div className="segs" role="group" aria-label="점수 범위">
          <button type="button" className={`seg${lowOnly ? ' on' : ''}`} aria-pressed={lowOnly} onClick={() => setLowOnly(true)}><span className="num">{lowLabel}</span>점 이하</button>
          <button type="button" className={`seg${!lowOnly ? ' on' : ''}`} aria-pressed={!lowOnly} onClick={() => setLowOnly(false)}>전체</button>
        </div>
      </div>
      {reviews === null
        ? <div className="ota-none">불러오는 중</div>
        : reviews.length === 0
          ? <div className="ota-none">{failed ? '리뷰를 읽지 못했습니다.' : lowOnly ? `이 달에 ${lowLabel}점 이하 리뷰 없음` : '이 달에 리뷰 없음'}</div>
          : (
            <div className="boxed ota-drill-list">
              {reviews.map(r => (
                <div key={r.id} className="rv">
                  <div className="rv-meta">
                    <span className={`score num${shownRating(r.rating) < (five ? goal : 9) ? ' low' : ''}`}>{shownRating(r.rating).toFixed(1)}</span>
                    <span>{r.ota_site}</span>
                    {r.severity && <span className={`pill${r.severity === 'Critical' || r.severity === 'High' ? ' warn' : ''}`}>{r.severity}</span>}
                    {(r.categories ?? []).map(c => <span key={c} className="pill">{c}</span>)}
                  </div>
                  <div className="rv-text" style={{ color: 'var(--ink)' }}>{r.content_ko || r.content || '글 없음'}</div>
                </div>
              ))}
            </div>
          )}
    </section>
  )
}

/** 신규 리뷰 수 막대(누적 리뷰 수 증가분) */
export function NewReviewBars({ hist, dates, mode, color }: { hist: number[]; dates: string[]; mode: TimeMode; color: string }) {
  const series = useMemo(() => newReviewSeries(hist, dates, mode), [hist, dates, mode])
  if (series.every(s => s.n == null)) return <div className="ota-none">데이터 없음</div>
  return (
    <div className="ota-chart" style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 56, left: 0, bottom: 4 }} barCategoryGap="28%">
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
          <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip cursor={{ fill: 'var(--panel)' }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={(t: any) => {
              if (!t.active || !t.payload?.length) return null
              const rec = t.payload[0].payload
              return <ChartTip title={`${rec.label} · ${rec.dateIso}`} items={[{ color, name: '신규 리뷰', value: rec.n == null ? '–' : `${rec.n}건` }]} />
            }} />
          <Bar dataKey="n" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
