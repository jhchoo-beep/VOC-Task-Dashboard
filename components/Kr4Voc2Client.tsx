'use client'
import { useMemo, useState } from 'react'
import {
  V2_BRANCHES, cellOf, inMonth, inWeek, monthOf, monthToDate, monthsOf, topComplaints, v2Tone, weekStart, weeksOf,
  type V2Cell, type V2Tone,
} from '../lib/kr4v2'
import type { Kr4v2Props } from '../lib/kr4v2Data'
import type { Kr4Props } from '../lib/kr4Data'
import { avg, buildKr4Data, f2, kpiCells, latestKey, prevKeys, rowsFor, tone, type Kr4Data, type Kr4Row, type OtaProperty, type OtaScore } from '../lib/kr4'
import { TONE_COLOR } from './kr4/Kr4Shared'

// KR4 STAY VOC 2.0 주간 리포트 — 선택 상태는 주 하나. 달 누적은 그 주가 끝나는 날까지의 같은 달 리뷰.
const TONE: Record<V2Tone, string> = { ok: 'var(--done)', over: 'var(--critical)', none: 'var(--text-3)' }
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`
const mLabel = (m: string) => `${+m.slice(5, 7)}월`
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const FEW = 10   // 이보다 적은 리뷰의 지수는 흐리게 보인다(한두 건에 크게 흔들린다)

function Idx({ c, size = 13 }: { c: V2Cell; size?: number }) {
  if (c.idx == null) return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>리뷰 없음</span>
  return (
    <b style={{ ...num, fontSize: size, color: TONE[v2Tone(c.idx)], opacity: c.n < FEW ? 0.55 : 1 }}>{c.idx.toFixed(1)}</b>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: '16px 18px', marginTop: 16 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>{sub}</p>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  )
}

const th: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { textAlign: 'right', padding: '7px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }

function IndexTable({ cols, label, cell }: { cols: string[]; label: (c: string) => string; cell: (b: string, c: string) => V2Cell }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 120 + cols.length * 64 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>지점</th>
            {cols.map(c => <th key={c} style={th}>{label(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {V2_BRANCHES.map(b => (
            <tr key={b}>
              <td style={{ ...td, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{b}</td>
              {cols.map(c => {
                const x = cell(b, c)
                return (
                  <td key={c} style={td}>
                    {x.idx == null ? <span style={{ fontSize: 12, color: 'var(--text-3)' }}>·</span> : <Idx c={x} />}
                    <div style={{ ...num, fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{x.n ? `${x.n}건` : ''}</div>
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

// 목적(신규 리뷰 평점 9.0)은 KR4 주간 점수(kr4_reviews)의 카드를 그대로 쓰고, 지표(불편 지수)는 V2 분석으로 계산한다.
// 🔴 점수는 V2 분석 리뷰로 다시 계산하지 않는다 — 같은 화면에 기준이 다른 평균이 두 개 뜬다.
function Heading({ k, title, sub }: { k: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', margin: '18px 0 10px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{k}</span>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
      {sub && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</span>}
    </div>
  )
}

// 점수 카드 — KR4 주간 점수와 같은 계산(lib/kr4 kpiCells·rowsFor·prevKeys)을 쓰고, 좁은 폭에서도 줄바꿈되지 않게 값을 세로로 쌓는다.
// 지점 카드는 아래 불편 지수 카드와 같은 칸에 놓아 위아래로 같은 지점이 오게 한다(전체는 위에 한 줄).
function scoreOf(kd: Kr4Data, wk: string, b: string | null) {
  const bs = b == null ? [] : [b]
  const [ota, mon] = kpiCells(kd, { props: [], scores: [] }, b)
  const sel = [kd.weeks.includes(wk) ? wk : latestKey(kd, 'w')]
  const rs = rowsFor(kd, 'w', sel, bs)
  const pk = prevKeys(kd, 'w', sel)
  const a = avg(rs), p = pk ? avg(rowsFor(kd, 'w', pk, bs)) : null
  return { ota, mon, wk: a, wn: rs.length, d: a != null && p != null ? a - p : null }
}
const Delta = ({ d }: { d: number | null }) =>
  d == null ? null : <span style={{ ...num, fontSize: 11, fontWeight: 600, color: d < 0 ? 'var(--critical)' : 'var(--done)' }}>{d >= 0 ? '+' : ''}{d.toFixed(2)}</span>

function ScoreBlock({ kd, ota, wk, b }: { kd: Kr4Data; ota: { props: OtaProperty[]; scores: OtaScore[] }; wk: string; b: string | null }) {
  const s = scoreOf(kd, wk, b)
  const o = kpiCells(kd, ota, b)[0]
  const big = (v: number | null) => <span style={{ ...num, fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: TONE_COLOR[tone(v)] }}>{f2(v)}</span>
  const sm = (v: number | null) => <b style={{ ...num, fontSize: 13, color: TONE_COLOR[tone(v)] }}>{f2(v)}</b>
  const n = (x: number) => <span style={{ ...num, fontSize: 11, color: 'var(--text-3)' }}>{x.toLocaleString('en-US')}건</span>
  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>{s.mon.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>{big(s.mon.v)}{n(s.mon.n)}</div>
      <dl style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 5, columnGap: 10, fontSize: 12 }}>
        <dt style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>해당 주</dt>
        <dd style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{s.wk == null ? <span style={{ color: 'var(--text-3)' }}>리뷰 없음</span> : <>{sm(s.wk)} {n(s.wn)}</>}</dd>
        <dt style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>직전 대비</dt>
        <dd style={{ textAlign: 'right' }}>{s.d == null ? <span style={{ color: 'var(--text-3)' }}>–</span> : <Delta d={s.d} />}</dd>
        <dt style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }} title="OTA 사이트에 표시된 누적 평점과 리뷰 수. 5점 만점 채널은 2배 환산, 리뷰 수 가중.">OTA 평점</dt>
        <dd style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{o.v == null ? '–' : <>{sm(o.v)} {n(o.n)}</>}</dd>
      </dl>
    </>
  )
}

export default function Kr4Voc2Client({ reviews, stars, notice, kr4 }: Kr4v2Props & { kr4: Kr4Props }) {
  const kd = useMemo(() => buildKr4Data(kr4.rows as Kr4Row[], kr4.collectedThrough ?? undefined), [kr4])
  const weeks = useMemo(() => weeksOf(reviews), [reviews])
  const months = useMemo(() => monthsOf(reviews), [reviews])
  const [week, setWeek] = useState(() => weeks[weeks.length - 1] ?? '')

  if (!reviews.length || !week) {
    return <div style={{ padding: 32, color: 'var(--text-2)', fontSize: 13 }}>{notice ?? '아직 분석한 리뷰가 없습니다.'}</div>
  }

  const recent = weeks.slice(-8)
  const month = monthOf(week)

  return (
    <div className="page-pad" style={{ padding: '28px 32px', maxWidth: 1180 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>KR4 STAY VOC 2.0 주간 리포트</h1>
      </header>

      <div role="group" aria-label="주 고르기" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {recent.map(w => {
          const on = w === week
          return (
            <button key={w} onClick={() => setWeek(w)} aria-pressed={on} style={{
              ...num, fontSize: 12, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', font: 'inherit',
              border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'var(--accent)' : 'var(--bg-card)', color: on ? '#fff' : 'var(--text-2)', fontWeight: on ? 600 : 400,
            }}>{md(weekStart(w))}–{md(w)}</button>
          )
        })}
      </div>

      <Heading k="목적" title="신규 리뷰 평점" sub="" />
      {kd.recs.length ? (() => {
        const all = scoreOf(kd, week, null)
        const ota = { props: kr4.ota.props, scores: kr4.ota.scores }
        const o = kpiCells(kd, ota, null)[0]
        return (
          <>
            <div className="card" style={{ padding: '10px 16px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 18, rowGap: 4, fontSize: 12, color: 'var(--text-3)' }}>
              <b style={{ fontSize: 13, color: 'var(--text-1)' }}>4개 지점 전체</b>
              <span>{all.mon.label} <b style={{ ...num, fontSize: 15, color: TONE_COLOR[tone(all.mon.v)] }}>{f2(all.mon.v)}</b> <span style={num}>{all.mon.n}건</span></span>
              <span>해당 주 <b style={{ ...num, fontSize: 15, color: TONE_COLOR[tone(all.wk)] }}>{f2(all.wk)}</b> <span style={num}>{all.wn}건</span> <Delta d={all.d} /></span>
              <span>OTA 표시 평점 <b style={{ ...num, color: TONE_COLOR[tone(o.v)] }}>{f2(o.v)}</b></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {V2_BRANCHES.map(b => (
                <article key={b} className="card" style={{ padding: '14px 16px' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{b}</h3>
                  <ScoreBlock kd={kd} ota={ota} wk={week} b={b} />
                </article>
              ))}
            </div>
          </>
        )
      })()
        : <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{kr4.notice ?? '점수 데이터가 없습니다.'}</p>}

      <Heading k="지표" title="불편 지수" sub="" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {V2_BRANCHES.map(b => {
          const m = cellOf(monthToDate(reviews, b, week))
          const w = cellOf(inWeek(reviews, b, week))
          const top = topComplaints(monthToDate(reviews, b, week), stars, 1)[0]
          const t = v2Tone(m.idx)
          return (
            <article key={b} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{b}</h3>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>{mLabel(month)} 누적 불편 지수</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                <span style={{ ...num, fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: TONE[t] }}>{m.idx == null ? '–' : m.idx.toFixed(1)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: TONE[t], whiteSpace: 'nowrap' }}>{t === 'ok' ? '목표 안' : t === 'over' ? '목표 넘음' : ''}</span>
              </div>
              <div style={{ ...num, fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                리뷰 {m.n}건 · 불편 {m.neg}개
              </div>
              <dl style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 5, columnGap: 10, fontSize: 12 }}>
                <dt style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>해당 주</dt>
                <dd style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><Idx c={w} /> <span style={{ ...num, fontSize: 11, color: 'var(--text-3)' }}>{w.n ? `${w.n}건` : ''}</span></dd>
              </dl>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>가장 많은 불편</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginTop: 2, lineHeight: 1.4 }}>
                {top ? <>{top.phenomenon} <span style={{ ...num, fontWeight: 400, color: 'var(--text-3)' }}>{top.count}개</span></> : '없음'}
              </div>
            </article>
          )
        })}
      </div>

      <Section title={`${mLabel(month)} 가장 많은 불편`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {V2_BRANCHES.map(b => {
            const list = topComplaints(monthToDate(reviews, b, week), stars, 5)
            return (
              <div key={b}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{b}</h3>
                {list.length === 0
                  ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>불편 없음</p>
                  : <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {list.map((x, i) => (
                        <li key={x.phenomenon} style={{ display: 'grid', gridTemplateColumns: '16px 1fr auto', gap: 6, alignItems: 'baseline', padding: '5px 0', borderTop: i ? '1px solid var(--border)' : undefined }}>
                          <span style={{ ...num, fontSize: 11, color: 'var(--text-3)' }}>{i + 1}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.4 }}>
                            {x.phenomenon}
                            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>{x.galaxy} · {x.owner}{x.avg != null ? ` · 리뷰 평균 ${x.avg.toFixed(1)}` : ''}</span>
                          </span>
                          <b style={{ ...num, fontSize: 13, color: 'var(--text-1)' }}>{x.count}</b>
                        </li>
                      ))}
                    </ol>}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="주별 불편 지수">
        <IndexTable cols={recent} label={w => md(w)} cell={(b, w) => cellOf(inWeek(reviews, b, w))} />
      </Section>

      <Section title="월별 불편 지수">
        <IndexTable cols={months} label={mLabel} cell={(b, m) => cellOf(inMonth(reviews, b, m))} />
      </Section>
    </div>
  )
}
