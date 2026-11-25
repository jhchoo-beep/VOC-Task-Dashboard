'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import {
  ALL, BRANCHES, TARGET_INDEX, cellOf, indexWithout, isLowPraise, monthOf, periodLabel, rankComplaints, scoreTone, toneOf,
  type Rank, type Rev, type Scope, type Star,
} from '@/lib/v2/metrics'
import type { ReviewText } from '@/lib/v2/data'
import { SearchIcon, f1, f2, mLabel, md, toneClass } from './parts'
import { v2Href } from './EmbedLinks'

type Tab = 'rank' | 'reviews' | 'low'
type TrendStar = { phenomenon: string; date: string; branch: string }

interface Props {
  scope: Scope
  month: string
  months: string[]
  periodMonths: string[]
  shownMonths: string[]
  revs: Rev[]
  stars: Star[]
  trendStars: TrendStar[]
  texts: Record<string, ReviewText>
  initialTab: Tab
  initialSel: string | null
  error: string | null
}

const SNIP = 220

export default function DiscomfortConsole(p: Props) {
  // 노션 임베드는 보기 전용이라 등록 버튼을 두지 않는다(눌러도 등록 창이 열리지 않는 수행과제 임베드로만 간다)
  const embed = (usePathname() ?? '').startsWith('/embed/')
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(p.initialTab)
  const [q, setQ] = useState('')
  const cell = useMemo(() => cellOf(p.revs), [p.revs])
  const ranks = useMemo(() => rankComplaints(p.revs, p.stars), [p.revs, p.stars])
  const revById = useMemo(() => new Map(p.revs.map(r => [r.id, r])), [p.revs])
  const starsByReview = useMemo(() => {
    const m = new Map<string, Star[]>()
    for (const s of p.stars) m.set(s.reviewId, [...(m.get(s.reviewId) ?? []), s])
    return m
  }, [p.stars])
  const negRevs = useMemo(() => p.revs.filter(r => r.neg > 0)
    .sort((a, b) => b.neg - a.neg || (a.score ?? 99) - (b.score ?? 99) || b.date.localeCompare(a.date)), [p.revs])
  const lowRevs = useMemo(() => p.revs.filter(isLowPraise)
    .sort((a, b) => (a.score ?? 99) - (b.score ?? 99) || b.date.localeCompare(a.date)), [p.revs])

  // 고른 것: 불편 순위 탭은 현상 이름, 리뷰 탭들은 리뷰 id. 탭을 바꾸면 그 탭의 첫 항목.
  const firstOf = (t: Tab) => (t === 'rank' ? ranks[0]?.phenomenon : t === 'reviews' ? negRevs[0]?.id : lowRevs[0]?.id) ?? null
  const [sel, setSel] = useState<string | null>(() => {
    if (p.initialSel && ranks.some(r => r.phenomenon === p.initialSel)) return p.initialSel
    return firstOf(p.initialTab)
  })
  const pickTab = (t: Tab) => { setTab(t); setSel(firstOf(t)) }

  const ql = q.trim().toLowerCase()
  const textOf = (id: string) => p.texts[id]?.text ?? ''
  const match = (s: string) => !ql || s.toLowerCase().includes(ql)
  const listRanks = ranks.filter(r => match(`${r.phenomenon} ${r.galaxy} ${r.owner}`))
  const listNeg = negRevs.filter(r => match(`${textOf(r.id)} ${(starsByReview.get(r.id) ?? []).map(s => s.phenomenon).join(' ')} ${r.channel}`))
  const listLow = lowRevs.filter(r => match(`${textOf(r.id)} ${r.channel}`))

  const selRank = tab === 'rank' ? ranks.find(r => r.phenomenon === sel) ?? null : null
  const selRev = tab !== 'rank' && sel ? revById.get(sel) ?? null : null

  const href = (o: { branch?: Scope; month?: string }) => {
    const b = o.branch ?? p.scope, m = o.month ?? p.month
    const qs = new URLSearchParams()
    if (b !== ALL) qs.set('branch', b)
    qs.set('month', m)
    if (tab !== 'rank') qs.set('tab', tab)
    return `/v2/discomfort?${qs.toString()}`
  }
  const period = periodLabel(p.scope, p.month)
  const scopeName = p.scope === ALL ? '전 지점' : p.scope

  return (
    <main className="v2-console">
      <div className="v2-bar">
        <div className="v2-crumb"><Link href={`/v2?month=${p.month}`}>홈</Link><span>/</span><b>불편 지수</b></div>
        <div className="segs" role="group" aria-label="지점" style={{ marginLeft: 'auto' }}>
          {[ALL, ...BRANCHES].map(b => (
            <Link key={b} href={href({ branch: b as Scope })} className={`seg${p.scope === b ? ' on' : ''}`} aria-current={p.scope === b ? 'true' : undefined}>
              {b === ALL ? '전 지점' : b}
            </Link>
          ))}
        </div>
        <select className="select" aria-label="기준 달" value={p.month} onChange={e => router.push(v2Href(href({ month: e.target.value })))}>
          {[...p.months].reverse().map(m => <option key={m} value={m}>{m.slice(0, 4)}년 {mLabel(m)}</option>)}
        </select>
        <label className="search">
          <SearchIcon />
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>불편, 리뷰 검색</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="불편 · 리뷰 검색" />
        </label>
      </div>

      <div className="v2-kpis">
        <div className="v2-kpi">
          <span className="k">{scopeName} · {period} 불편 지수</span>
          <span className={`v num ${toneClass(toneOf(cell.idx))}`}>{f1(cell.idx)}</span>
          <span className="s">목표 <span className="num">{TARGET_INDEX}</span> 미만 · 불편 <span className="num">{cell.neg}</span>건</span>
        </div>
        <div className="v2-kpi">
          <span className="k">신규 리뷰 평균</span>
          <span className={`v num ${toneClass(scoreTone(cell.avg))}`}>{f2(cell.avg)}</span>
          <span className="s">목표 <span className="num">9.0</span></span>
        </div>
        <div className="v2-kpi">
          <span className="k">분석한 리뷰</span>
          <span className="v num">{cell.n}<small>건</small></span>
          <span className="s">불편 있는 리뷰 <span className="num">{cell.negReviews}</span>건</span>
        </div>
        <div className="v2-kpi">
          <span className="k">저점 칭찬 지수 · 보조</span>
          <span className="v num">{f1(cell.lowIdx)}</span>
          <span className="s">9점 미만인데 칭찬만 <span className="num">{cell.low}</span>건</span>
        </div>
      </div>

      {p.error && <div className="empty">{p.error}</div>}

      <div className="v2-panes">
        <section className="v2-pane list" aria-label="목록">
          <div className="tabbs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'rank'} className={`tabb${tab === 'rank' ? ' on' : ''}`} onClick={() => pickTab('rank')}>불편 순위 <span className="num">{ranks.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === 'reviews'} className={`tabb${tab === 'reviews' ? ' on' : ''}`} onClick={() => pickTab('reviews')}>불편 리뷰 <span className="num">{negRevs.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === 'low'} className={`tabb${tab === 'low' ? ' on' : ''}`} onClick={() => pickTab('low')}>저점 칭찬 <span className="num">{lowRevs.length}</span></button>
          </div>
          <div className="scroll">
            {tab === 'rank' && (listRanks.length ? listRanks.map(r => (
              <button type="button" key={r.phenomenon} className={`li${sel === r.phenomenon ? ' on' : ''}`} onClick={() => setSel(r.phenomenon)}>
                <span className="li-meta">
                  <span className="num">{ranks.indexOf(r) + 1}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.galaxy} · {r.owner || '주체 미정'}{p.scope === ALL ? ` · ${r.branches.join(', ')}` : ''}</span>
                  <span className="r tone-know num">+{f1(r.contrib)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="li-t" style={{ flex: 1, minWidth: 0 }}>{r.phenomenon}</span>
                  <b className="num" style={{ fontSize: 18 }}>{r.count}</b>
                </span>
              </button>
            )) : <div className="empty">{ql ? '검색 결과 없음' : '불편 없음'}</div>)}

            {tab !== 'rank' && ((tab === 'reviews' ? listNeg : listLow).length ? (tab === 'reviews' ? listNeg : listLow).map(r => {
              const ss = starsByReview.get(r.id) ?? []
              const t = ss[0]?.quote || textOf(r.id)
              return (
                <button type="button" key={r.id} className={`li${sel === r.id ? ' on' : ''}`} onClick={() => setSel(r.id)}>
                  <span className="li-meta">
                    <span className={`score num${r.score != null && r.score < 9 ? ' low' : ''}`}>{f1(r.score)}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.channel} · {r.branch} · {md(r.date)}</span>
                    {r.neg > 0 && <span className="r tone-over">불편 <span className="num">{r.neg}</span></span>}
                  </span>
                  <span className="li-t sm" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t || '글 없음'}</span>
                </button>
              )
            }) : <div className="empty">{ql ? '검색 결과 없음' : tab === 'low' ? '저점 칭찬 리뷰 없음' : '불편 리뷰 없음'}</div>)}
          </div>
        </section>

        <section className="v2-pane main" aria-label="자세히">
          {selRank && <RankDetail rank={selRank} {...p} cellIdx={cell.idx} revById={revById} />}
          {selRev && (
            <ReviewDetail
              key={selRev.id} rev={selRev} text={p.texts[selRev.id]} stars={starsByReview.get(selRev.id) ?? []}
              onPhenomenon={ph => { setTab('rank'); setSel(ph) }}
            />
          )}
          {!selRank && !selRev && <div className="empty">왼쪽 목록에서 고르면 여기에 리뷰 원문이 보입니다.</div>}
        </section>

        <aside className="v2-pane side" aria-label="기준과 연결">
          {selRank && (
            <>
              <div>
                <div className="sec-k">기준</div>
                <div className="std">
                  <div className="t">불편 지수 목표 <span className="num">{TARGET_INDEX}</span> 미만</div>
                  <div className="s">지금 <span className="num">{f1(cell.idx)}</span> · 이 불편이 없으면 <span className="num">{f1(indexWithout(cell, selRank.count))}</span></div>
                </div>
              </div>
              <div className="ai">
                <div className="k">LLM이 원문에서 찾은 것 · 등록 판단은 FO</div>
                <div className="t">{selRank.galaxy} · 고칠 수 있는 주체 {selRank.owner || '미정'}</div>
                <div className="s">{scopeName} {period} 리뷰 <span className="num">{selRank.reviews}</span>건에서 <span className="num">{selRank.count}</span>건</div>
              </div>
              {!embed && <div>
                <div className="sec-k">수행과제</div>
                <Link className="act pri" href={`/v2/tasks?new=1&branch=${encodeURIComponent(selRank.branches.length === 1 ? selRank.branches[0] : p.scope === ALL ? '' : p.scope)}&title=${encodeURIComponent(selRank.phenomenon)}&month=${p.month}`}>수행과제로 등록</Link>
              </div>}
            </>
          )}
          {selRev && (
            <div>
              <div className="sec-k">이 리뷰의 불편</div>
              {(starsByReview.get(selRev.id) ?? []).length === 0
                ? <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>불편 없음 · 칭찬 <span className="num">{selRev.pos}</span>건</div>
                : (starsByReview.get(selRev.id) ?? []).map(s => (
                  <button type="button" key={s.id} className="li" style={{ padding: '10px 0' }} onClick={() => { setTab('rank'); setSel(s.phenomenon) }}>
                    <span className="li-meta"><span>{s.galaxy} · {s.owner || '주체 미정'}</span></span>
                    <span className="li-t sm lnk" style={{ fontSize: 14 }}>{s.phenomenon}</span>
                  </button>
                ))}
            </div>
          )}
          <div>
            <div className="sec-k">원문 데이터</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link className="lnk" href={`/v2/reviews?${p.scope === ALL ? '' : `branch=${encodeURIComponent(p.scope)}&`}month=${p.month}`}>리뷰 원문 ↗</Link>
              <Link className="lnk" href={`/v2/ota${p.scope === ALL ? '' : `?branch=${encodeURIComponent(p.scope)}`}`}>OTA 점수 ↗</Link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function RankDetail({ rank, stars, revById, texts, trendStars, shownMonths, month, scope, cellIdx }: Props & { rank: Rank; revById: Map<string, Rev>; cellIdx: number | null }) {
  const series = shownMonths.map(m => ({ m, n: trendStars.filter(s => s.phenomenon === rank.phenomenon && monthOf(s.date) === m).length }))
  const top = Math.max(1, ...series.map(s => s.n))
  const rows = stars.filter(s => s.phenomenon === rank.phenomenon)
    .map(s => ({ s, r: revById.get(s.reviewId)! }))
    .filter(x => x.r)
    .sort((a, b) => b.r.date.localeCompare(a.r.date))
  return (
    <>
      <div className="detail-meta">
        <span>{rank.galaxy} · {rank.owner || '주체 미정'} · {rank.branches.join(', ')}</span>
        <span className={`r pill ${rank.contrib >= 10 ? 'warn' : 'know'}`}>불편 지수 +<span className="num">{f1(rank.contrib)}</span></span>
      </div>
      <h2 className="h2">{rank.phenomenon}</h2>
      <div className="stats">
        <div className="stat"><div className="k">불편 건수</div><div className="v num">{rank.count}</div><div className="s">리뷰 <span className="num">{rank.reviews}</span>건</div></div>
        <div className="stat"><div className="k">불편 지수 몫</div><div className="v num">+{f1(rank.contrib)}</div><div className="s">전체 <span className="num">{f1(cellIdx)}</span> 중</div></div>
        <div className="stat"><div className="k">그 리뷰 평균 점수</div><div className={`v num ${toneClass(scoreTone(rank.avg))}`}>{f2(rank.avg)}</div><div className="s">목표 <span className="num">9.0</span></div></div>
        <div className="stat"><div className="k">최근 6개월</div><div className="v num">{series.reduce((a, s) => a + s.n, 0)}</div><div className="s">건</div></div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="sec-k">달별 건수 · {scope === ALL ? '전 지점' : scope}</div>
        <div className="mbar" aria-hidden="true">
          {series.map(s => (
            <div key={s.m} className={`col${s.m === month ? ' on' : ''}`}>
              <b className="num">{s.n || ''}</b>
              <i style={{ height: `${Math.max(2, Math.round(s.n / top * 64))}px` }} />
            </div>
          ))}
        </div>
        <div className="mbar-x">{series.map(s => <span key={s.m}>{mLabel(s.m)}</span>)}</div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="sec-k">리뷰 원문 <span className="num">{rows.length}</span>건 · 최근 순</div>
        <div className="boxed">
          {rows.map(({ s, r }) => <ReviewRow key={s.id} r={r} quote={s.quote} text={texts[r.id]} />)}
        </div>
      </div>
    </>
  )
}

