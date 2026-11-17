'use client'
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, useXAxisScale, useYAxisScale } from 'recharts'
import { KR4_BRANCHES, addDays, md, scopeName, stats, trendKeys, type Kr4Data, type Kr4Mode } from '../../lib/kr4'
import Kr4Info, { InfoList } from './Kr4Info'
import { BRANCH_COLOR, CHIP, SECTION_TITLE } from './Kr4Shared'

const TOOLTIP = {
  contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'var(--text-1)' },
}
const GRAY = 'var(--text-3)'

interface Series { id: string; label: string; color: string; width: number; vals: (number | null)[]; cnt: number[]; main: boolean }
interface Row { k: string; name: string; [id: string]: string | number | null }

// 점 옆 점수 라벨 = 현재 HTML 의 valLabels 와 같은 규칙: 모든 선의 모든 점 오른쪽(점 반지름+6px — 고른 기간 점 r=8, 나머지 r=4), 같은 칸에서 14px 안으로 겹치면 아래로 밀어 냄, 굵은 선(3 이상)은 굵게
function ValLabels({ rows, series, sel }: { rows: Row[]; series: Series[]; sel: string[] }) {
  const xs = useXAxisScale(), ys = useYAxisScale()
  if (!xs || !ys) return null
  return (
    <g>
      {rows.flatMap((row, j) => {
        const L = series.flatMap(s => {
          const v = row[s.id]
          const x = xs(row.name), y = ys(v as number)
          return typeof v === 'number' && typeof x === 'number' && typeof y === 'number'
            ? [{ x: x + (sel.includes(row.k) ? 8 : 4) + 6, y, t: v.toFixed(2), c: s.color, b: s.width >= 3, key: `${j}-${s.id}` }] : []
        }).sort((a, b) => a.y - b.y)
        for (let k = 1; k < L.length; k++) if (L[k].y - L[k - 1].y < 14) L[k].y = L[k - 1].y + 14
        return L.map(l => (
          <text key={l.key} x={l.x} y={l.y} dominantBaseline="middle" textAnchor="start" fill={l.c}
            style={{ fontSize: 12, fontWeight: l.b ? 700 : 500, paintOrder: 'stroke', stroke: 'var(--bg-card)', strokeWidth: 3, strokeLinejoin: 'round' }}>{l.t}</text>
        ))
      })}
    </g>
  )
}

