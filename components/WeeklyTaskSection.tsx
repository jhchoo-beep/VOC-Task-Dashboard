'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  flattenCandidates, buildTaskPrompt, selectVisibleTasks, branchesOf,
  WEEKLY_TASK_STATUSES,
  type CandidateReview, type WeeklyTaskRow, type WeeklyTaskStatus,
} from '@/lib/weeklyTasks'
import type { WeeklyChannelRow } from '@/lib/weeklyReport'
import type { ChannelReviews } from '@/lib/weeklyReviews'

// 주간 수행과제 — 논의 카드가 관측에서 끝나지 않게 하는 층이다.
//
//   · 이 컴포넌트는 어떤 문안도 만들지 않는다. 근거 리뷰를 모아 프롬프트로 내주고,
//     사람이 AI에게 받아 온 문안을 담을 뿐이다.
//   · 임베드(embed=true)는 읽기 전용이다. 쓰기 컨트롤은 disabled 가 아니라 렌더 자체를 안 한다 —
//     /embed/* 는 OAuth 를 타지 않고 ?key= 토큰만으로 열리기 때문이다.

const BRANCH_COLOR: Record<string, string> = {
  신설: 'var(--sinseol)', 동대문: 'var(--ddm)', 제주시티: 'var(--jeju)', 고성: 'var(--goseong)',
}
const branchColor = (b: string) => BRANCH_COLOR[b] ?? 'var(--text-3)'
const fmt = (n: number) => n.toFixed(1)

function ratingColor(r: number | null) {
  if (r == null) return 'var(--text-3)'
  if (r >= 9) return 'var(--done)'
  if (r >= 7) return 'var(--medium)'
  if (r >= 5) return 'var(--high)'
  return 'var(--critical)'
}