function ReviewRow({ r, quote, text }: { r: Rev; quote: string; text?: ReviewText }) {
  const [open, setOpen] = useState(false)
  const body = text?.text ?? ''
  const long = body.length > SNIP
  return (
    <div className="rv">
      <div className="rv-meta">
        <span className={`score num${r.score != null && r.score < 9 ? ' low' : ''}`}>{f1(r.score)}</span>
        <span>{r.channel} · {r.branch} · {md(r.date)}</span>
      </div>
      {quote && <div className="rv-quote">{quote}</div>}
      {body && <div className="rv-text">{open || !long ? body : `${body.slice(0, SNIP)}…`}</div>}
      {long && <button type="button" className="lnk" onClick={() => setOpen(o => !o)}>{open ? '접기' : '원문 더 보기'}</button>}
    </div>
  )
}

function ReviewDetail({ rev, text, stars, onPhenomenon }: { rev: Rev; text?: ReviewText; stars: Star[]; onPhenomenon: (p: string) => void }) {
  const [orig, setOrig] = useState(false)
  return (
    <>
      <div className="detail-meta">
        <span>{rev.channel} · {rev.branch} · {rev.date}</span>
        <span className={`r pill ${rev.neg > 0 ? 'warn' : 'ok'}`}>{rev.neg > 0 ? <>불편 <span className="num">{rev.neg}</span>건</> : <>칭찬 <span className="num">{rev.pos}</span>건</>}</span>
      </div>
      <h2 className="h2"><span className={`num ${toneClass(scoreTone(rev.score))}`}>{f1(rev.score)}</span>점 리뷰</h2>
      {stars.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {stars.map(s => <button type="button" key={s.id} className="pill warn" onClick={() => onPhenomenon(s.phenomenon)}>{s.phenomenon}</button>)}
        </div>
      )}
      <div className="boxed">
        {stars.map(s => s.quote && <div key={s.id} className="rv"><div className="rv-meta"><span>{s.phenomenon}</span></div><div className="rv-quote">{s.quote}</div></div>)}
        <div className="rv">
          <div className="rv-meta"><span>원문{text?.original ? (orig ? ' · 원어' : ' · 한국어 번역') : ''}</span></div>
          <div className="rv-text" style={{ color: 'var(--ink)' }}>{(orig ? text?.original : text?.text) || '글 없음'}</div>
          {text?.original && <button type="button" className="lnk" onClick={() => setOrig(o => !o)}>{orig ? '번역 보기' : '원어 보기'}</button>}
        </div>
      </div>
    </>
  )
}
