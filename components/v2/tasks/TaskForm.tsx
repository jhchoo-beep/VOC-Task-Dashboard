'use client'
// 수행과제 2.0 등록·수정 창. 입력 칸과 저장 API 는 1.0 TaskModal 과 같다(POST /api/tasks — 슬랙 알림은 서버가 보냄, PATCH /api/tasks/update).
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMonth, generateMonthOptions } from '@/lib/utils'
import { BRANCHES } from '@/lib/v2/metrics'
import { CATEGORIES, SEVERITIES, TRIGGER_PRESETS, type Task } from '@/lib/v2/tasks'
import { SearchIcon } from '../parts'
import { SevPill } from './bits'

interface Props {
  task: Task | null
  initialBranch?: string
  initialTitle?: string
  currentMonth: string
  months: string[]
  onClose: () => void
  onSaved: (month: string | null, id: string) => void
}

interface PickedReview { id: string; branch: string; ota_site: string | null; rating: number | null; severity: string | null; review_month: string | null; content_ko: string | null; content: string | null }

export default function TaskForm({ task, initialBranch, initialTitle, currentMonth, months, onClose, onSaved }: Props) {
  const isEdit = !!task
  // 월 선택지: DB에 있는 월 + 최근 12개월(1.0 과 같음)
  const allMonths = useMemo(() => [...new Set([...(months ?? []), ...generateMonthOptions(), ...(currentMonth ? [currentMonth] : [])])].sort().reverse(), [months, currentMonth])
  const [form, setForm] = useState({
    branch: task?.branch ?? initialBranch ?? '',
    task_month: task?.task_month ?? currentMonth,
    title: task?.title ?? initialTitle ?? '',
    severity: task?.severity ?? 'High',
    churn_trigger: Array.isArray(task?.churn_trigger) ? [...task!.churn_trigger!] : [] as string[],
    problem_definition: task?.problem_definition ?? '',
    solution: task?.solution ?? '',
    review_content: task?.review_content ?? '',
    linked_review_ids: Array.isArray(task?.linked_review_ids) ? [...task!.linked_review_ids!] : [] as string[],
    category: Array.isArray(task?.category) ? [...task!.category!] : [] as string[],
    assignee: task?.assignee ?? '',
    due_date: task?.due_date ?? '',
    link_url: task?.link_url ?? '',
    link_label: task?.link_label ?? '',
  })
  const [picked, setPicked] = useState<PickedReview | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  type F = typeof form
  const set = <K extends keyof F>(k: K, v: F[K]) => setForm(f => ({ ...f, [k]: v }))
  const toggle = (k: 'churn_trigger' | 'category', v: string) =>
    setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }))
  const addCustom = () => {
    const v = custom.trim()
    if (v && !form.churn_trigger.includes(v)) toggle('churn_trigger', v)
    setCustom('')
  }

  useEffect(() => { titleRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pickerOpen) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen, onClose])

  const canSave = !!form.title.trim() && !!form.branch && !saving
  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const res = isEdit
        ? await fetch('/api/tasks/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task!.id, ...form }) })
        : await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { alert(body.error ?? '저장하지 못했습니다. 다시 시도해 주세요.'); return }
      onSaved(form.task_month || null, isEdit ? task!.id : body.id)
    } finally { setSaving(false) }
  }

  const customTriggers = form.churn_trigger.filter(t => !TRIGGER_PRESETS.includes(t))

  return (
    <div className="tk-modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tk-modal" role="dialog" aria-modal="true" aria-labelledby="tk-form-h">
        <div className="tk-modal-h">
          <b id="tk-form-h">{isEdit ? '수행과제 수정' : '새 수행과제'}</b>
          <button type="button" className="tk-x big" aria-label="닫기" onClick={onClose}>×</button>
        </div>

        <div className="tk-modal-b">
          <div className="tk-grid3">
            <Field label="수행 월">
              <select className="tk-in" value={form.task_month} onChange={e => set('task_month', e.target.value)}>
                {allMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
              </select>
            </Field>
            <Field label="지점">
              <select className={`tk-in${form.branch ? '' : ' tk-unset'}`} value={form.branch} onChange={e => set('branch', e.target.value)}>
                {!form.branch && <option value="" disabled>지점 선택</option>}
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="심각도">
              <select className="tk-in" value={form.severity} onChange={e => set('severity', e.target.value)}>
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <Field label="제목">
            <input ref={titleRef} className="tk-in" placeholder="수행과제 제목" value={form.title} onChange={e => set('title', e.target.value)} />
          </Field>

          <Field label="변심 트리거">
            <div className="tk-chips">
              {TRIGGER_PRESETS.map(t => (
                <button key={t} type="button" className={`tk-chip${form.churn_trigger.includes(t) ? ' on' : ''}`} aria-pressed={form.churn_trigger.includes(t)} onClick={() => toggle('churn_trigger', t)}>{t}</button>
              ))}
            </div>
            {customTriggers.length > 0 && (
              <div className="tk-chips">
                {customTriggers.map(t => (
                  <span key={t} className="tk-chip on tk-chip-x">
                    <span>{t}</span>
                    <button type="button" aria-label={`${t} 빼기`} onClick={() => toggle('churn_trigger', t)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="tk-inline">
              <input className="tk-in" placeholder="직접 입력 후 Enter" value={custom} onChange={e => setCustom(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addCustom() } }} />
              <button type="button" className="act" onClick={addCustom}>추가</button>
            </div>
          </Field>

          <Field label="문제 정의">
            <textarea className="tk-in tk-ta" rows={3} value={form.problem_definition} onChange={e => set('problem_definition', e.target.value)} />
          </Field>
          <Field label="해결 방안">
            <textarea className="tk-in tk-ta" rows={3} value={form.solution} onChange={e => set('solution', e.target.value)} />
          </Field>

          <Field label="관련 리뷰">
            {picked ? (
              <div className="tk-picked">
                <div className="rv-meta">
                  <span>{picked.branch} · {picked.ota_site}</span>
                  {picked.rating != null && <span className={`score num${picked.rating < 9 ? ' low' : ''}`}>{picked.rating}</span>}
                  <button type="button" className="tk-mini" onClick={() => { setPicked(null); setForm(f => ({ ...f, review_content: '', linked_review_ids: [] })) }}>연결 해제</button>
                </div>
                <div className="rv-text tk-clamp3">{picked.content_ko ?? picked.content}</div>
                <button type="button" className="tk-mini" onClick={() => setPickerOpen(true)}>다른 리뷰로 변경</button>
              </div>
            ) : (
              <>
                {form.review_content && <div className="tk-picked"><div className="rv-meta"><span>기존 리뷰 내용</span></div><div className="rv-text tk-clamp3">{form.review_content}</div></div>}
                <button type="button" className="act tk-wide" onClick={() => setPickerOpen(true)}><SearchIcon /> 리뷰 데이터에서 선택</button>
              </>
            )}
          </Field>

          <Field label="카테고리">
            <div className="tk-chips">
              {CATEGORIES.map(c => (
                <button key={c} type="button" className={`tk-chip${form.category.includes(c) ? ' on' : ''}`} aria-pressed={form.category.includes(c)} onClick={() => toggle('category', c)}>{c}</button>
              ))}
            </div>
          </Field>

          <div className="tk-grid2">
            <Field label="담당"><input className="tk-in" placeholder="이름" value={form.assignee} onChange={e => set('assignee', e.target.value)} /></Field>
            <Field label="기한"><input className="tk-in" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} /></Field>
          </div>

          <div className="tk-grid2">
            <Field label="참고 링크 제목"><input className="tk-in" placeholder="예: 청결 점검 체크리스트" value={form.link_label} onChange={e => set('link_label', e.target.value)} /></Field>
            <Field label="참고 링크 주소"><input className="tk-in" placeholder="https://..." value={form.link_url} onChange={e => set('link_url', e.target.value)} /></Field>
          </div>
        </div>

        <div className="tk-modal-f">
          <button type="button" className="act" onClick={onClose}>취소</button>
          <button type="button" className="act pri" disabled={!canSave} onClick={save}>{saving ? '저장 중' : isEdit ? '수정' : '등록'}</button>
        </div>
      </div>

      {pickerOpen && (
        <ReviewPicker
          onClose={() => setPickerOpen(false)}
          onPick={r => {
            setPicked(r)
            setForm(f => ({ ...f, review_content: r.content_ko ?? r.content ?? '', linked_review_ids: [r.id] }))
            setPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tk-field">
      <span className="tk-label">{label}</span>
      {children}
    </div>
  )
}

/* 리뷰 고르기 — 1.0 과 같이 reviews 표를 직접 읽는다(최근 달 먼저, 최대 5000건) */
function ReviewPicker({ onClose, onPick }: { onClose: () => void; onPick: (r: PickedReview) => void }) {
  const [rows, setRows] = useState<PickedReview[] | null>(null)
  const [q, setQ] = useState('')
  const [branch, setBranch] = useState('전체')
  const [month, setMonth] = useState('전체')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const out: PickedReview[] = []
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await supabase.from('reviews')
          .select('id, branch, ota_site, rating, severity, review_month, content_ko, content')
          .order('review_month', { ascending: false }).order('rating', { ascending: false }).order('id', { ascending: true })
          .range(from, from + 999)
        if (error) { console.error('리뷰 조회 실패', error.message); break }
        out.push(...((data ?? []) as PickedReview[]))
        if (!data || data.length < 1000) break
      }
      if (alive) setRows(out)
    })()
    return () => { alive = false }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const monthOpts = useMemo(() => [...new Set((rows ?? []).map(r => r.review_month).filter(Boolean) as string[])].sort().reverse(), [rows])
  const ql = q.trim().toLowerCase()
  const list = (rows ?? []).filter(r => {
    if (branch !== '전체' && r.branch !== branch) return false
    if (month !== '전체' && r.review_month !== month) return false
    if (ql && !(r.content_ko ?? r.content ?? '').toLowerCase().includes(ql) && !(r.ota_site ?? '').toLowerCase().includes(ql)) return false
    return true
  })

  return (
    <div className="tk-modal-bg top" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tk-modal tk-picker" role="dialog" aria-modal="true" aria-labelledby="tk-pick-h">
        <div className="tk-modal-h">
          <b id="tk-pick-h">리뷰 선택</b>
          <button type="button" className="tk-x big" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <div className="tk-picker-f">
          <label className="search" style={{ width: '100%' }}>
            <SearchIcon />
            <span className="tk-sr">리뷰 검색</span>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="내용 · OTA 검색" />
          </label>
          <div className="tk-inline">
            <div className="segs" role="group" aria-label="지점">
              {['전체', ...BRANCHES].map(b => (
                <button key={b} type="button" className={`seg${branch === b ? ' on' : ''}`} aria-pressed={branch === b} onClick={() => setBranch(b)}>{b === '전체' ? '전 지점' : b}</button>
              ))}
            </div>
            <select className="select" aria-label="리뷰 달" value={month} onChange={e => setMonth(e.target.value)}>
              <option value="전체">전체 월</option>
              {monthOpts.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
            </select>
          </div>
          {rows && <span className="tk-note inline"><span className="num">{list.length}</span>건</span>}
        </div>
        <div className="tk-picker-list">
          {!rows && <div className="tk-note">리뷰를 읽는 중</div>}
          {rows && list.length === 0 && <div className="tk-note">검색 결과 없음</div>}
          {list.slice(0, 300).map(r => (
            <button key={r.id} type="button" className="li" onClick={() => onPick(r)}>
              <span className="li-meta">
                {r.rating != null && <span className={`score num${r.rating < 9 ? ' low' : ''}`}>{r.rating}</span>}
                <span className="tk-ell">{r.branch} · {r.ota_site}{r.review_month ? ` · ${formatMonth(r.review_month)}` : ''}</span>
                <span className="r"><SevPill severity={r.severity} /></span>
              </span>
              <span className="li-t sm tk-clamp2">{r.content_ko ?? r.content}</span>
              {r.content && r.content_ko && r.content !== r.content_ko && <span className="tk-row-sub tk-ell">{r.content}</span>}
            </button>
          ))}
          {list.length > 300 && <div className="tk-note"><span className="num">300</span>건까지 표시</div>}
        </div>
      </div>
    </div>
  )
}
