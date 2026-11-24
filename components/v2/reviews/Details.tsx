'use client'
// 리뷰 원문 탭의 가운데(원문)와 오른쪽(2.0 분석, 수집 정보). 콘솔이 고른 것 하나만 key=id 로 그린다.
import Link from 'next/link'
import { useState } from 'react'
import { scoreTone } from '@/lib/v2/metrics'
import { hasTranslation, kstDay, reviewText, type Analysis, type LinkedTask, type NegStar, type RawRow, type ReviewRow } from '@/lib/v2/reviewsView'
import { f1, mLabel, toneClass } from '../parts'

const ym = (m: string) => (m ? `${m.slice(0, 4)}년 ${mLabel(m)}` : '')
const day = (iso: string | null) => { const d = kstDay(iso); return d ? `${d.slice(0, 4)}년 ${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일` : '–' }

function Acts({ readOnly, busy, onEdit, onDelete }: { readOnly: boolean; busy: boolean; onEdit?: () => void; onDelete: () => void }) {
  if (readOnly) return null
  return (
    <div className="rvw-acts">
      {onEdit && <button type="button" className="act" onClick={onEdit}>수정</button>}
      <button type="button" className="act rvw-danger" onClick={onDelete} disabled={busy}>{busy ? '삭제 중' : '삭제'}</button>
    </div>
  )
}

export function ReviewDetail({ r, tasks, taskHref, readOnly, busy, onEdit, onDelete }: {
  r: ReviewRow
  tasks: LinkedTask[]
  taskHref: ((t: LinkedTask) => string) | null
  readOnly: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [orig, setOrig] = useState(false)
  const { text, original } = reviewText(r)
  const label = original ? (orig ? '원어' : '한국어 번역') : hasTranslation(r) ? '원문' : '원문 · 번역 없음'
  const cats = r.categories ?? [], trig = r.churn_triggers ?? []
  return (
    <>
      <div className="detail-meta">
        <span>{r.ota_site} · {r.branch} · {ym(r.review_month)}</span>
        <span className="r rvw-pills">
          {r.severity && <span className="pill">{r.severity}</span>}
          {r.customer_segment && <span className="pill">{r.customer_segment}</span>}
          {r.status && <span className="pill">{r.status}</span>}
        </span>
      </div>
      <div className="rvw-head">
        <h2 className="h2"><span className={`num ${toneClass(scoreTone(r.rating))}`}>{f1(r.rating)}</span>점 리뷰</h2>
        <Acts readOnly={readOnly} busy={busy} onEdit={onEdit} onDelete={onDelete} />
      </div>
      {(cats.length > 0 || trig.length > 0) && (
        <div className="rvw-chips">
          {cats.map(c => <span key={`c-${c}`} className="pill">{c}</span>)}
          {trig.map(t => <span key={`t-${t}`} className="pill warn">{t}</span>)}
        </div>
      )}
      <div className="boxed">
        <div className="rv">
          <div className="rv-meta">
            <span>{label}</span>
            {original && <button type="button" className="lnk rvw-toggle" onClick={() => setOrig(o => !o)}>{orig ? '번역 보기' : '원어 보기'}</button>}
          </div>
          <div className="rv-text rvw-body">{(orig ? original : text) || '글 없음'}</div>
        </div>
      </div>
      {tasks.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="sec-k">연결된 수행과제 <span className="num">{tasks.length}</span></div>
          <div className="boxed">
            {tasks.map(t => {
              const body = (
                <>
                  <span className="rv-meta"><span>{t.task_month ? ym(t.task_month) : ''}{t.status ? ` · ${t.status}` : ''}</span></span>
                  <span className={`rv-quote${taskHref ? ' lnk' : ''}`}>{t.title}</span>
                </>
              )
              return taskHref
                ? <Link key={t.id} href={taskHref(t)} className="rv rvw-link">{body}</Link>
                : <div key={t.id} className="rv">{body}</div>
            })}
          </div>
        </div>
      )}
    </>
  )
}

export function ReviewSide({ r, a, stars, href, prefetch }: {
  r: ReviewRow
  a: Analysis | null
  stars: NegStar[]
  href: (branch: string, month: string, phenomenon?: string) => string
  prefetch?: false
}) {
  // 불편 지수 화면은 분석한 날짜의 달로 센다 → 분석이 있으면 그 달, 없으면 리뷰 월
  const branch = a?.branch ?? r.branch
  const month = a?.date ? a.date.slice(0, 7) : r.review_month
  return (
    <>
      <div>
        <div className="sec-k">2.0 분석</div>
        {a ? (
          <div className="rvw-stat2">
            <div className="stat"><div className="k">불편</div><div className={`v num${a.neg > 0 ? ' tone-over' : ''}`}>{a.neg}</div><div className="s">건</div></div>
            <div className="stat"><div className="k">칭찬</div><div className="v num">{a.pos}</div><div className="s">건</div></div>
          </div>
        ) : (
          <div className="rvw-na">2.0 분석 전</div>
        )}
      </div>
      {a && (
        <div>
          <div className="sec-k">불편 현상 <span className="num">{stars.length}</span></div>
          {stars.length === 0
            ? <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>불편 없음</div>
            : (
              <div className="boxed">
                {stars.map(s => (
                  <Link key={s.id} href={href(s.branch || branch, s.date ? s.date.slice(0, 7) : month, s.phenomenon)} prefetch={prefetch} className="rv rvw-link">
                    <span className="rv-meta"><span>{s.galaxy} · {s.owner || '주체 미정'}</span></span>
                    <span className="rv-quote lnk">{s.phenomenon}</span>
                    {s.quote && <span className="rv-text">{s.quote}</span>}
                  </Link>
                ))}
              </div>
            )}
        </div>
      )}
      <div>
        <div className="sec-k">원문 데이터</div>
        <Link className="lnk" href={href(branch, month)} prefetch={prefetch}>{branch} {mLabel(month)} 불편 지수 ↗</Link>
      </div>
    </>
  )
}

export function RawDetail({ r, readOnly, busy, onDelete }: { r: RawRow; readOnly: boolean; busy: boolean; onDelete: () => void }) {
  return (
    <>
      <div className="detail-meta">
        <span>{r.ota_site} · {r.branch} · {ym(r.review_month)}</span>
        <span className="r rvw-pills">{r.has_response && <span className="pill ok">답변 완료</span>}</span>
      </div>
      <div className="rvw-head">
        <h2 className="h2">{r.rating != null ? <><span className="num">{r.rating}</span>점 Raw 리뷰</> : 'Raw 리뷰'}</h2>
        <Acts readOnly={readOnly} busy={busy} onDelete={onDelete} />
      </div>
      <div className="boxed">
        <div className="rv">
          <div className="rv-meta"><span>수집 원본</span></div>
          <div className="rv-text rvw-body">{(r.content ?? '').trim() || '글 없음'}</div>
        </div>
      </div>
    </>
  )
}

export function RawSide({ r }: { r: RawRow }) {
  const rows: [string, string][] = [
    ['리뷰어', r.reviewer ?? '–'],
    ['국가', r.country ?? '–'],
    ['여행 유형', r.travel_type ?? '–'],
    ['객실', r.room_type ?? '–'],
    ['원본 날짜', r.raw_date ?? '–'],
    ['답변', r.has_response ? '완료' : '없음'],
    ['수집일', day(r.created_at)],
  ]
  return (
    <div>
      <div className="sec-k">수집 정보</div>
      <dl className="rvw-dl">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </div>
  )
}
