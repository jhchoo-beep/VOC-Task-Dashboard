'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Star, Plus, Loader2, Trash2, Pencil } from 'lucide-react'
import { formatMonth } from '@/lib/utils'

const SEV_BADGE: Record<string, string> = { Critical:'badge-critical', High:'badge-high', Medium:'badge-medium', Low:'badge-low' }
const SEG_BADGE: Record<string, string> = { '충성':'badge-done', '만족':'badge-progress', '위험':'badge-medium', '이탈':'badge-critical' }
const BRANCH_BADGE: Record<string, string> = { '제주시티':'badge-jeju','제주':'badge-jeju','동대문':'badge-ddm','신설':'badge-sinseol','고성':'badge-goseong' }
const BRANCHES  = ['전체','제주시티','동대문','신설','고성']
const SEVERITIES = ['전체','Critical','High','Medium','Low']
const CATS    = ['청결','소음','시설','직원서비스','체크인/체크아웃','위치/접근성','어메니티','가격','보안','기타']
const TRIGGERS = ['청결 Critical','복합이슈','서비스 실패','가격 불일치']
// Severity 정렬 가중치 - Critical이 가장 위
const SEV_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

function autoSegment(rating: number | string): string {
  const r = parseFloat(String(rating))
  if (isNaN(r)) return ''
  if (r >= 9) return '충성'
  if (r >= 7) return '만족'
  if (r >= 5) return '위험'
  return '이탈'
}

function autoSeverity(rating: number | string, triggers: string[]): string {
  const r = parseFloat(String(rating))
  if (isNaN(r)) return 'Medium'
  if (triggers.includes('청결 Critical')) return 'Critical'
  if (triggers.includes('복합이슈') && r < 6) return 'Critical'
  if (triggers.includes('복합이슈')) return 'High'
  if (r <= 3) return 'Critical'
  if (r <= 5) return 'High'
  if (r <= 7) return 'Medium'
  return 'Low'
}

function Field({ label, sub, children }: any) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: sub ? 3 : 6, fontWeight: 500 }}>{label}</label>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, opacity: 0.7 }}>{sub}</div>}
      {children}
    </div>
  )
}

// 정렬 화살표 컴포넌트
function SortArrow({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: 'asc'|'desc' }) {
  const active = sortCol === col
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', marginLeft: 3, verticalAlign: 'middle', opacity: active ? 1 : 0.3 }}>
      <span style={{ fontSize: 7, lineHeight: 1, color: active && sortDir === 'asc' ? 'var(--accent)' : 'var(--text-3)' }}>▲</span>
      <span style={{ fontSize: 7, lineHeight: 1, color: active && sortDir === 'desc' ? 'var(--accent)' : 'var(--text-3)' }}>▼</span>
    </span>
  )
}

