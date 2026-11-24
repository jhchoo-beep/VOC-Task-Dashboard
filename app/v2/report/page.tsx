// STAY VOC 2.0 리포트 — A 보고서형. 월간(기본)과 주간(?view=week). 판단 기준은 불편 지수, 9.0은 결과로만 본다.
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getTaskBriefs, getV2Base } from '@/lib/v2/data'
import {
  ALL, BRANCHES, TARGET_INDEX, cellOf, inScope, monthsOf, periodLabel, periodMonths, rankComplaints, scoreTone, toneOf, type Cell, type Scope,
} from '@/lib/v2/metrics'
import { inWeek, recurring, starsOfReviews, weekStartOf, weeksOf } from '@/lib/v2/trends'
import { f1, f2, mLabel, md, toneClass } from '@/components/v2/parts'

type SP = Promise<{ [k: string]: string | string[] | undefined }>
const FEW = 10   // 이보다 적은 리뷰의 지수는 흐리게(한두 건에 크게 흔들린다)
const REC_SHOWN = 15   // 반복 불편은 리뷰 많은 15건만 펼쳐 두고 나머지는 접는다

function Heat({ c }: { c: Cell }) {
  if (c.idx == null) return <span className="dim">·</span>
  const over = c.idx >= TARGET_INDEX
  return (
    <span className="heat num" style={{ background: over ? 'var(--warn-s)' : 'var(--ok-s)', color: over ? 'var(--warn)' : 'var(--ok)', opacity: c.n < FEW ? 0.55 : 1 }}>
      {f1(c.idx)}
    </span>
  )
}

function Delta({ now, prev }: { now: number | null; prev: number | null }) {
  if (now == null || prev == null) return null
  const d = Math.round((now - prev) * 10) / 10
  if (d === 0) return <span className="delta dim num">±0</span>
  // 불편 지수는 내려가야 좋다
  return <span className={`delta num ${d < 0 ? 'tone-ok' : 'tone-over'}`}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>
}

