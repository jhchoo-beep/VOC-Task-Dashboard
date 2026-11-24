// STAY VOC 2.0 분석 — A 보고서형. 2.0 지표(불편 지수)의 달별 흐름과 불편의 구성(카테고리, 고칠 수 있는 주체).
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getV2Base } from '@/lib/v2/data'
import { ALL, BRANCHES, TARGET_INDEX, cellOf, inScope, monthlySeries, monthsOf, scoreTone, type Scope } from '@/lib/v2/metrics'
import { galaxyByMonth, ownerShare } from '@/lib/v2/trends'
import { f1, f2, mLabel, toneClass } from '@/components/v2/parts'

type SP = Promise<{ [k: string]: string | string[] | undefined }>

/** 달별 불편 지수 막대 + 목표선. 막대 위 숫자, 리뷰 10건 미만은 흐리게 */
function IndexChart({ series }: { series: { month: string; idx: number | null; n: number }[] }) {
  const W = 320, H = 150, padT = 20, padB = 22, padX = 4
  const top = Math.max(TARGET_INDEX * 1.6, ...series.map(s => s.idx ?? 0)) * 1.08
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top)
  const bw = (W - padX * 2) / series.length
  const last = series.length - 1
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map(s => `${mLabel(s.month)} ${s.idx ?? '리뷰 없음'}`).join(', ')}>
      {series.map((s, i) => {
        const x = padX + i * bw + bw * 0.18, w = bw * 0.64
        const over = s.idx != null && s.idx >= TARGET_INDEX
        const fill = s.idx == null ? 'var(--bar)' : i === last ? (over ? 'var(--warn)' : 'var(--ok)') : 'var(--bar)'
        return (
          <g key={s.month} opacity={s.n && s.n < 10 ? 0.5 : 1}>
            {s.idx != null && <rect x={x} y={y(s.idx)} width={w} height={Math.max(2, y(0) - y(s.idx))} rx={3} fill={fill} />}
            {s.idx != null && <text x={x + w / 2} y={y(s.idx) - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={over ? 'var(--warn)' : 'var(--mute)'}>{s.idx.toFixed(0)}</text>}
            <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--dim)">{+s.month.slice(5, 7)}월</text>
          </g>
        )
      })}
      <line x1={0} x2={W} y1={y(TARGET_INDEX)} y2={y(TARGET_INDEX)} stroke="var(--know)" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x={2} y={y(TARGET_INDEX) - 4} textAnchor="start" fontSize="10" fontWeight="700" fill="var(--know)" style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3 }}>목표 {TARGET_INDEX}</text>
    </svg>
  )
}

export default async function TrendsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const base = await getV2Base()
  const months = monthsOf(base.revs)
  const b = typeof sp.branch === 'string' ? sp.branch : undefined
  const scope: Scope = b && (BRANCHES as readonly string[]).includes(b) ? (b as Scope) : ALL
  if (!months.length) return <main className="v2-home"><div className="empty">{base.error ?? '아직 분석한 리뷰가 없습니다.'}</div></main>

  const gal = galaxyByMonth(base.stars, scope, months)
  const galMax = Math.max(1, ...gal.flatMap(g => g.byMonth))
  const owners = ownerShare(inScope(base.stars, scope, months))
  const ownerNames = ownerShare(base.stars).map(o => o.owner)

  return (
    <main className="v2-home">
      <div className="v2-home-head">
        <div>
          <div className="v2-eyebrow">{mLabel(months[0])}~{mLabel(months[months.length - 1])} · 분석한 리뷰 <span className="num">{base.revs.length}</span>건</div>
          <h1 className="v2-h1">분석</h1>
        </div>
        <nav className="segs" aria-label="지점">
          {[ALL, ...BRANCHES].map(x => (
            <Link key={x} href={x === ALL ? '/v2/trends' : `/v2/trends?branch=${encodeURIComponent(x)}`} className={`seg${scope === x ? ' on' : ''}`} aria-current={scope === x ? 'true' : undefined}>{x === ALL ? '전 지점' : x}</Link>
          ))}
        </nav>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>지점별 월 불편 지수</h2><span>리뷰 100건당 불편 건수 · 리뷰 10건 미만 달은 흐리게</span></div>
        <div className="sm-grid">
          {BRANCHES.map(x => {
            const s = monthlySeries(base.revs, x, months)
            return (
              <Link key={x} href={`/v2/discomfort?branch=${encodeURIComponent(x)}`} className="card">
                <span className="card-k"><span>{x}</span><span className="num muted">{f1(s[s.length - 1]?.idx)}</span></span>
                <div style={{ marginTop: 12 }}><IndexChart series={s} /></div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>신규 리뷰 평균과 저점 칭찬 지수</h2><span>결과 지표와 보조 지표</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>지점</th><th className="l">지표</th>{months.map(m => <th key={m}>{mLabel(m)}</th>)}</tr></thead>
            <tbody>
              {[...BRANCHES, ALL].flatMap(x => {
                const s = monthlySeries(base.revs, x as Scope, months)
                return [
                  <tr key={`${x}-a`} className={x === ALL ? 'total' : ''}>
                    <td rowSpan={2}>{x === ALL ? '전 지점' : x}</td>
                    <td className="l muted">신규 리뷰 평균</td>
                    {s.map(c => <td key={c.month}><span className={`num ${toneClass(scoreTone(c.avg))}`}>{f2(c.avg)}</span></td>)}
                  </tr>,
                  <tr key={`${x}-b`} className={x === ALL ? 'total' : ''}>
                    <td className="l muted">저점 칭찬 지수</td>
                    {s.map(c => <td key={c.month}><span className="num">{f1(c.lowIdx)}</span></td>)}
                  </tr>,
                ]
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>카테고리별 불편 건수</h2><span>{scope === ALL ? '전 지점' : scope} · 진할수록 많음</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>카테고리</th>{months.map(m => <th key={m}>{mLabel(m)}</th>)}<th>합계</th></tr></thead>
            <tbody>
              {gal.map(g => (
                <tr key={g.galaxy}>
                  <td>{g.galaxy}</td>
                  {g.byMonth.map((n, i) => (
                    <td key={i}>
                      <span className="heat num" style={{ background: n ? `color-mix(in srgb, var(--know) ${Math.round(12 + n / galMax * 58)}%, transparent)` : 'transparent', color: n / galMax > 0.55 ? 'var(--bg)' : n ? 'var(--ink)' : 'var(--dim)' }}>{n || '·'}</span>
                    </td>
                  ))}
                  <td><b className="num">{g.total}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>고칠 수 있는 주체</h2><span>{scope === ALL ? '전 지점' : scope} · 전체 기간 불편 건수</span></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>주체</th><th>건수</th><th>비중</th>{scope === ALL && BRANCHES.map(x => <th key={x}>{x}</th>)}</tr></thead>
            <tbody>
              {ownerNames.filter(o => owners.some(x => x.owner === o)).map(o => {
                const row = owners.find(x => x.owner === o)!
                return (
                  <tr key={o}>
                    <td>{o}</td>
                    <td><b className="num">{row.count}</b></td>
                    <td><span className="num">{row.share.toFixed(1)}%</span></td>
                    {scope === ALL && BRANCHES.map(x => {
                      const per = ownerShare(inScope(base.stars, x, months)).find(y => y.owner === o)
                      return <td key={x}><span className="num muted">{per ? `${per.share.toFixed(0)}%` : '·'}</span></td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
