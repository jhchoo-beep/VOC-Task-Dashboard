'use client'
// STAY VOC 2.0 리뷰 원문 — B 관제 콘솔형. 1.0 「리뷰 데이터」와 「Raw Data」를 한 탭으로.
// 🔴 고른 리뷰의 상세는 가운데·오른쪽 한 군데씩만 그리고 key 를 리뷰 id 로 둔다(같은 컴포넌트를 복제했을 때 상태가 새던 버그 방지).
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import '@/app/v2/reviews/reviews.css'
import { ALL, BRANCHES, type Scope } from '@/lib/v2/metrics'
import type { ReviewsData } from '@/lib/v2/reviews'
import {
  SEVERITIES, discomfortHref, filterRaw, kstDay, filterReviews, hasTranslation, rawKpis, reviewKpis, reviewText, reviewsCsv, sortRaw, sortReviews,
  type Dir, type RawRow, type RawSort, type ReviewRow, type ReviewSort, type ScoreBand,
} from '@/lib/v2/reviewsView'
import { SearchIcon, f1, f2, mLabel, md } from '../parts'
import { RawDetail, RawSide, ReviewDetail, ReviewSide } from './Details'
import { RawAddModal, ReviewModal } from './Modals'

type Tab = 'reviews' | 'raw'
type Modal = null | { kind: 'review'; review: ReviewRow | null } | { kind: 'raw' }

interface Props {
  data: ReviewsData
  initialBranch: Scope
  initialTab: Tab
  initialReview: string | null
  readOnly: boolean
  embedKey: string | null
}

const STEP = 60   // 목록은 한 번에 이만큼만 그린다(달 하나 200~300건, 더 보기로 늘린다)
const REVIEW_SORTS: { v: ReviewSort; l: string }[] = [{ v: 'score', l: '점수' }, { v: 'severity', l: 'Severity' }, { v: 'branch', l: '지점' }, { v: 'channel', l: '채널' }]
const RAW_SORTS: { v: RawSort; l: string }[] = [{ v: 'collected', l: '수집일' }, { v: 'score', l: '점수' }]
const pct = (a: number, n: number) => (n ? Math.round(a / n * 100) : 0)

