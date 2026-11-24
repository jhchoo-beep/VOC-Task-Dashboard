// STAY VOC 2.0 홈 — A 보고서형. 지점 4장(불편 지수) + 결과(신규 리뷰 평균) + 보조(저점 칭찬 지수) + 상위 불편 + 수행과제.
// 🔴 분석 결과가 DB에 직접 쓰여 revalidate 가 호출되지 않으므로 캐시하지 않는다.
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getTaskBriefs, getV2Base } from '@/lib/v2/data'
import {
  ALL, BRANCHES, TARGET_SCORE, cellOf, inScope, monthlySeries, monthsOf, periodLabel, periodMonths, rankComplaints, scoreTone,
} from '@/lib/v2/metrics'
import { Bars, Flag, f1, f2, mLabel, toneClass } from '@/components/v2/parts'

export default async function V2Home({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams
  const [base, tasks] = await Promise.all([getV2Base(), getTaskBriefs()])
  const months = monthsOf(base.revs)
  const month = typeof sp.month === 'string' && months.includes(sp.month) ? sp.month : months[months.length - 1]

  if (!month) {
    return <main className="v2-home"><div className="empty">{base.error ?? '아직 분석한 리뷰가 없습니다.'}</div></main>
  }

  const shown = months.slice(0, months.indexOf(month) + 1).slice(-6)
  const allCell = cellOf(inScope(base.revs, ALL, [month]))
  const allSeries = monthlySeries(base.revs, ALL, shown)
  const top = rankComplaints(inScope(base.revs, ALL, [month]), inScope(base.stars, ALL, [month])).slice(0, 5)
  const tcount = (s: string) => tasks.filter(t => t.status === s).length

  return (
    <main className="v2-home">
      <div className="v2-home-head">
        <div>
          <div className="v2-eyebrow">{mLabel(month)} · 전 지점 · 분석한 리뷰 <span className="num">{allCell.n}</span>건</div>
          <h1 className="v2-h1">불편 지수</h1>
        </div>
        <nav className="segs" aria-label="기준 달">
          {months.slice(-6).map(m => (
            <Link key={m} href={`/v2?month=${m}`} className={`seg${m === month ? ' on' : ''}`} aria-current={m === month ? 'true' : undefined}>{mLabel(m)}</Link>
          ))}
        </nav>
      </div>

      <div className="v2-grid4">
        {BRANCHES.map(b => {
          const c = cellOf(inScope(base.revs, b, periodMonths(b, month)))
          const series = monthlySeries(base.revs, b, shown)
          return (
            <Link key={b} href={`/v2/discomfort?branch=${encodeURIComponent(b)}&month=${month}`} className="card">
              <span className="card-k"><span>{b}</span><Flag idx={c.idx} /></span>
              <span className="card-kpi">{periodLabel(b, month)} 불편 지수</span>
              <span className="card-val"><b className={`num ${toneClass(c.idx == null ? 'none' : c.idx < 50 ? 'ok' : 'over')}`}>{f1(c.idx)}</b><span>목표 50 미만</span></span>
              <Bars values={series.map(s => s.idx)} labels={series.map(s => String(+s.month.slice(5, 7)))} />
              <span className="card-sub">
                <span>신규 리뷰 평균 <b className="num">{f2(c.avg)}</b></span>
                <span>리뷰 <b className="num">{c.n}</b>건</span>
              </span>
            </Link>
          )
        })}

        <Link href={`/v2/report?month=${month}`} className="card">
          <span className="card-k"><span>전 지점 · 결과</span>
            {allCell.avg != null && <span className={`flag ${scoreTone(allCell.avg) === 'ok' ? 'ok' : 'over'}`}>{allCell.avg >= TARGET_SCORE ? '9.0 이상' : '9.0 미만'}</span>}
          </span>
          <span className="card-kpi">{mLabel(month)} 신규 리뷰 평균</span>
          <span className="card-val"><b className="num">{f2(allCell.avg)}</b><span>목표 9.0</span></span>
          <Bars values={allSeries.map(s => (s.avg == null ? null : Math.max(0, s.avg - 8)))} labels={allSeries.map(s => String(+s.month.slice(5, 7)))} overAt={99} max={2} />
          <span className="card-sub"><span>불편 지수 <b className="num">{f1(allCell.idx)}</b></span></span>
        </Link>

        <Link href={`/v2/discomfort?tab=low&month=${month}`} className="card">
          <span className="card-k"><span>전 지점 · 보조 지표</span></span>
          <span className="card-kpi">{mLabel(month)} 저점 칭찬 지수</span>
          <span className="card-val"><b className="num">{f1(allCell.lowIdx)}</b><span>낮을수록 좋음</span></span>
          <Bars values={allSeries.map(s => s.lowIdx)} labels={allSeries.map(s => String(+s.month.slice(5, 7)))} overAt={999} />
          <span className="card-sub"><span>9점 미만인데 칭찬만 <b className="num">{allCell.low}</b>건</span></span>
        </Link>

        <div className="card">
          <span className="card-k"><span>{mLabel(month)} 불편 지수를 가장 올린 불편</span></span>
          <div className="top-list">
            {top.length === 0 && <span className="muted" style={{ fontSize: 13, paddingTop: 10 }}>불편 없음</span>}
            {top.map((t, i) => (
              <Link key={t.phenomenon} href={`/v2/discomfort?month=${month}&p=${encodeURIComponent(t.phenomenon)}`}>
                <span className="tl-rank num">{i + 1}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="tl-name" style={{ display: 'block' }}>{t.phenomenon}</span>
                  <span className="tl-meta" style={{ display: 'block' }}>{t.branches.join(', ')} · {t.galaxy}</span>
                </span>
                <span className="tl-n num">{t.count}</span>
              </Link>
            ))}
          </div>
        </div>

        <Link href="/v2/tasks" className="tile">
          <span className="tile-k">수행과제</span>
          <span className="tile-rows">
            <span className="tile-row"><span>진행중</span><b className="num">{tcount('진행중')}</b></span>
            <span className="tile-row"><span>시작전</span><b className="num">{tcount('시작전')}</b></span>
            <span className="tile-row"><span>보류</span><b className="num">{tcount('보류')}</b></span>
            <span className="tile-row"><span>완료</span><b className="num">{tcount('완료')}</b></span>
          </span>
          <span className="tile-foot">3개월 재발 0건이면 완료</span>
        </Link>
      </div>
    </main>
  )
}
