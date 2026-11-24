'use client'
// 리뷰 추가·수정, Raw 추가(텍스트 붙여넣기, CSV 올리기). 1.0 모달과 같은 API·같은 값을 보낸다. 임베드(읽기 전용)에서는 열리지 않는다.
import { useEffect, useRef, useState } from 'react'
import { BRANCHES } from '@/lib/v2/metrics'
import { CATS, TRIGGERS, autoSegment, autoSeverity, csvRowToRaw, parseCsv, type ReviewRow } from '@/lib/v2/reviewsView'
import { generateMonthOptions } from '@/lib/utils'
import { mLabel } from '../parts'

const ym = (m: string) => `${m.slice(0, 4)}년 ${mLabel(m)}`

function Dialog({ title, onClose, foot, children, wide }: { title: string; onClose: () => void; foot: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const downOnBack = useRef(false)
  useEffect(() => { close.current = onClose })
  // 열 때 한 번만: 첫 칸에 초점, Esc 로 닫기, 닫으면 원래 자리로 초점
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [])
  return (
    // 바깥을 눌러 닫기는 누름과 뗌이 모두 바깥일 때만(글을 고르다 바깥에서 떼면 닫히지 않게)
    <div className="rvw-overlay"
      onMouseDown={e => { downOnBack.current = e.target === e.currentTarget }}
      onClick={e => { if (downOnBack.current && e.target === e.currentTarget) onClose() }}>
      <div ref={box} className={`rvw-dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="rvw-dialog-h">
          <h2>{title}</h2>
          <button type="button" className="rvw-x" onClick={onClose} aria-label="닫기">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" /></svg>
          </button>
        </div>
        <div className="rvw-dialog-b">{children}</div>
        <div className="rvw-dialog-f">{foot}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="rvw-field"><span className="rvw-field-k">{label}</span>{children}</label>
}

/* ─── 리뷰 추가·수정 (POST /api/reviews, PATCH /api/reviews/update) ─── */
export function ReviewModal({ review, currentMonth, defaultBranch, onClose, onSaved }: { review: ReviewRow | null; currentMonth: string; defaultBranch: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!review
  const [form, setForm] = useState({
    branch: review?.branch ?? defaultBranch,
    ota_site: review?.ota_site ?? '',
    rating: review?.rating != null ? String(review.rating) : '',
    review_month: review?.review_month ?? currentMonth,
    content: review?.content ?? '',
    categories: review?.categories ?? [],
    churn_triggers: review?.churn_triggers ?? [],
    status: review?.status ?? '신규접수',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  const toggle = (k: 'categories' | 'churn_triggers', v: string) =>
    setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }))

  const ok = !!form.ota_site.trim() && !!form.rating && !!form.content.trim()
  const seg = form.rating ? autoSegment(form.rating) : '–'
  const sev = form.rating ? autoSeverity(form.rating, form.churn_triggers) : '–'

  const save = async () => {
    if (!ok) return
    setSaving(true); setErr('')
    const rating = parseFloat(form.rating)
    const payload = { ...form, rating, customer_segment: autoSegment(rating), severity: autoSeverity(rating, form.churn_triggers) }
    const res = await fetch(isEdit ? '/api/reviews/update' : '/api/reviews', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isEdit ? { id: review!.id, ...payload } : payload),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { setErr('저장하지 못했습니다.'); return }
    onSaved()
  }

  return (
    <Dialog
      title={isEdit ? '리뷰 수정' : '리뷰 추가'} onClose={onClose}
      foot={<>
        {err && <span className="rvw-err">{err}</span>}
        <button type="button" className="act" onClick={onClose}>취소</button>
        <button type="button" className="act pri" onClick={save} disabled={saving || !ok}>{saving ? '저장 중' : isEdit ? '수정 완료' : '저장'}</button>
      </>}
    >
      <div className="rvw-grid2">
        <Field label="지점">
          <select className="rvw-input" value={form.branch} onChange={e => set('branch', e.target.value)}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="OTA 채널">
          <input className="rvw-input" placeholder="아고다, 부킹닷컴" value={form.ota_site} onChange={e => set('ota_site', e.target.value)} />
        </Field>
        <Field label="리뷰 월">
          <input className="rvw-input num" placeholder="2026-11" value={form.review_month} onChange={e => set('review_month', e.target.value)} />
        </Field>
        <Field label="점수 (0~10)">
          <input className="rvw-input num" type="number" min="0" max="10" step="0.1" placeholder="8.5" value={form.rating} onChange={e => set('rating', e.target.value)} />
        </Field>
      </div>
      <div className="rvw-auto" aria-live="polite">
        <div><span className="k">이용객 세그먼트 · 자동</span><b>{seg}</b></div>
        <div><span className="k">Severity · 자동</span><b>{sev}</b></div>
      </div>
      <Field label="리뷰 내용">
        <textarea className="rvw-input" rows={5} value={form.content} onChange={e => set('content', e.target.value)} />
      </Field>
      <div className="rvw-field">
        <span className="rvw-field-k">카테고리</span>
        <div className="rvw-toggles">
          {CATS.map(c => <button type="button" key={c} className={`rvw-tg${form.categories.includes(c) ? ' on' : ''}`} aria-pressed={form.categories.includes(c)} onClick={() => toggle('categories', c)}>{c}</button>)}
        </div>
      </div>
      <div className="rvw-field">
        <span className="rvw-field-k">변심 트리거</span>
        <div className="rvw-toggles">
          {TRIGGERS.map(t => <button type="button" key={t} className={`rvw-tg${form.churn_triggers.includes(t) ? ' on' : ''}`} aria-pressed={form.churn_triggers.includes(t)} onClick={() => toggle('churn_triggers', t)}>{t}</button>)}
        </div>
      </div>
    </Dialog>
  )
}

/* ─── Raw 추가 (POST /api/rawdata) — 텍스트 통째 붙여넣기 / CSV 올리기 ─── */
export function RawAddModal({ currentMonth, months, defaultBranch, onClose, onSaved }: { currentMonth: string; months: string[]; defaultBranch: string; onClose: () => void; onSaved: () => void }) {
  const generated = generateMonthOptions()
  const allMonths = [...new Set([...months, ...generated])].sort().reverse()
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [branch, setBranch] = useState<string>(defaultBranch)
  const [otaSite, setOtaSite] = useState('')
  const [reviewMonth, setReviewMonth] = useState(currentMonth || generated[0])
  const [rawText, setRawText] = useState('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileErr, setFileErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileErr('')
    if (file.name.endsWith('.csv')) {
      const parsed = parseCsv(await file.text())
      setRows(parsed)
      setProgress(`${parsed.length}행 읽음`)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      setFileErr('엑셀 파일은 CSV UTF-8 로 저장한 뒤 올립니다.')
    } else {
      setFileErr('CSV 파일만 올릴 수 있습니다.')
    }
  }

  const post = (body: object) => fetch('/api/rawdata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)

  const saveText = async () => {
    if (!rawText.trim() || !otaSite.trim()) return
    setSaving(true); setProgress('저장 중')
    const res = await post({
      branch, ota_site: otaSite, review_month: reviewMonth, content: rawText.trim(),
      raw_date: new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
    })
    setSaving(false)
    if (!res?.ok) { setProgress('저장하지 못했습니다.'); return }
    setProgress('저장 완료')
    setTimeout(onSaved, 500)
  }

  const saveRows = async () => {
    if (!rows.length || !otaSite.trim()) return
    setSaving(true)
    let done = 0, failed = 0
    for (const row of rows) {
      const res = await post(csvRowToRaw(row, { branch, ota_site: otaSite, review_month: reviewMonth }))
      if (res?.ok) done++; else failed++
      setProgress(`${done + failed}/${rows.length}건 저장 중`)
    }
    setSaving(false)
    setProgress(failed ? `${done}건 저장, ${failed}건 실패` : `${done}건 저장 완료`)
    if (!failed) setTimeout(onSaved, 800)
  }

  const canSave = mode === 'text' ? !!rawText.trim() && !!otaSite.trim() : rows.length > 0 && !!otaSite.trim()

  return (
    <Dialog
      wide title="Raw 추가" onClose={onClose}
      foot={<>
        {progress && <span className="rvw-progress">{progress}</span>}
        <button type="button" className="act" onClick={onClose}>취소</button>
        <button type="button" className="act pri" onClick={mode === 'text' ? saveText : saveRows} disabled={saving || !canSave}>
          {saving ? '저장 중' : mode === 'text' ? '저장' : <><span className="num">{rows.length}</span>건 저장</>}
        </button>
      </>}
    >
      <div className="rvw-grid3">
        <Field label="지점">
          <select className="rvw-input" value={branch} onChange={e => setBranch(e.target.value)}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="OTA 채널">
          <input className="rvw-input" placeholder="아고다, 에어비앤비" value={otaSite} onChange={e => setOtaSite(e.target.value)} />
        </Field>
        <Field label="리뷰 월">
          <select className="rvw-input" value={reviewMonth} onChange={e => setReviewMonth(e.target.value)}>
            {allMonths.map(m => <option key={m} value={m}>{ym(m)}</option>)}
          </select>
        </Field>
      </div>

      <div className="segs rvw-modeseg" role="tablist" aria-label="넣는 방법">
        <button type="button" role="tab" aria-selected={mode === 'text'} className={`seg${mode === 'text' ? ' on' : ''}`} onClick={() => setMode('text')}>텍스트 붙여넣기</button>
        <button type="button" role="tab" aria-selected={mode === 'file'} className={`seg${mode === 'file' ? ' on' : ''}`} onClick={() => setMode('file')}>CSV 올리기</button>
      </div>

      {mode === 'text' ? (
        <Field label="OTA 페이지 복사본">
          <textarea
            className="rvw-input rvw-mono" rows={12} value={rawText} onChange={e => setRawText(e.target.value)}
            placeholder={'3/31  10점  Fala (CN)\n一切都很好，就是有点贵\n\n3/30  8점  TOMOMI (JP)\nとってもいい匂いが漂っている。'}
          />
        </Field>
      ) : (
        <div className="rvw-field">
          <span className="rvw-field-k">CSV 머리 · date, rating, reviewer, country, content, travel_type, room_type 또는 날짜, 점수, 리뷰어, 국가, 리뷰 내용</span>
          <button type="button" className="rvw-drop" onClick={() => fileRef.current?.click()}>CSV 파일 고르기</button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onFile} />
          {fileErr && <span className="rvw-err">{fileErr}</span>}
          {rows.length > 0 && (
            <div className="boxed" style={{ marginTop: 10 }}>
              {rows.slice(0, 3).map((row, i) => (
                <div key={i} className="rv"><div className="rv-text rvw-ell">{Object.values(row).join(' | ')}</div></div>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