export default function ReviewsConsole({ data, initialBranch, initialTab, initialReview, readOnly, embedKey }: Props) {
  const router = useRouter()
  const pathname = usePathname() ?? '/v2/reviews'
  const prefix = pathname.startsWith('/embed') ? '/embed' : ''
  // 임베드 주소는 미리 받기(prefetch)에서 ?key= 가 빠져 403 이 나므로 임베드에서는 미리 받지 않는다
  const noPrefetch = embedKey ? false : undefined
  const withKey = (href: string) => (embedKey ? `${href}${href.includes('?') ? '&' : '?'}key=${encodeURIComponent(embedKey)}` : href)

  const [tab, setTab] = useState<Tab>(initialTab)
  const [branch, setBranch] = useState<Scope>(initialBranch)
  const [q, setQ] = useState('')
  const [revChannel, setRevChannel] = useState('')
  const [rawChannel, setRawChannel] = useState('')
  const [severity, setSeverity] = useState('')
  const [score, setScore] = useState<ScoreBand>('all')
  const [revSort, setRevSort] = useState<{ by: ReviewSort; dir: Dir }>({ by: 'score', dir: 'asc' })
  const [rawSort, setRawSort] = useState<{ by: RawSort; dir: Dir }>({ by: 'collected', dir: 'desc' })
  const [sel, setSel] = useState<{ reviews: string | null; raw: string | null }>({ reviews: initialReview, raw: null })
  const [modal, setModal] = useState<Modal>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 주소 맞추기: 지점·탭·고른 리뷰는 다시 읽지 않고 주소만 바꾸고(replaceState), 달은 서버에서 다시 읽는다(push)
  const setParams = (mut: (qs: URLSearchParams) => void, push = false) => {
    const qs = new URLSearchParams(window.location.search)
    mut(qs)
    const url = `${pathname}?${qs.toString()}`
    if (push) startTransition(() => router.push(url))
    else window.history.replaceState(null, '', url)
  }
  const pickBranch = (b: Scope) => { setBranch(b); setParams(qs => (b === ALL ? qs.delete('branch') : qs.set('branch', b))) }
  const pickTab = (t: Tab) => { setTab(t); setParams(qs => (t === 'raw' ? qs.set('tab', 'raw') : qs.delete('tab'))) }
  const pickMonth = (m: string) => setParams(qs => { qs.set('month', m); qs.delete('review') }, true)
  const pickReview = (id: string) => { setSel(s => ({ ...s, reviews: id })); setParams(qs => qs.set('review', id)) }
  const pickRaw = (id: string) => setSel(s => ({ ...s, raw: id }))

  const phenomena = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [id, ss] of Object.entries(data.stars)) m.set(id, ss.map(s => s.phenomenon))
    return m
  }, [data.stars])
  const analyzedIds = useMemo(() => new Set(Object.keys(data.analysis)), [data.analysis])

  const revChannels = useMemo(() => [...new Set(data.reviews.map(r => r.ota_site).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ko')), [data.reviews])
  const rawChannels = useMemo(() => [...new Set(data.raws.map(r => r.ota_site).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'ko')), [data.raws])

  const listRev = useMemo(() => sortReviews(filterReviews(data.reviews, { branch, channel: revChannel, severity, score, q }, phenomena), revSort.by, revSort.dir),
    [data.reviews, branch, revChannel, severity, score, q, phenomena, revSort])
  const listRaw = useMemo(() => sortRaw(filterRaw(data.raws, { branch, channel: rawChannel, q }), rawSort.by, rawSort.dir),
    [data.raws, branch, rawChannel, q, rawSort])
  const branchRevN = useMemo(() => data.reviews.filter(r => branch === ALL || r.branch === branch).length, [data.reviews, branch])
  const branchRawN = useMemo(() => data.raws.filter(r => branch === ALL || r.branch === branch).length, [data.raws, branch])

  // 그리는 줄 수: 거르는 조건이 바뀌면 처음 STEP 줄로 돌아간다
  const sig = [tab, branch, q, revChannel, rawChannel, severity, score, revSort.by, revSort.dir, rawSort.by, rawSort.dir].join('|')
  // 주소로 고른 리뷰(?review=)가 첫 STEP 줄 밖이면 그 줄까지 그린다
  const [shown, setShown] = useState(() => ({ sig, n: Math.max(STEP, listRev.findIndex(r => r.id === initialReview) + 1) }))
  const limit = shown.sig === sig ? shown.n : STEP

  const curRev: ReviewRow | null = tab === 'reviews' ? listRev.find(r => r.id === sel.reviews) ?? listRev[0] ?? null : null
  const curRaw: RawRow | null = tab === 'raw' ? listRaw.find(r => r.id === sel.raw) ?? listRaw[0] ?? null : null

  useEffect(() => {
    if (initialReview) document.querySelector('.rvw .v2-pane.list .li.on')?.scrollIntoView({ block: 'center' })
  }, [initialReview])

  const kRev = useMemo(() => reviewKpis(listRev, analyzedIds), [listRev, analyzedIds])
  const kRaw = useMemo(() => rawKpis(listRaw), [listRaw])
  const scopeName = branch === ALL ? '전 지점' : branch
  const newBranch = branch === ALL ? '동대문' : branch   // 추가 창의 처음 지점: 고른 지점, 전 지점이면 1.0 기본값
  const ym = (m: string) => `${m.slice(0, 4)}년 ${mLabel(m)}`

  const downloadCsv = () => {
    const blob = new Blob(['\uFEFF' + reviewsCsv(listRev)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reviews_${data.month}${branch !== ALL ? '_' + branch : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const remove = async (kind: Tab, id: string) => {
    if (!confirm(kind === 'reviews' ? '이 리뷰를 삭제할까요?' : '이 Raw 리뷰를 삭제할까요?')) return
    setBusy(id)
    const res = await fetch(kind === 'reviews' ? '/api/reviews/delete' : '/api/rawdata/delete', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    }).catch(() => null)
    setBusy(null)
    if (!res?.ok) { alert('삭제하지 못했습니다.'); return }
    router.refresh()
  }

  const discHref = (b: string, m: string, p?: string) => withKey(discomfortHref(prefix, b, m, p))
  const taskHref = prefix ? null : (t: { id: string; task_month: string | null }) => `/v2/tasks?${t.task_month ? `month=${t.task_month}&` : ''}task=${t.id}`

  const list = tab === 'reviews' ? listRev : listRaw
  const rest = Math.max(0, list.length - limit)

  return (
    <main className="v2-console rvw" aria-busy={pending || undefined}>
      <div className="v2-bar">
        <div className="v2-crumb"><Link href={withKey(`${prefix}/v2`)} prefetch={noPrefetch}>홈</Link><span>/</span><b>리뷰 원문</b></div>
        <div className="segs" role="group" aria-label="지점" style={{ marginLeft: 'auto' }}>
          {[ALL, ...BRANCHES].map(b => (
            <button type="button" key={b} className={`seg${branch === b ? ' on' : ''}`} aria-pressed={branch === b} onClick={() => pickBranch(b as Scope)}>
              {b === ALL ? '전 지점' : b}
            </button>
          ))}
        </div>
        <select className="select" aria-label="리뷰 달" value={data.month} onChange={e => pickMonth(e.target.value)} disabled={!data.months.length}>
          {data.months.length === 0 && <option value="">데이터 없음</option>}
          {data.months.map(m => <option key={m} value={m}>{ym(m)}</option>)}
        </select>
        <label className="search">
          <SearchIcon />
          <span className="rvw-sr">리뷰 검색</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="원문 · 번역 · 불편 검색" />
        </label>
      </div>

      {tab === 'reviews' ? (
        <div className="v2-kpis">
          <div className="v2-kpi">
            <span className="k">{scopeName}{data.month ? ` · ${mLabel(data.month)}` : ''} 리뷰</span>
            <span className="v num">{kRev.n}<small>건</small></span>
            <span className="s">2.0 분석 <span className="num">{kRev.analyzed}</span>건</span>
          </div>
          <div className="v2-kpi">
            <span className="k">평균 점수</span>
            <span className="v num">{f2(kRev.avg)}</span>
            <span className="s">점수 있는 리뷰 <span className="num">{kRev.scored}</span>건</span>
          </div>
          <div className="v2-kpi">
            <span className="k">9점 미만 리뷰</span>
            <span className={`v num${kRev.low ? ' tone-over' : ''}`}>{kRev.low}<small>건</small></span>
            <span className="s">전체의 <span className="num">{pct(kRev.low, kRev.n)}%</span></span>
          </div>
          <div className="v2-kpi">
            <span className="k">번역 없는 리뷰</span>
            <span className="v num">{kRev.noKo}<small>건</small></span>
            <span className="s">원어 리뷰 <span className="num">{kRev.foreign}</span>건</span>
          </div>
        </div>
      ) : (
        <div className="v2-kpis">
          <div className="v2-kpi">
            <span className="k">{scopeName}{data.month ? ` · ${mLabel(data.month)}` : ''} Raw</span>
            <span className="v num">{kRaw.n}<small>건</small></span>
            <span className="s">리뷰 탭 <span className="num">{branchRevN}</span>건</span>
          </div>
          <div className="v2-kpi">
            <span className="k">평균 평점 · 원본 척도</span>
            <span className="v num">{f2(kRaw.avg)}</span>
            <span className="s">점수 있는 리뷰 <span className="num">{kRaw.scored}</span>건</span>
          </div>
          <div className="v2-kpi">
            <span className="k">답변 완료</span>
            <span className="v num">{kRaw.answered}<small>건</small></span>
            <span className="s">전체의 <span className="num">{pct(kRaw.answered, kRaw.n)}%</span></span>
          </div>
          <div className="v2-kpi">
            <span className="k">마지막 수집</span>
            <span className="v num">{kRaw.lastDay ? md(kRaw.lastDay) : '–'}</span>
            <span className="s">그날 <span className="num">{kRaw.lastDayN}</span>건</span>
          </div>
        </div>
      )}

      {data.error && <div className="empty">{data.error}</div>}

      <div className="v2-panes">
        <section className="v2-pane list" aria-label="목록">
          <div className="tabbs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'reviews'} className={`tabb${tab === 'reviews' ? ' on' : ''}`} onClick={() => pickTab('reviews')}>리뷰 <span className="num">{branchRevN}</span></button>
            <button type="button" role="tab" aria-selected={tab === 'raw'} className={`tabb${tab === 'raw' ? ' on' : ''}`} onClick={() => pickTab('raw')}>Raw <span className="num">{branchRawN}</span></button>
          </div>

          <div className="rvw-tools">
            {tab === 'reviews' ? (
              <>
                <select className="rvw-sel" aria-label="채널" value={revChannel} onChange={e => setRevChannel(e.target.value)}>
                  <option value="">전체 채널</option>
                  {revChannels.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="rvw-sel" aria-label="점수" value={score} onChange={e => setScore(e.target.value as ScoreBand)}>
                  <option value="all">전체 점수</option>
                  <option value="lt9">9점 미만</option>
                  <option value="ge9">9점 이상</option>
                </select>
                <select className="rvw-sel" aria-label="Severity" value={severity} onChange={e => setSeverity(e.target.value)}>
                  <option value="">전체 Severity</option>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="rvw-sel" aria-label="정렬" value={revSort.by} onChange={e => setRevSort(s => ({ ...s, by: e.target.value as ReviewSort }))}>
                  {REVIEW_SORTS.map(s => <option key={s.v} value={s.v}>{s.l} 순</option>)}
                </select>
                <button type="button" className="rvw-btn" onClick={() => setRevSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}>{revSort.dir === 'asc' ? '오름차순' : '내림차순'}</button>
              </>
            ) : (
              <>
                <select className="rvw-sel" aria-label="채널" value={rawChannel} onChange={e => setRawChannel(e.target.value)}>
                  <option value="">전체 채널</option>
                  {rawChannels.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="rvw-sel" aria-label="정렬" value={rawSort.by} onChange={e => setRawSort(s => ({ ...s, by: e.target.value as RawSort }))}>
                  {RAW_SORTS.map(s => <option key={s.v} value={s.v}>{s.l} 순</option>)}
                </select>
                <button type="button" className="rvw-btn" onClick={() => setRawSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))}>{rawSort.dir === 'asc' ? '오름차순' : '내림차순'}</button>
              </>
            )}
            <span className="rvw-tools-r">
              {tab === 'reviews' && <button type="button" className="rvw-btn" onClick={downloadCsv} disabled={!listRev.length}>CSV</button>}
              {!readOnly && (
                <button type="button" className="rvw-btn pri" onClick={() => setModal(tab === 'reviews' ? { kind: 'review', review: null } : { kind: 'raw' })}>
                  {tab === 'reviews' ? '리뷰 추가' : 'Raw 추가'}
                </button>
              )}
            </span>
          </div>

          <div className="scroll">
            {tab === 'reviews' && (listRev.length ? listRev.slice(0, limit).map(r => {
              const a = data.analysis[r.id]
              const tasks = data.tasks[r.id] ?? []
              const ko = hasTranslation(r)
              return (
                <button type="button" key={r.id} className={`li${curRev?.id === r.id ? ' on' : ''}`} onClick={() => pickReview(r.id)} aria-current={curRev?.id === r.id ? 'true' : undefined}>
                  <span className="li-meta">
                    <span className={`score num${r.rating != null && r.rating < 9 ? ' low' : ''}`}>{f1(r.rating)}</span>
                    <span className="rvw-ell">{r.ota_site} · {r.branch}{r.severity ? ` · ${r.severity}` : ''}</span>
                    <span className="r">
                      {!a ? <span className="dim">분석 전</span>
                        : a.neg > 0 ? <span className="tone-over">불편 <span className="num">{a.neg}</span></span>
                          : <span>칭찬 <span className="num">{a.pos}</span></span>}
                    </span>
                  </span>
                  <span className="li-t sm rvw-clamp">{reviewText(r).text || '글 없음'}</span>
                  {(tasks.length > 0 || !ko) && (
                    <span className="rvw-tags">
                      {tasks.length > 0 && <span className="pill know">수행과제 <span className="num">{tasks.length}</span></span>}
                      {!ko && <span className="pill">번역 없음</span>}
                    </span>
                  )}
                </button>
              )
            }) : <div className="empty">{q ? '검색 결과 없음' : '리뷰 없음'}</div>)}

            {tab === 'raw' && (listRaw.length ? listRaw.slice(0, limit).map(r => (
              <button type="button" key={r.id} className={`li${curRaw?.id === r.id ? ' on' : ''}`} onClick={() => pickRaw(r.id)} aria-current={curRaw?.id === r.id ? 'true' : undefined}>
                <span className="li-meta">
                  <span className="score num">{r.rating ?? '–'}</span>
                  <span className="rvw-ell">{r.ota_site} · {r.branch}{r.raw_date ? ` · ${r.raw_date}` : ''}{r.reviewer ? ` · ${r.reviewer}${r.country ? ` (${r.country})` : ''}` : ''}</span>
                  <span className="r">수집 <span className="num">{r.created_at ? md(kstDay(r.created_at)) : '–'}</span></span>
                </span>
                <span className="li-t sm rvw-clamp">{(r.content ?? '').trim() || '글 없음'}</span>
              </button>
            )) : <div className="empty">{q ? '검색 결과 없음' : 'Raw 리뷰 없음'}</div>)}

            {rest > 0 && (
              <button type="button" className="rvw-more" onClick={() => setShown({ sig, n: limit + STEP })}>
                더 보기 · 남은 <span className="num">{rest}</span>건
              </button>
            )}
          </div>
        </section>

        <section className="v2-pane main" aria-label="자세히">
          {curRev && (
            <ReviewDetail
              key={curRev.id} r={curRev} tasks={data.tasks[curRev.id] ?? []} taskHref={taskHref} readOnly={readOnly}
              busy={busy === curRev.id}
              onEdit={() => setModal({ kind: 'review', review: curRev })}
              onDelete={() => remove('reviews', curRev.id)}
            />
          )}
          {curRaw && (
            <RawDetail key={curRaw.id} r={curRaw} readOnly={readOnly} busy={busy === curRaw.id} onDelete={() => remove('raw', curRaw.id)} />
          )}
          {!curRev && !curRaw && <div className="empty">왼쪽 목록에서 고르면 여기에 원문이 보입니다.</div>}
        </section>

        <aside className="v2-pane side" aria-label="2.0 분석">
          {curRev && (
            <ReviewSide
              key={curRev.id} r={curRev} a={data.analysis[curRev.id] ?? null} stars={data.stars[curRev.id] ?? []}
              href={(b, m, p) => discHref(b, m, p)} prefetch={noPrefetch}
            />
          )}
          {curRaw && <RawSide key={curRaw.id} r={curRaw} />}
        </aside>
      </div>

      {modal?.kind === 'review' && (
        <ReviewModal
          key={modal.review?.id ?? 'new'} review={modal.review} currentMonth={data.month} defaultBranch={newBranch}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }}
        />
      )}
      {modal?.kind === 'raw' && (
        <RawAddModal currentMonth={data.month} months={data.rawMonths} defaultBranch={newBranch} onClose={() => setModal(null)} onSaved={() => { setModal(null); router.refresh() }} />
      )}
    </main>
  )
}
