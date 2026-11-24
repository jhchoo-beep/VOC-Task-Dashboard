'use client'
// OTA 점수 2.0 — 채널 상세 서브탭 4종(리뷰 작성률·점수 분포·불만 분석·VOC). 1.0 의 같은 탭과 같은 값을 그린다.
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bandsFor } from '@/lib/otaDetail'
import {
  calcWeekAvg, groupComplaintsByMonth, groupDistByMonth, groupReviewRateByMonth,
  type ComplaintWeek, type DistWeek, type ReviewRateWeek, type VocRow, type TimeMode,
} from '@/lib/v2/ota'
import { AXIS, ChartTip, GRID } from './OtaCharts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

// ── 리뷰 작성률 ───────────────────────────────────────────────────────
// 분자 = 그 채널 ota_scores 누적 리뷰 수의 주간 증가분, 분모 = 그 채널 체크아웃 수(지점 공용값 아님).
// 체크아웃이 없는 채널은 행이 없다 → 안내만, 추정값으로 채우지 않는다.
export function RatePanel({ raw, mode, readOnly, onInput }: { raw: ReviewRateWeek[]; mode: TimeMode; readOnly: boolean; onInput: () => void }) {
  if (raw.length === 0) {
    return (
      <div className="ota-empty">
        <b>체크아웃 수가 입력되지 않았습니다</b>
        {!readOnly && <button type="button" className="act" onClick={onInput}>체크아웃 수 입력</button>}
      </div>
    )
  }
  const rows = mode === 'monthly' ? groupReviewRateByMonth(raw) : raw
  const top = Math.max(10, Math.ceil(Math.max(...rows.map(r => r.ratePct)) / 5) * 5)
  return (
    <>
      <div className="sec-k">작성률 <span className="num">%</span></div>
      <div className="ota-chart" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} axisLine={false} domain={[0, top]} width={44} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip cursor={{ stroke: 'var(--dim)', strokeDasharray: '3 3' }} content={(t: Any) => tipRate(t)} />
            <Line type="monotone" dataKey="ratePct" stroke="var(--ota-b1)" strokeWidth={2} isAnimationActive={false}
              dot={{ r: 4, fill: 'var(--ota-b1)', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="sec-k" style={{ marginTop: 18 }}>신규 리뷰 수</div>
      <div className="ota-chart" style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 24, left: 0, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid {...GRID} />
            <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip cursor={{ fill: 'var(--panel)' }} content={(t: Any) => tipRate(t)} />
            <Bar dataKey="reviewCount" fill="var(--ota-b1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="ota-scroll-x" style={{ marginTop: 18 }}>
        <table className="ota-tbl">
          <thead><tr><th>{mode === 'monthly' ? '월' : '주'}</th><th>신규 리뷰</th><th>체크아웃</th><th>작성률</th></tr></thead>
          <tbody>
            {[...rows].reverse().map(r => (
              <tr key={r.week}><td className="num">{r.week}</td><td className="num">{r.reviewCount}</td><td className="num">{r.checkoutCount}</td><td className="num"><b>{r.ratePct}%</b></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function tipRate(t: Any) {
  if (!t.active || !t.payload?.length) return null
  const r = t.payload[0].payload as ReviewRateWeek
  return <ChartTip title={r.week} items={[
    { color: 'var(--ota-b1)', name: '작성률', value: `${r.ratePct}%` },
    { name: '신규 리뷰', value: `${r.reviewCount}건` },
    { name: '체크아웃', value: `${r.checkoutCount}건` },
  ]} />
}

// ── 점수 분포 ─────────────────────────────────────────────────────────
// raw_reviews 표본의 실제 rating 집계(채널 자기 척도). 작성률 분자(전수 증가분)와 값이 다른 게 정상이다.
export function DistPanel({ raw, scale, target, mode, monthlyOnly }: { raw: DistWeek[]; scale: number; target: number; mode: TimeMode; monthlyOnly: boolean }) {
  const [view, setView] = useState<'count' | 'ratio'>('count')
  const rows = mode === 'monthly' && !monthlyOnly ? groupDistByMonth(raw) : raw
  if (rows.length === 0) return <div className="ota-none">데이터 없음</div>

  const bands = bandsFor(scale)
  const cell = (scores: number[], i: number) => {
    const total = scores.reduce((s, v) => s + v, 0) || 1
    const v = scores[i] ?? 0
    return view === 'ratio' ? Math.round(v / total * 1000) / 10 : v
  }
  const peak = Math.max(1, ...rows.flatMap(r => r.scores.map((_, i) => cell(r.scores, i))))
  const avgOf = (r: DistWeek) => (r.avgScore && r.avgScore > 0 ? r.avgScore : calcWeekAvg(r.scores))
  const avgData = rows.map(r => ({ week: r.week, avg: avgOf(r) })).filter(r => r.avg > 0)
  const digits = scale === 5 ? 2 : 1

  return (
    <>
      <div className="ota-row-ctl">
        <div className="sec-k" style={{ margin: 0 }}>점수 분포 · <span className="num">/{scale}</span>점</div>
        <div className="segs" role="group" aria-label="분포 단위" style={{ marginLeft: 'auto' }}>
          <button type="button" className={`seg${view === 'count' ? ' on' : ''}`} aria-pressed={view === 'count'} onClick={() => setView('count')}>건수</button>
          <button type="button" className={`seg${view === 'ratio' ? ' on' : ''}`} aria-pressed={view === 'ratio'} onClick={() => setView('ratio')}>비율</button>
        </div>
      </div>
      <div className="ota-scroll-x">
        <table className="ota-heat">
          <thead>
            <tr>
              <th scope="col"><span className="sr">구간</span></th>
              {rows.map(r => <th key={r.week} scope="col" className="num">{r.week}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="ota-heat-avg">
              <th scope="row">평균</th>
              {rows.map(r => {
                const a = avgOf(r)
                return <td key={r.week}><span className={`score num${a > 0 && a < target ? ' low' : ''}`}>{a > 0 ? a.toFixed(digits === 2 ? 2 : 1) : '–'}</span></td>
              })}
            </tr>
            {bands.map((label, i) => ({ label, i })).reverse().map(({ label, i }) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {rows.map(r => {
                  const v = cell(r.scores, i)
                  const k = Math.min(v / peak, 1)
                  return (
                    <td key={r.week}>
                      <span className={`ota-heat-c num${k > 0.55 ? ' hi' : ''}${v <= 0 ? ' zero' : ''}`}
                        style={v > 0 ? { background: `color-mix(in oklab, var(--ota-seq) ${Math.round(14 + k * 78)}%, var(--bg))` } : undefined}>
                        {v > 0 ? (view === 'ratio' ? `${v}%` : v) : '0'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {avgData.length > 0 && (
        <>
          <div className="sec-k" style={{ marginTop: 22 }}>{mode === 'monthly' || monthlyOnly ? '월별' : '주별'} 평균 점수</div>
          <div className="ota-chart" style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={avgData} margin={{ top: 10, right: 56, left: 0, bottom: 4 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" />
                <YAxis {...AXIS} axisLine={false} width={44}
                  domain={[Math.max(0, Math.min(...avgData.map(d => d.avg), target) - 0.5), Math.min(scale, Math.max(...avgData.map(d => d.avg), target) + 0.3)]}
                  tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip cursor={{ stroke: 'var(--dim)', strokeDasharray: '3 3' }} content={(t: Any) => {
                  if (!t.active || !t.payload?.length) return null
                  const r = t.payload[0].payload
                  return <ChartTip title={r.week} items={[{ color: 'var(--ota-b1)', name: '평균 점수', value: Number(r.avg).toFixed(digits) }]} />
                }} />
                <ReferenceLine y={target} stroke="var(--dim)" strokeDasharray="6 4" label={{ value: `목표 ${target.toFixed(1)}`, fill: 'var(--mute)', fontSize: 11, position: 'right' }} />
                <Line type="monotone" dataKey="avg" stroke="var(--ota-b1)" strokeWidth={2} isAnimationActive={false}
                  dot={{ r: 4, fill: 'var(--ota-b1)', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  )
}

// ── 불만 분석 ─────────────────────────────────────────────────────────
export function ComplaintPanel({ raw, memo, mode, monthlyOnly }: { raw: ComplaintWeek[]; memo: string; mode: TimeMode; monthlyOnly: boolean }) {
  if (raw.length === 0) return <div className="ota-none">데이터 없음</div>
  const rows = mode === 'monthly' && !monthlyOnly ? groupComplaintsByMonth(raw) : raw
  const first = raw.slice(0, 4)
  const baseRoom = first.reduce((s, c) => s + c.room, 0) / Math.max(first.length, 1)
  const baseBath = first.reduce((s, c) => s + c.bathroom, 0) / Math.max(first.length, 1)
  const latest = raw[raw.length - 1]
  const totRoom = raw.reduce((s, c) => s + c.room, 0)
  const totBath = raw.reduce((s, c) => s + c.bathroom, 0)
  const weeklyBase = mode === 'weekly' && !monthlyOnly

  return (
    <>
      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="k">최근 객실 불만</div><div className="v num">{latest.room}</div><div className="s">누적 <span className="num">{totRoom}</span>건</div></div>
        <div className="stat"><div className="k">최근 욕실 불만</div><div className="v num">{latest.bathroom}</div><div className="s">누적 <span className="num">{totBath}</span>건</div></div>
        <div className="stat"><div className="k">평균</div><div className="v num">{((totRoom + totBath) / raw.length).toFixed(1)}</div><div className="s">건 · 객실+욕실</div></div>
        <div className="stat"><div className="k">첫 <span className="num">4</span>{monthlyOnly ? '달' : '주'} 평균</div><div className="v num">{baseRoom.toFixed(1)} · {baseBath.toFixed(1)}</div><div className="s">객실 · 욕실</div></div>
      </div>
      <div className="ota-legend" aria-hidden="true">
        <span><i style={{ background: 'var(--ota-b1)' }} />객실 불만</span>
        <span><i style={{ background: 'var(--ota-b2)' }} />욕실 불만</span>
        {weeklyBase && <span><i className="dash" />첫 4주 평균</span>}
      </div>
      <div className="ota-chart" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="week" {...AXIS} interval="preserveStartEnd" />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={44} />
            <Tooltip cursor={{ stroke: 'var(--dim)', strokeDasharray: '3 3' }} content={(t: Any) => {
              if (!t.active || !t.payload?.length) return null
              const r = t.payload[0].payload as ComplaintWeek
              return <ChartTip title={r.week} items={[
                { color: 'var(--ota-b1)', name: '객실 불만', value: `${r.room}건` },
                { color: 'var(--ota-b2)', name: '욕실 불만', value: `${r.bathroom}건` },
              ]} />
            }} />
            {weeklyBase && baseRoom > 0 && <ReferenceLine y={Math.round(baseRoom * 10) / 10} stroke="var(--ota-b1)" strokeDasharray="6 4" strokeOpacity={0.6} />}
            {weeklyBase && baseBath > 0 && <ReferenceLine y={Math.round(baseBath * 10) / 10} stroke="var(--ota-b2)" strokeDasharray="6 4" strokeOpacity={0.6} />}
            <Line type="monotone" dataKey="room" name="객실 불만" stroke="var(--ota-b1)" strokeWidth={2} isAnimationActive={false}
              dot={{ r: 4, fill: 'var(--ota-b1)', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="bathroom" name="욕실 불만" stroke="var(--ota-b2)" strokeWidth={2} isAnimationActive={false}
              dot={{ r: 4, fill: 'var(--ota-b2)', stroke: 'var(--bg)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="sec-k" style={{ marginTop: 18 }}>운영 메모</div>
      {memo ? <div className="ota-memo">{memo}</div> : <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>메모 없음</div>}
    </>
  )
}

// ── VOC 키워드 ────────────────────────────────────────────────────────
export function VocPanel({ rows, mode }: { rows: VocRow[]; mode: TimeMode }) {
  const weeks = [...new Set(rows.map(v => v.week_start))].sort().reverse()
  const months = [...new Set(rows.map(v => v.week_start.substring(0, 7)))].sort().reverse()
  const periods = mode === 'weekly' ? weeks : months
  const [pick, setPick] = useState('')
  const period = periods.includes(pick) ? pick : periods[0] ?? ''
  if (!period) return <div className="ota-none">데이터 없음</div>

  const list = mode === 'weekly' ? rows.filter(v => v.week_start === period) : rows.filter(v => v.week_start.startsWith(period))
  const bands = [...new Set(list.map(v => v.band))]
  const chip = (p: string) => (mode === 'weekly' ? `${+p.substring(5, 7)}/${+p.substring(8, 10)}` : `${+p.substring(5, 7)}월`)

  return (
    <>
      <div className="ota-chips" role="group" aria-label={mode === 'weekly' ? 'VOC 주' : 'VOC 달'}>
        {periods.map(p => (
          <button type="button" key={p} className={`ota-chip${p === period ? ' on' : ''}`} aria-pressed={p === period} onClick={() => setPick(p)}>
            <span className="num">{chip(p)}</span>
          </button>
        ))}
      </div>
      {list.length === 0
        ? <div className="ota-none">데이터 없음</div>
        : bands.map(band => {
          const good = list.filter(v => v.band === band && v.sentiment === 'good')
          const bad = list.filter(v => v.band === band && v.sentiment === 'bad')
          return (
            <div key={band} className="ota-voc-band">
              <div className="ota-voc-h"><span className="num">{band}</span></div>
              <div className={`ota-voc-cols${good.length && bad.length ? '' : ' one'}`}>
                {good.length > 0 && (
                  <div>
                    <div className="ota-voc-k tone-ok">좋아요 <span className="num">{good.length}</span></div>
                    <div className="ota-voc-list">{good.map((v, i) => <span key={i} className="ota-kw ok">{v.keyword}</span>)}</div>
                  </div>
                )}
                {bad.length > 0 && (
                  <div>
                    <div className="ota-voc-k tone-over">나빠요 <span className="num">{bad.length}</span></div>
                    <div className="ota-voc-list">{bad.map((v, i) => <span key={i} className="ota-kw warn">{v.keyword}</span>)}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
    </>
  )
}
