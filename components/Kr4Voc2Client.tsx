'use client'
import { useMemo, useState } from 'react'
import {
  V2_BRANCHES, V2_TARGET, cellOf, inMonth, inWeek, monthOf, monthToDate, monthsOf, topComplaints, v2Tone, weekStart, weeksOf,
  type V2Cell, type V2Tone,
} from '../lib/kr4v2'
import type { Kr4v2Props } from '../lib/kr4v2Data'
import type { Kr4Props } from '../lib/kr4Data'
import { buildKr4Data, latestKey, type Kr4Row } from '../lib/kr4'
import Kr4Cards from './kr4/Kr4Cards'

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
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</span>
    </div>
  )
}

export default function Kr4Voc2Client({ reviews, stars, analyzedAt, notice, kr4 }: Kr4v2Props & { kr4: Kr4Props }) {
  const kd = useMemo(() => buildKr4Data(kr4.rows as Kr4Row[], kr4.collectedThrough ?? undefined), [kr4])
  const [branchSel, setBranchSel] = useState<string[]>([])
  const weeks = useMemo(() => weeksOf(reviews), [reviews])
  const months = useMemo(() => monthsOf(reviews), [reviews])
  const [week, setWeek] = useState(() => weeks[weeks.length - 1] ?? '')

  if (!reviews.length || !week) {
    return <div style={{ padding: 32, color: 'var(--text-2)', fontSize: 13 }}>{notice ?? '아직 분석한 리뷰가 없습니다.'}</div>
  }

  const recent = weeks.slice(-8)
  const lastDate = reviews.reduce((a, r) => (r.review_date > a ? r.review_date : a), '')
  // toLocaleString 은 서버와 브라우저 로케일이 달라 하이드레이션이 어긋난다 — KST(+9h)로 직접 만든다
  const stamp = analyzedAt ? new Date(new Date(analyzedAt).getTime() + 9 * 3600e3).toISOString().slice(0, 10) : ''
  const month = monthOf(week)

  return (
    <div className="page-pad" style={{ padding: '28px 32px', maxWidth: 1180 }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Stay OTA 리뷰 · 목적 9.0 · 지표 불편 지수</div>
        <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>KR4 STAY VOC 2.0 주간 리포트</h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, ...num }}>
          {md(lastDate)} 리뷰까지 분석 · 분석 리뷰 {reviews.length.toLocaleString('en-US')}건{stamp ? ` · 분석 ${md(stamp)}` : ''}
        </p>
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

      <Heading k="목적" title="신규 리뷰 평점" sub="Target 9.0 · KR4 STAY VOC 주간 점수와 같은 값" />
      {kd.recs.length
        ? <Kr4Cards data={kd} ota={{ props: kr4.ota.props, scores: kr4.ota.scores }} mode="w"
            sel={[kd.weeks.includes(week) ? week : latestKey(kd, 'w')]} branchSel={branchSel}
            onPick={b => setBranchSel(cur => (b == null || cur.includes(b) ? [] : [b]))} />
        : <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{kr4.notice ?? '점수 데이터가 없습니다.'}</p>}

      <Heading k="지표" title="불편 지수" sub={`리뷰 100건당 불편 수 · 목표 ${V2_TARGET} 미만`} />
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
                {b === '고성' && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>분기로 판단</span>}
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
                <dt style={{ color: 'var(--text-3)' }}>고른 주</dt>
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

      <Section title={`${mLabel(month)} 가장 많은 불편`} sub={`${md(month + '-01')}–${md(week)} 리뷰 기준. 건수 많은 순, 같으면 그 불편이 나온 리뷰의 평균 점수가 낮은 순입니다. 수행과제 후보입니다.`}>
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

      <Section title="주별 불편 지수" sub="최근 8주. 리뷰가 10건 미만인 칸은 흐리게 보입니다(한두 건에 크게 흔들립니다).">
        <IndexTable cols={recent} label={w => md(w)} cell={(b, w) => cellOf(inWeek(reviews, b, w))} />
      </Section>

      <Section title="월별 불편 지수" sub="수행과제는 달 누적으로 정합니다. 이번 달은 마지막 분석일까지의 값입니다.">
        <IndexTable cols={months} label={mLabel} cell={(b, m) => cellOf(inMonth(reviews, b, m))} />
      </Section>

      <section style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>기준</h2>
        <p>불편 지수 = 불편 수 ÷ 분석한 리뷰 수 × 100. 리뷰 한 건에 불편이 셋이면 셋으로 세고, 점수와 상관없이 셉니다.</p>
        <p>분석한 리뷰 = 수집한 OTA 리뷰를 STAY VOC 2.0 기준으로 하나씩 읽은 리뷰입니다. 불편이 없거나 글이 없는 리뷰도 분모에 들어갑니다.</p>
        <p>목표 = 지점마다 매달 불편 지수 50 미만, 결과 목표 = 신규 리뷰 평균 9.0입니다. 주는 화요일부터 월요일까지입니다.</p>
      </section>
    </div>
  )
}