export default async function ReportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const [base, tasks] = await Promise.all([getV2Base(), getTaskBriefs()])
  const months = monthsOf(base.revs)
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const view = str('view') === 'week' ? 'week' : 'month'
  const month = months.includes(str('month') ?? '') ? str('month')! : months[months.length - 1]

  if (!month) return <main className="v2-home"><div className="empty">{base.error ?? '아직 분석한 리뷰가 없습니다.'}</div></main>

  const viewSegs = (
    <nav className="segs" aria-label="리포트 주기">
      <Link href={`/v2/report?month=${month}`} className={`seg${view === 'month' ? ' on' : ''}`}>월간</Link>
      <Link href="/v2/report?view=week" className={`seg${view === 'week' ? ' on' : ''}`}>주간</Link>
    </nav>
  )

  if (view === 'week') return <WeekView base={base} weekParam={str('week')} viewSegs={viewSegs} />

  const prevMonth = months[months.indexOf(month) - 1]
  const window3 = months.slice(0, months.indexOf(month) + 1).slice(-3)
  const rec = recurring(base.stars, window3)
  const monthTasks = tasks.filter(t => t.task_month === month)
  const rowOf = (s: Scope) => {
    const c = cellOf(inScope(base.revs, s, periodMonths(s, month)))
    const p = prevMonth ? cellOf(inScope(base.revs, s, periodMonths(s, prevMonth))) : null
    return { c, p }
  }

  return (
    <main className="v2-home">
      <div className="v2-home-head">
        <div>
          <div className="v2-eyebrow">{month.slice(0, 4)}년 {mLabel(month)} · 월간</div>
          <h1 className="v2-h1">{mLabel(month)} 리포트</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {viewSegs}
          <nav className="segs" aria-label="기준 달">
            {months.slice(-6).map(m => (
              <Link key={m} href={`/v2/report?month=${m}`} className={`seg${m === month ? ' on' : ''}`} aria-current={m === month ? 'true' : undefined}>{mLabel(m)}</Link>
            ))}
          </nav>
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>지점별 불편 지수</h2><span>목표 {TARGET_INDEX} 미만 · 고성은 분기</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>지점</th><th>불편 지수</th><th>{prevMonth ? `${mLabel(prevMonth)} 대비` : '전월 대비'}</th><th>신규 리뷰 평균</th><th>저점 칭찬 지수</th><th>분석한 리뷰</th><th>불편 건수</th>
            </tr></thead>
            <tbody>
              {[...BRANCHES, ALL].map(b => {
                const { c, p } = rowOf(b as Scope)
                return (
                  <tr key={b} className={b === ALL ? 'total' : ''}>
                    <td><Link href={`/v2/discomfort?${b === ALL ? '' : `branch=${encodeURIComponent(b)}&`}month=${month}`}>{b === ALL ? '전 지점' : b}</Link>{b !== ALL && periodLabel(b as Scope, month) !== mLabel(month) && <span className="dim" style={{ fontSize: 12, marginLeft: 6 }}>{periodLabel(b as Scope, month)}</span>}</td>
                    <td><Heat c={c} /></td>
                    <td><Delta now={c.idx} prev={p?.idx ?? null} />{p == null && <span className="dim">–</span>}</td>
                    <td><span className={`num ${toneClass(scoreTone(c.avg))}`}>{f2(c.avg)}</span></td>
                    <td><span className="num">{f1(c.lowIdx)}</span></td>
                    <td><span className="num">{c.n}</span></td>
                    <td><span className="num">{c.neg}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>불편 지수를 가장 올린 불편</h2><span>지점별 상위 5 · 수행과제 등록은 FO 판단</span></div>
        <div className="sm-grid">
          {BRANCHES.map(b => {
            const pm = periodMonths(b, month)
            const ranks = rankComplaints(inScope(base.revs, b, pm), inScope(base.stars, b, pm)).slice(0, 5)
            return (
              <div key={b} className="card">
                <span className="card-k"><span>{b} · {periodLabel(b, month)}</span></span>
                <div className="rank-list">
                  {ranks.length === 0 && <span className="muted" style={{ fontSize: 13, paddingTop: 8 }}>불편 없음</span>}
                  {ranks.map((r, i) => (
                    <Link key={r.phenomenon} href={`/v2/discomfort?branch=${encodeURIComponent(b)}&month=${month}&p=${encodeURIComponent(r.phenomenon)}`}>
                      <span className="tl-rank num">{i + 1}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="tl-name" style={{ display: 'block' }}>{r.phenomenon}</span>
                        <span className="tl-meta" style={{ display: 'block' }}>{r.galaxy} · +<span className="num">{f1(r.contrib)}</span></span>
                      </span>
                      <span className="tl-n num">{r.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>반복 불편</h2><span>{mLabel(window3[0])}~{mLabel(window3[window3.length - 1])} · 같은 지점에서 서로 다른 리뷰 3건 이상</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>지점</th><th className="l">불편</th><th className="l">카테고리</th><th className="l">고칠 수 있는 주체</th>
              {window3.map(m => <th key={m}>{mLabel(m)}</th>)}<th>리뷰</th>
            </tr></thead>
            <tbody>
              {rec.length === 0 && <tr><td colSpan={5 + window3.length} className="l muted">반복 불편 없음</td></tr>}
              {rec.slice(0, REC_SHOWN).map(r => (
                <tr key={`${r.branch}-${r.phenomenon}`}>
                  <td>{r.branch}</td>
                  <td className="l"><Link href={`/v2/discomfort?branch=${encodeURIComponent(r.branch)}&month=${month}&p=${encodeURIComponent(r.phenomenon)}`}>{r.phenomenon}</Link></td>
                  <td className="l muted">{r.galaxy}</td>
                  <td className="l muted">{r.owner || '미정'}</td>
                  {r.byMonth.map((n, i) => <td key={i}><span className={`num ${n ? '' : 'dim'}`}>{n || '·'}</span></td>)}
                  <td><b className="num">{r.reviews}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rec.length > REC_SHOWN && (
            <details className="more">
              <summary>나머지 <span className="num">{rec.length - REC_SHOWN}</span>건 보기</summary>
              <table className="tbl">
                <tbody>
                  {rec.slice(REC_SHOWN).map(r => (
                    <tr key={`${r.branch}-${r.phenomenon}`}>
                      <td>{r.branch}</td>
                      <td className="l"><Link href={`/v2/discomfort?branch=${encodeURIComponent(r.branch)}&month=${month}&p=${encodeURIComponent(r.phenomenon)}`}>{r.phenomenon}</Link></td>
                      <td className="l muted">{r.galaxy}</td>
                      <td className="l muted">{r.owner || '미정'}</td>
                      {r.byMonth.map((n, i) => <td key={i}><span className={`num ${n ? '' : 'dim'}`}>{n || '·'}</span></td>)}
                      <td><b className="num">{r.reviews}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>{mLabel(month)} 등록 수행과제</h2><span><span className="num">{monthTasks.length}</span>건</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>지점</th><th className="l">수행과제</th><th>상태</th><th>기한</th></tr></thead>
            <tbody>
              {monthTasks.length === 0 && <tr><td colSpan={4} className="l muted">이 달에 등록한 수행과제 없음</td></tr>}
              {monthTasks.map(t => (
                <tr key={t.id}>
                  <td>{t.branch}</td>
                  <td className="l"><Link href={`/v2/tasks?id=${t.id}`}>{t.title}</Link></td>
                  <td><span className={`pill ${t.status === '완료' ? 'ok' : t.status === '진행중' ? 'know' : ''}`}>{t.status}</span></td>
                  <td><span className="num muted">{t.due_date ?? '–'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function WeekView({ base, weekParam, viewSegs }: { base: Awaited<ReturnType<typeof getV2Base>>; weekParam?: string; viewSegs: React.ReactNode }) {
  const weeks = weeksOf(base.revs)
  const week = weeks.includes(weekParam ?? '') ? weekParam! : weeks[weeks.length - 1]
  if (!week) return <main className="v2-home"><div className="empty">주 단위 분석 데이터가 없습니다.</div></main>
  const shown = weeks.slice(0, weeks.indexOf(week) + 1).slice(-8)
  const label = (w: string) => `${md(weekStartOf(w))}~${md(w)}`
  return (
    <main className="v2-home">
      <div className="v2-home-head">
        <div>
          <div className="v2-eyebrow">{label(week)} · 주간</div>
          <h1 className="v2-h1">주간 리포트</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {viewSegs}
          <nav className="segs" aria-label="기준 주">
            {weeks.slice(-6).map(w => (
              <Link key={w} href={`/v2/report?view=week&week=${w}`} className={`seg${w === week ? ' on' : ''}`} aria-current={w === week ? 'true' : undefined}>{md(w)}</Link>
            ))}
          </nav>
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>주별 불편 지수</h2><span>화~월 · 목표 {TARGET_INDEX} 미만 · 리뷰 {FEW}건 미만은 흐리게</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>지점</th>{shown.map(w => <th key={w}>{label(w)}</th>)}</tr></thead>
            <tbody>
              {[...BRANCHES, ALL].map(b => (
                <tr key={b} className={b === ALL ? 'total' : ''}>
                  <td>{b === ALL ? '전 지점' : b}</td>
                  {shown.map(w => {
                    const c = cellOf(inWeek(base.revs, b as Scope, w))
                    return <td key={w}><Heat c={c} /><div className="dim num" style={{ fontSize: 11, marginTop: 3 }}>{c.n ? `${c.n}건` : ''}</div></td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>{label(week)} 불편 상위</h2><span>지점별 상위 5</span></div>
        <div className="sm-grid">
          {BRANCHES.map(b => {
            const revs = inWeek(base.revs, b, week)
            const c = cellOf(revs)
            const ranks = rankComplaints(revs, starsOfReviews(base.stars, revs)).slice(0, 5)
            return (
              <div key={b} className="card">
                <span className="card-k"><span>{b}</span><span className={`num ${toneClass(toneOf(c.idx))}`} style={{ fontSize: 15 }}>{f1(c.idx)}</span></span>
                <span className="card-sub" style={{ marginTop: 6 }}><span>리뷰 <b className="num">{c.n}</b>건</span><span>평균 <b className="num">{f2(c.avg)}</b></span></span>
                <div className="rank-list">
                  {ranks.length === 0 && <span className="muted" style={{ fontSize: 13, paddingTop: 8 }}>불편 없음</span>}
                  {ranks.map((r, i) => (
                    <Link key={r.phenomenon} href={`/v2/discomfort?branch=${encodeURIComponent(b)}&month=${week.slice(0, 7)}&p=${encodeURIComponent(r.phenomenon)}`}>
                      <span className="tl-rank num">{i + 1}</span>
                      <span className="tl-name" style={{ minWidth: 0 }}>{r.phenomenon}</span>
                      <span className="tl-n num">{r.count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