export default function ReviewsClient({ reviews, months, currentMonth, reviewTaskMap = {}, highlightReviewId }: any) {
  const router = useRouter()
  const [branch, setBranch] = useState('전체')
  const [severity, setSeverity] = useState('전체')
  const [otaSite, setOtaSite] = useState('전체')
  const [expanded, setExpanded] = useState<string|null>(highlightReviewId ?? null)

  useEffect(() => {
    if (highlightReviewId) {
      setTimeout(() => {
        document.getElementById(`review-${highlightReviewId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 400)
    }
  }, [highlightReviewId])
  const [showAdd, setShowAdd] = useState(false)
  const [editReview, setEditReview] = useState<any>(null)
  // 정렬 상태 - 기본값: severity 오름차순 (Critical→High→Medium→Low)
  const [sortCol, setSortCol] = useState<string>('severity')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc')

  const otaSites = ['전체', ...Array.from(new Set(reviews.map((r: any) => r.ota_site).filter(Boolean))) as string[]]

  const handleDelete = async (id: string) => {
    if (!confirm('이 리뷰를 삭제할까요?')) return
    await fetch('/api/reviews/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    router.refresh()
  }

  // 정렬 토글
  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const filtered = reviews.filter((r: any) => {
    if (branch !== '전체' && r.branch !== branch) return false
    if (severity !== '전체' && r.severity !== severity) return false
    if (otaSite !== '전체' && r.ota_site !== otaSite) return false
    return true
  })

  // 정렬 적용
  const sorted = [...filtered].sort((a: any, b: any) => {
    let av: any, bv: any
    if (sortCol === 'severity') {
      av = SEV_ORDER[a.severity] ?? 99
      bv = SEV_ORDER[b.severity] ?? 99
    } else if (sortCol === 'rating') {
      av = a.rating ?? 0
      bv = b.rating ?? 0
    } else if (sortCol === 'branch') {
      av = a.branch ?? ''
      bv = b.branch ?? ''
    } else if (sortCol === 'ota') {
      av = a.ota_site ?? ''
      bv = b.ota_site ?? ''
    } else {
      return 0
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const avgRating   = filtered.length ? (filtered.reduce((s: number, r: any) => s + r.rating, 0) / filtered.length).toFixed(2) : '-'
  const criticalCnt = filtered.filter((r: any) => r.severity === 'Critical').length
  const highCnt     = filtered.filter((r: any) => r.severity === 'High').length

  // 정렬 가능한 헤더 셀
  const SortHeader = ({ col, label, style }: { col: string; label: string; style?: any }) => (
    <span
      onClick={() => handleSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', ...style }}
    >
      {label}
      <SortArrow col={col} sortCol={sortCol} sortDir={sortDir} />
    </span>
  )

  return (
    <div className="page-pad" style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>리뷰 데이터</h1>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>OTA 원본 리뷰 · Claude Code로 자동 수집</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> 리뷰 추가
        </button>
      </div>

      {/* 필터 — 데스크탑 */}
      <div className="filter-desktop" style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={currentMonth} onChange={e => router.push(`/reviews?month=${e.target.value}`)} className="input" style={{ width: 'auto', padding: '7px 12px' }}>
          {months.map((m: string) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        {BRANCHES.map(b => (
          <button key={b} className={`btn ${branch === b ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setBranch(b)}>{b}</button>
        ))}
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        {SEVERITIES.map(s => (
          <button key={s} className={`btn ${severity === s ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setSeverity(s)}>{s}</button>
        ))}
      </div>

      {/* OTA 필터 — 데스크탑 */}
      <div className="filter-desktop" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>OTA</span>
        {otaSites.map(ota => (
          <button key={ota} className={`btn ${otaSite === ota ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setOtaSite(ota)}>{ota}</button>
        ))}
      </div>

      {/* 필터 — 모바일 (4줄) */}
      <div className="filter-mobile" style={{ display: 'none', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {/* 1줄: 날짜 */}
        <div>
          <select value={currentMonth} onChange={e => router.push(`/reviews?month=${e.target.value}`)} className="input" style={{ width: 'auto', padding: '7px 12px' }}>
            {months.map((m: string) => <option key={`mob-${m}`} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
        {/* 2줄: 지점 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BRANCHES.map(b => (
            <button key={`mob-br-${b}`} className={`btn ${branch === b ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setBranch(b)}>{b}</button>
          ))}
        </div>
        {/* 3줄: Severity */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SEVERITIES.map(s => (
            <button key={`mob-sv-${s}`} className={`btn ${severity === s ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setSeverity(s)}>{s}</button>
          ))}
        </div>
        {/* 4줄: OTA */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>OTA</span>
          {otaSites.map(ota => (
            <button key={`mob-ota-${ota}`} className={`btn ${otaSite === ota ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setOtaSite(ota)}>{ota}</button>
          ))}
        </div>
      </div>

      {/* 요약 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '전체', value: filtered.length, color: 'var(--text-1)' },
          { label: 'Critical', value: criticalCnt, color: 'var(--critical)' },
          { label: 'High', value: highCnt, color: 'var(--high)' },
          { label: '평균 평점', value: avgRating, color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '13px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {sorted.length === 0
        ? <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ color: 'var(--text-2)' }}>리뷰 데이터가 없습니다.<br/>오른쪽 상단 버튼으로 직접 추가하거나 Claude Code로 수집해주세요.</div>
          </div>
        : <div className="card" style={{ overflow: 'hidden' }}>
            {/* 테이블 헤더 - 정렬 화살표 포함 */}
            <div className="review-header" style={{ display: 'grid', gridTemplateColumns: '90px 80px 58px 72px 1fr 66px 72px', padding: '9px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <SortHeader col="branch"   label="지점" />
              <span className="review-col-ota"><SortHeader col="ota" label="OTA" /></span>
              <SortHeader col="rating"   label="평점" />
              <SortHeader col="severity" label="Severity" />
              <span>내용</span>
              <span className="review-col-seg">세그먼트</span>
              <span className="review-col-act"></span>
            </div>

            {sorted.map((r: any) => {
              const isOpen = expanded === r.id
              return (
                <div key={r.id} id={`review-${r.id}`}>
                  <div
                    className="review-row-grid"
                    style={{ display: 'grid', gridTemplateColumns: '90px 80px 58px 72px 1fr 66px 72px', padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center', transition: 'background 0.15s', background: isOpen ? 'var(--bg-hover)' : 'transparent', outline: highlightReviewId === r.id ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }}
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <span className={`badge ${BRANCH_BADGE[r.branch] ?? 'badge-low'}`} style={{ fontSize: 11, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.branch}
                      </span>
                    </div>
                    <span className="review-col-ota" style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ota_site}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, color: r.rating < 5 ? 'var(--critical)' : r.rating < 7 ? 'var(--medium)' : 'var(--done)' }}>
                      <Star size={10} fill="currentColor" />{r.rating}
                    </span>
                    <div style={{ overflow: 'hidden' }}>
                      <span className={`badge ${SEV_BADGE[r.severity] ?? 'badge-low'}`} style={{ fontSize: 11, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.severity ?? '-'}
                      </span>
                    </div>
                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(r.content_ko ?? r.content ?? '').slice(0, 80)}
                      </div>
                      {(reviewTaskMap[r.id] ?? []).length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                          {(reviewTaskMap[r.id] as any[]).map((t: any) => (
                            <a key={t.id} href={`/tasks?month=${t.task_month}&task=${t.id}`}
                              onClick={e => e.stopPropagation()}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, color: 'var(--progress)', background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.3)', borderRadius: 4, padding: '2px 7px', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(74,158,255,0.22)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(74,158,255,0.1)' }}
                            >
                              📋 수행과제 연결
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="review-col-seg" style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                      <span className={`badge ${SEG_BADGE[r.customer_segment] ?? 'badge-low'}`} style={{ fontSize: 10, whiteSpace: 'nowrap', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.customer_segment ?? '-'}
                      </span>
                      {isOpen ? <ChevronUp size={11} color="var(--text-3)" style={{ flexShrink: 0 }} /> : <ChevronDown size={11} color="var(--text-3)" style={{ flexShrink: 0 }} />}
                    </div>
                    <div className="review-col-act" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setEditReview(r)} title="수정"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                        <Pencil size={11} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} title="삭제"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--critical)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--critical)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {isOpen && <ReviewDetail r={r} />}
                </div>
              )
            })}
          </div>
      }

      {showAdd && <ReviewModal currentMonth={currentMonth} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); router.refresh() }} />}
      {editReview && <ReviewModal review={editReview} currentMonth={currentMonth} onClose={() => setEditReview(null)} onSuccess={() => { setEditReview(null); router.refresh() }} />}
    </div>
  )
}

/* ─── 리뷰 상세 펼침 (번역 포함) ─── */
function ReviewDetail({ r }: any) {
  const [showOriginal, setShowOriginal] = useState(false)
  const hasTranslation = !!r.content_ko

  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
      {hasTranslation && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--done)', display: 'flex', alignItems: 'center', gap: 4 }}>
            🌐 한국어 번역
          </span>
          <button onClick={() => setShowOriginal(!showOriginal)}
            style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
            {showOriginal ? '번역 보기' : '원문 보기'}
          </button>
        </div>
      )}
      <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)', marginBottom: 10 }}>
        {hasTranslation && !showOriginal ? r.content_ko : r.content}
      </div>
      {hasTranslation && showOriginal && (
        <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--text-3)', marginBottom: 10, borderLeft: '3px solid var(--border)', fontStyle: 'italic' }}>
          {r.content}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(r.categories ?? []).map((c: string) => (
          <span key={c} className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{c}</span>
        ))}
        {(r.churn_triggers ?? []).map((t: string) => (
          <span key={t} className="badge" style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--critical)' }}>⚡ {t}</span>
        ))}
      </div>
    </div>
  )
}