// 점수 추이: 가로축 = 고른 기간만, 「직전 n주(달)와 비교」를 켜면 앞쪽 n개를 붙임(점과 선 회색, 눈금에 「직전」). 점을 누르면 그 기간 토글
export default function Kr4Trend({ data, mode, sel, branchSel, cmpOn, cmpN, onCmp, onPick }: {
  data: Kr4Data; mode: Kr4Mode; sel: string[]; branchSel: string[]; cmpOn: boolean; cmpN: number
  onCmp: (on: boolean, n: number) => void; onPick: (k: string) => void
}) {
  const [showBr, setShowBr] = useState(false)
  // recharts 는 서버에서 폭을 모르는 채로 그려 하이드레이션이 어긋난다 — 마운트 뒤에만 그린다
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [showAvg, setShowAvg] = useState<boolean | null>(null)
  const unit = mode === 'w' ? '주' : '달'
  const all = !branchSel.length
  const avgOn = showAvg ?? all

  const { keys, prev } = useMemo(() => trendKeys(data, mode, sel, cmpOn ? cmpN : 0), [data, mode, sel, cmpOn, cmpN])
  const label = (k: string) => (mode === 'w' ? `${md(addDays(k, -6))}~${md(k)}${k >= data.last ? '*' : ''}` : `${+k.slice(5)}월`)
  const labels = keys.map(label)

  const series = useMemo(() => {
    const mk = (id: string, name: string, bs: string[], color: string, width: number, main: boolean): Series => {
      const st = stats(data, mode, keys, bs)
      return { id, label: name, color, width, vals: st.map(x => (x ? x.v : null)), cnt: st.map(x => (x ? x.n : 0)), main }
    }
    const out: Series[] = []
    if (all) out.push(mk('avg', '4개 지점 평균', [], 'var(--text-1)', 4, true))
    else if (avgOn) out.push(mk('avg', '4개 지점 평균(비교)', [], 'var(--text-1)', 1.5, false))
    if (branchSel.length > 1) out.push(mk('sum', scopeName(branchSel), branchSel, 'var(--accent)', 4.5, true))
    ;(branchSel.length ? branchSel : showBr ? [...KR4_BRANCHES] : []).forEach(b =>
      out.push(mk(b, b, [b], BRANCH_COLOR[b], branchSel.length === 1 ? 4.5 : 1.8, branchSel.length === 1)))
    return out
  }, [data, mode, keys, all, avgOn, branchSel, showBr])

  const rows: Row[] = keys.map((k, i) => ({ k, name: labels[i], ...Object.fromEntries(series.flatMap(s => [[s.id, s.vals[i]], [s.id + '_n', s.cnt[i]]])) }))
  const vis = series.flatMap(s => s.vals).filter((v): v is number => v != null)
  const ymin = vis.length ? Math.min(8.5, Math.floor((Math.min(...vis) - 0.3) / 0.5) * 0.5) : 8.5
  const ymax = vis.length ? Math.min(10, Math.max(9.5, Math.ceil((Math.max(...vis) + 0.3) / 0.5) * 0.5)) : 9.5
  const opts = mode === 'w' ? [1, 2, 4, 8] : [1, 2, 3]
  const isPrev = (k: string) => prev.includes(k)
  // 직전 구간은 선도 회색: 마지막 직전 점까지를 회색, 그 뒤를 선 색으로(기울기 그라데이션 = 가로 비율)
  const cut = prev.length > 0 && keys.length > 1 ? (prev.length - 1) / (keys.length - 1) : null
  const stroke = (s: Series) => (cut == null ? s.color : `url(#kr4g-${s.id})`)

  const Tick = ({ x, y, payload, index }: { x?: number; y?: number; payload?: { value: string }; index?: number }) => (
    <text x={x} y={(y ?? 0) + 12} textAnchor="middle" fill={GRAY} style={{ fontSize: 11 }}>
      <tspan x={x}>{payload?.value}</tspan>{index != null && isPrev(keys[index]) && <tspan x={x} dy={13}>직전</tspan>}
    </text>
  )

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div style={SECTION_TITLE}>
          {scopeName(branchSel)}, {mode === 'w' ? '주별' : '월별'} OTA 점수
          {cmpOn && prev.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>직전 {prev.length}{unit} 포함</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {all
            ? <button style={CHIP(showBr)} onClick={() => setShowBr(v => !v)}>{showBr ? '✓ ' : ''}지점별 보기</button>
            : <button style={CHIP(avgOn)} onClick={() => setShowAvg(!avgOn)}>{avgOn ? '✓ ' : ''}4개 지점 평균(비교)</button>}
          <label style={{ ...CHIP(cmpOn), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={cmpOn} onChange={e => onCmp(e.target.checked, cmpN)} />
            직전
            <select value={cmpN} onChange={e => onCmp(cmpOn, +e.target.value)} style={{ background: 'transparent', color: 'inherit', border: 'none', fontSize: 12 }}>
              {opts.map(n => <option key={n} value={n} style={{ color: '#000' }}>{n}</option>)}
            </select>
            {unit}와 비교
          </label>
          <Kr4Info align="right" width={400}>
            <InfoList items={[
              '가로축 = 달력에서 고른 기간만. 「직전 n주(달)와 비교」를 켜면 그 앞 n개를 회색으로 붙임(「직전」 표시)',
              '요약의 「직전 1주」 칸은 이 설정과 무관(고른 기간과 같은 길이의 바로 앞 기간)',
              '점을 누르면 그 주(달)가 켜지고 다시 누르면 꺼짐, 여러 개 = 합산',
              '점 옆 숫자 = 그 기간 점수, 굵은 선 = 고른 지점(전체면 4개 지점 평균)',
              '옅은 띠 = 8.9~9.0, 빨간 점선 = Target 9.0',
              '세로축 위아래 끝 = 보이는 점수에 맞춰 바뀜',
            ]} />
          </Kr4Info>
        </div>
      </div>
      {keys.length === 1 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
          한 {unit}만 골랐습니다. 추이를 보려면 여러 {unit}{mode === 'w' ? '를' : '을'} 고르거나 「직전 n{unit}와 비교」를 켜세요
        </div>
      )}
      <div style={{ width: '100%', height: 340 }}>
        {mounted && <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 44, bottom: 4, left: 0 }}
            onClick={(e: any) => { const k = e?.activePayload?.[0]?.payload?.k; if (k) onPick(k) }}>
            {cut != null && (
              <defs>
                {series.map(s => (
                  <linearGradient key={s.id} id={`kr4g-${s.id}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset={cut} style={{ stopColor: GRAY }} /><stop offset={cut} style={{ stopColor: s.color }} />
                  </linearGradient>
                ))}
              </defs>
            )}
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={<Tick />} tickLine={false} height={prev.length ? 44 : 30} interval={0} />
            <YAxis domain={[ymin, ymax]} tickFormatter={(v: number) => v.toFixed(1)} ticks={Array.from({ length: Math.round((ymax - ymin) / 0.5) + 1 }, (_, i) => ymin + i * 0.5)} tick={{ fill: 'var(--text-3)', fontSize: 11 }} tickLine={false} width={40} />
            <ReferenceArea y1={8.9} y2={9} fill="var(--critical)" fillOpacity={0.1} />
            <ReferenceLine y={9} stroke="var(--critical)" strokeDasharray="6 4" />
            <ReferenceLine y={8.9} stroke="var(--text-3)" strokeDasharray="3 3" />
            <Legend verticalAlign="top" height={28} content={() => (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', fontSize: 12, color: 'var(--text-1)', paddingBottom: 6 }}>
                {series.map(s => <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 14, height: 14, background: s.color, display: 'inline-block' }} />{s.label}</span>)}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 14, height: 14, border: '2px dashed var(--critical)', display: 'inline-block', boxSizing: 'border-box' }} />Target 9.0</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 14, height: 14, border: '2px dotted var(--text-3)', display: 'inline-block', boxSizing: 'border-box' }} />Baseline 8.9</span>
              </div>
            )} />
            <Tooltip {...TOOLTIP}
              formatter={(v: any, name: any, p: any) => [`${Number(v).toFixed(2)} (${p?.payload?.[`${p?.dataKey}_n`] ?? 0}건)`, name]} />
            {series.map(s => (
              <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={stroke(s)} strokeWidth={s.width} connectNulls
                dot={(p: any) => {
                  if (p.value == null || p.cy == null || Number.isNaN(p.cy)) return <g key={`${s.id}-${p.index}`} />   // 리뷰 없는 기간은 점을 그리지 않음
                  const k = p.payload.k as string, c = isPrev(k) ? GRAY : s.color
                  return <circle key={`${s.id}-${p.index}`} cx={p.cx} cy={p.cy} r={sel.includes(k) ? 8 : 4} fill={c} stroke="none" style={{ cursor: 'pointer' }} />
                }}
                activeDot={{ r: 9 }} isAnimationActive={false} />
            ))}
            <ValLabels rows={rows} series={series} sel={sel} />
          </LineChart>
        </ResponsiveContainer>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>* = {md(data.last)} 수집분까지 · 점을 누르면 그 {unit}을 켜고 끔 · 점 위에 올리면 건수</div>
    </div>
  )
}