// ─── 후보 리뷰 ────────────────────────────────────────────────────────────────
function CandidateList({
  items, selected, onToggle,
}: {
  items: CandidateReview[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(it => {
        const on = selected.has(it.id)
        return (
          <label
            key={it.id}
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
              border: `1px solid ${on ? 'var(--critical)' : 'var(--border)'}`,
              borderRadius: 8, padding: '9px 12px', background: 'var(--bg-input)',
            }}
          >
            <input
              type="checkbox" checked={on} onChange={() => onToggle(it.id)}
              style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: branchColor(it.branch) }} />
                  {it.branch} {it.otaName}
                </span>
                <span className="font-display" style={{ fontSize: 14, fontWeight: 800, color: ratingColor(it.rating) }}>
                  {it.rating == null ? '—' : fmt(it.rating)}
                </span>
                {it.date && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{it.date}</span>}
                {!it.translated && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>원문(번역 없음)</span>}
              </span>
              <span style={{ display: 'block', fontSize: 13, lineHeight: 1.65, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
                {it.body || '(본문 없음)'}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ─── 과제 폼 ──────────────────────────────────────────────────────────────────
// 붙여넣기가 주 입력 수단이다 — AI가 낸 '제목/문제 정의/해결안'을 옮겨 담는 자리다.
function TaskForm({
  week, sources, onDone, onCancel,
}: {
  week: string
  sources: CandidateReview[]
  onDone: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [solution, setSolution] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    if (!title.trim()) { setErr('제목을 입력해 주세요'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/weekly-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_start: week,
          branches: branchesOf(sources),
          title,
          problem_definition: problem,
          solution,
          assignee,
          due_date: due,
          source_reviews: sources,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? '저장에 실패했습니다')
        return
      }
      onDone()
    } catch {
      // fetch 자체가 throw 하는 경우(네트워크 단절·타임아웃) — 폼은 그대로 두고 사유만 보여준다
      setErr('네트워크 오류로 저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  const field: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.7,
  }
  const label: React.CSSProperties = { fontSize: 12, color: 'var(--text-3)', marginBottom: 4, display: 'block' }

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>새 주간 수행과제</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
        근거 리뷰 {sources.length}건 · {branchesOf(sources).join(' · ') || '지점 없음'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={label}>제목</label>
          <input style={field} value={title} onChange={e => setTitle(e.target.value)} placeholder="AI가 낸 제목을 붙여넣으세요" />
        </div>
        <div>
          <label style={label}>문제 정의</label>
          <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} value={problem} onChange={e => setProblem(e.target.value)} />
        </div>
        <div>
          <label style={label}>해결안</label>
          <textarea style={{ ...field, minHeight: 72, resize: 'vertical' }} value={solution} onChange={e => setSolution(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>담당</label>
            <input style={field} value={assignee} onChange={e => setAssignee(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>기한</label>
            <input style={field} type="date" value={due} onChange={e => setDue(e.target.value)} />
          </div>
        </div>
      </div>

      {err && <div style={{ fontSize: 12, color: 'var(--critical)', marginTop: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={save} disabled={saving}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--critical)',
            background: 'var(--critical)', color: '#fff', fontSize: 12,
            fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          onClick={onCancel} disabled={saving}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          취소
        </button>
      </div>
    </div>
  )
}

// ─── 과제 카드 ────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<WeeklyTaskStatus, string> = {
  시작전: 'var(--text-3)', 진행중: 'var(--progress)', 완료: 'var(--done)',
}

function TaskCard({
  task, carried, embed, onChanged,
}: {
  task: WeeklyTaskRow
  carried: boolean
  embed: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/weekly-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, ...body }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? '저장에 실패했습니다')
        return
      }
      onChanged()
    } catch {
      setErr('네트워크 오류로 저장에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/weekly-tasks?id=${task.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? '삭제에 실패했습니다')
        return
      }
      onChanged()
    } catch {
      setErr('네트워크 오류로 삭제에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{
      padding: '12px 18px', marginBottom: 8,
      borderLeft: `3px solid ${task.escalated ? 'var(--medium)' : STATUS_COLOR[task.status]}`,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 15, fontWeight: 700, minWidth: 0 }}>
          {task.branches.map(b => (
            <span key={b} style={{ width: 7, height: 7, borderRadius: '50%', background: branchColor(b), flexShrink: 0 }} />
          ))}
          {task.title}
          {carried && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>[이월 {task.week_start}]</span>}
          {task.escalated && <span style={{ fontSize: 11, color: 'var(--medium)', fontWeight: 400 }}>다음달 채택</span>}
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: STATUS_COLOR[task.status], fontWeight: 700 }}>{task.status}</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>근거 {task.source_reviews.length}건</span>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)',
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {open ? '닫기' : '자세히'}
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 13, lineHeight: 1.75 }}>
          {task.problem_definition && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>문제 정의</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{task.problem_definition}</div>
            </div>
          )}
          {task.solution && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>해결안</span>
              <div style={{ whiteSpace: 'pre-wrap' }}>{task.solution}</div>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
            {[task.assignee && `담당 ${task.assignee}`, task.due_date && `기한 ${task.due_date}`, `생성 ${task.week_start}`]
              .filter(Boolean).join(' · ')}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>근거 리뷰 {task.source_reviews.length}건</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {task.source_reviews.map(s => (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', background: 'var(--bg-input)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginBottom: 3, fontSize: 11, color: 'var(--text-3)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>{s.branch} {s.otaName}</span>
                  <span className="font-display" style={{ fontSize: 13, fontWeight: 800, color: ratingColor(s.rating) }}>
                    {s.rating == null ? '—' : fmt(s.rating)}
                  </span>
                  {s.date && <span>{s.date}</span>}
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{s.body || '(본문 없음)'}</div>
              </div>
            ))}
          </div>

          {/* 쓰기 컨트롤 — 임베드에는 렌더하지 않는다 */}
          {!embed && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, alignItems: 'center' }}>
              {WEEKLY_TASK_STATUSES.map(s => (
                <button
                  key={s} onClick={() => patch({ status: s })} disabled={busy || s === task.status}
                  style={{
                    padding: '5px 11px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                    cursor: s === task.status ? 'default' : 'pointer',
                    border: `1px solid ${s === task.status ? STATUS_COLOR[s] : 'var(--border)'}`,
                    background: s === task.status ? 'var(--bg-input)' : 'var(--bg-card)',
                    color: s === task.status ? STATUS_COLOR[s] : 'var(--text-2)',
                  }}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => patch({ escalated: !task.escalated })} disabled={busy}
                style={{
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${task.escalated ? 'var(--medium)' : 'var(--border)'}`,
                  background: 'var(--bg-card)', color: task.escalated ? 'var(--medium)' : 'var(--text-2)',
                  marginLeft: 8,
                }}
              >
                {task.escalated ? '채택 해제' : '다음달 정식 과제로 채택'}
              </button>
              <button
                onClick={remove} disabled={busy}
                style={{
                  padding: '5px 11px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-3)',
                  marginLeft: 'auto',
                }}
              >
                삭제
              </button>
            </div>
          )}
          {!embed && err && (
            <div style={{ fontSize: 11, color: 'var(--critical)', marginTop: 8 }}>{err}</div>
          )}
          {!embed && task.escalated && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
              다음 달 VOC 분석(/voc-analysis)이 이 과제를 변심 트리거·수행과제 도출의 후보로 읽습니다 — 지금 tasks에 등록되지는 않습니다
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyTaskSection({
  week, cards, reviews, tasks, embed = false,
}: {
  week: string
  cards: WeeklyChannelRow[]
  reviews: Record<number, ChannelReviews>
  tasks: WeeklyTaskRow[]
  embed?: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openCandidates, setOpenCandidates] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [formOpen, setFormOpen] = useState(false)
  // 폼에 넘길 근거는 여는 순간 스냅샷으로 고정한다 — chosen을 그대로 넘기면
  // 폼이 열린 채로 체크박스를 만질 때마다 저장될 근거가 실시간으로 바뀐다
  const [formSources, setFormSources] = useState<CandidateReview[]>([])
  const router = useRouter()

  const candidates = flattenCandidates(cards, reviews)
  const { current, carried } = selectVisibleTasks(tasks, week)
  const chosen = candidates.filter(c => selected.has(c.id))

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildTaskPrompt(chosen, week))
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    setTimeout(() => setCopied('idle'), 2500)
  }

  const total = current.length + carried.length

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>
          주간 수행과제 {total}건
        </b>
        {!embed && (
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>· 후보 리뷰 {candidates.length}건</span>
        )}
      </div>

      {/* 후보 리뷰는 과제를 '만드는' 도구다 — 읽기 전용 임베드에는 내지 않는다 */}
      {!embed && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 14 }}>
          <button
            onClick={() => setOpenCandidates(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <span>후보 리뷰 {candidates.length}건{selected.size > 0 && ` · ${selected.size}건 선택`}</span>
            <ChevronDown size={14} style={{ marginLeft: 'auto', transform: openCandidates ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>

          {openCandidates && (
            <div style={{ marginTop: 12 }}>
              {candidates.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
                  근거로 쓸 리뷰 원문이 없습니다 — 이번 주 미달 채널이 없거나, 원문이 수집 범위 밖입니다
                </div>
              ) : (
                <>
                  <CandidateList items={candidates} selected={selected} onToggle={toggle} />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
                    논의 카드의 기준선 미달 리뷰만 올라옵니다. 원문을 확보하지 못한 채널은 여기에 없습니다
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={copyPrompt}
                      disabled={chosen.length === 0}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: chosen.length === 0 ? 'var(--text-3)' : 'var(--text-1)',
                        fontSize: 12, fontFamily: 'inherit', cursor: chosen.length === 0 ? 'default' : 'pointer',
                        opacity: chosen.length === 0 ? 0.5 : 1,
                      }}
                    >
                      AI용 프롬프트 복사
                    </button>
                    {copied === 'ok' && <span style={{ fontSize: 12, color: 'var(--done)' }}>복사했습니다 — Claude에 붙여넣고 받은 문안을 아래 폼에 옮기세요</span>}
                    {copied === 'fail' && <span style={{ fontSize: 12, color: 'var(--critical)' }}>복사에 실패했습니다 — 브라우저 클립보드 권한을 확인해 주세요</span>}
                    <button
                      onClick={() => { setFormSources(chosen); setFormOpen(true) }}
                      disabled={chosen.length === 0}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-card)', color: chosen.length === 0 ? 'var(--text-3)' : 'var(--text-1)',
                        fontSize: 12, fontFamily: 'inherit', cursor: chosen.length === 0 ? 'default' : 'pointer',
                        opacity: chosen.length === 0 ? 0.5 : 1,
                      }}
                    >
                      선택 {chosen.length}건으로 과제 만들기
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!embed && formOpen && (
        <TaskForm
          week={week}
          sources={formSources}
          onCancel={() => { setFormOpen(false); setFormSources([]) }}
          onDone={() => {
            setFormOpen(false)
            setFormSources([])
            setSelected(new Set())
            router.refresh()
          }}
        />
      )}

      {total === 0 ? (
        <div className="card" style={{ padding: '14px 18px', fontSize: 13, color: 'var(--text-2)' }}>
          이번 주 수행과제가 아직 없습니다.
          {!embed && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 5 }}>
              위 후보 리뷰에서 근거를 고르고 프롬프트를 복사해 과제를 만드세요
            </div>
          )}
        </div>
      ) : (
        <>
          {current.map(t => (
            <TaskCard key={`${week}-${t.id}`} task={t} carried={false} embed={embed} onChanged={() => router.refresh()} />
          ))}
          {carried.map(t => (
            <TaskCard key={`${week}-${t.id}`} task={t} carried embed={embed} onChanged={() => router.refresh()} />
          ))}
        </>
      )}
    </div>
  )
}