/* ─── 리뷰 추가/수정 모달 ─── */
function ReviewModal({ review, currentMonth, onClose, onSuccess }: any) {
  const isEdit = !!review
  const [form, setForm] = useState({
    branch:          review?.branch ?? '동대문',
    ota_site:        review?.ota_site ?? '',
    rating:          review?.rating != null ? String(review.rating) : '',
    review_month:    review?.review_month ?? currentMonth,
    content:         review?.content ?? '',
    categories:      review?.categories ?? [] as string[],
    churn_triggers:  review?.churn_triggers ?? [] as string[],
    status:          review?.status ?? '신규접수',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const toggleArr = (k: string, v: string) => {
    const arr = (form as any)[k] as string[]
    set(k, arr.includes(v) ? arr.filter((x: string) => x !== v) : [...arr, v])
  }

  const computedSegment  = form.rating ? autoSegment(form.rating) : '-'
  const computedSeverity = form.rating ? autoSeverity(form.rating, form.churn_triggers) : '-'
  const SEG_COLOR: Record<string, string> = { '충성':'var(--done)', '만족':'var(--accent)', '위험':'var(--medium)', '이탈':'var(--critical)', '-':'var(--text-3)' }
  const SEV_COLOR: Record<string, string> = { 'Critical':'var(--critical)', 'High':'var(--high)', 'Medium':'var(--medium)', 'Low':'var(--low)', '-':'var(--text-3)' }

  const save = async () => {
    if (!form.ota_site.trim() || !form.rating || !form.content.trim()) return
    setSaving(true)
    const rating = parseFloat(form.rating)
    const payload = {
      ...form, rating,
      customer_segment: autoSegment(rating),
      severity: autoSeverity(rating, form.churn_triggers),
    }
    if (isEdit) {
      await fetch('/api/reviews/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.id, ...payload }) })
    } else {
      await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false)
    onSuccess()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="font-display" style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? '리뷰 수정' : '리뷰 직접 추가'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="지점 *">
              <select className="input" value={form.branch} onChange={e => set('branch', e.target.value)}>
                {['제주시티','동대문','신설','고성'].map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="OTA 사이트 *">
              <input className="input" placeholder="아고다, 부킹닷컴 등" value={form.ota_site} onChange={e => set('ota_site', e.target.value)} />
            </Field>
            <Field label="리뷰 월 *">
              <input className="input" placeholder="2026-04" value={form.review_month} onChange={e => set('review_month', e.target.value)} />
            </Field>
            <Field label="평점 * (0~10)">
              <input className="input" type="number" min="0" max="10" step="0.1" placeholder="예: 8.5" value={form.rating} onChange={e => set('rating', e.target.value)} />
            </Field>
          </div>
          {form.rating && (
            <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>고객 세그먼트 (자동)</div>
                <div style={{ fontWeight: 700, color: SEG_COLOR[computedSegment] }}>{computedSegment}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                  {computedSegment === '충성' ? '9.0~10점' : computedSegment === '만족' ? '7.0~8.9점' : computedSegment === '위험' ? '5.0~6.9점' : '0~4.9점'}
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Severity (자동)</div>
                <div style={{ fontWeight: 700, color: SEV_COLOR[computedSeverity] }}>{computedSeverity}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>평점·트리거 기반</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Severity 기준</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.7 }}>
                  🔴 Critical: 청결트리거 or 평점 ≤ 3<br/>
                  🟠 High: 복합이슈+저평점 or 평점 4~5<br/>
                  🟡 Medium: 평점 6~7 · ⚫ Low: 8 이상
                </div>
              </div>
            </div>
          )}
          <Field label="리뷰 내용 *">
            <textarea className="input" rows={4} placeholder="리뷰 내용을 입력하세요" value={form.content} onChange={e => set('content', e.target.value)} style={{ resize: 'vertical' }} />
          </Field>
          <Field label="카테고리 (복수 선택)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {CATS.map(c => (
                <button key={c} type="button" className={`btn ${form.categories.includes(c) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleArr('categories', c)}>{c}</button>
              ))}
            </div>
          </Field>
          <Field label="변심 트리거" sub="⚠️ 트리거 선택 시 Severity가 자동으로 재산정됩니다">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {TRIGGERS.map(t => (
                <button key={t} type="button" className={`btn ${form.churn_triggers.includes(t) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleArr('churn_triggers', t)}>{t}</button>
              ))}
            </div>
          </Field>
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.ota_site.trim() || !form.rating || !form.content.trim()}>
            {saving ? <><Loader2 size={13} className="spin" /> 저장 중...</> : isEdit ? '수정 완료' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
