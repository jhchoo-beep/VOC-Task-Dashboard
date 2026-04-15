'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MessageSquare, Calendar, User, Plus, Loader2, Pencil, Trash2, Link, X, ExternalLink, Search } from 'lucide-react'
import { formatMonth, generateMonthOptions } from '@/lib/utils'

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  '시작전': { bg: 'rgba(74,82,112,0.25)',   color: 'var(--todo)',     border: 'rgba(74,82,112,0.5)'   },
  '진행중': { bg: 'rgba(74,158,255,0.18)',  color: 'var(--progress)', border: 'rgba(74,158,255,0.55)' },
  '완료':   { bg: 'rgba(46,204,138,0.18)',  color: 'var(--done)',     border: 'rgba(46,204,138,0.55)' },
  '보류':   { bg: 'rgba(139,111,255,0.18)', color: 'var(--hold)',     border: 'rgba(139,111,255,0.55)'},
}

const SEV_BADGE: Record<string, string> = { Critical:'badge-critical', High:'badge-high', Medium:'badge-medium', Low:'badge-low' }
const SEV_CARD:  Record<string, string> = { Critical:'task-critical', High:'task-high', Medium:'task-medium', Low:'task-low' }
const BRANCH_BADGE: Record<string, string> = { '제주시티':'badge-jeju','제주':'badge-jeju','동대문':'badge-ddm','신설':'badge-sinseol','고성':'badge-goseong' }
const BRANCHES  = ['전체','제주시티','동대문','신설','고성']
const STATUSES  = ['전체','시작전','진행중','완료','보류']
const STATUS_LIST = ['시작전','진행중','완료','보류']
const CATS    = ['청결','소음','시설','직원서비스','체크인/체크아웃','위치/접근성','어메니티','가격','보안','기타']
const TRIGGERS = ['청결 Critical','복합이슈','서비스 실패','가격 불일치']

function Field({ label, children }: any) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

export default function TasksClient({ tasks, months, currentMonth, highlightTaskId }: any) {
  const router = useRouter()
  const [branch, setBranch] = useState('전체')
  const [status, setStatus] = useState('전체')
  const [expanded, setExpanded] = useState<string|null>(highlightTaskId ?? null)

  useEffect(() => {
    if (highlightTaskId) {
      setTimeout(() => {
        document.getElementById(`task-${highlightTaskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 400)
    }
  }, [highlightTaskId])
  const [showAdd, setShowAdd] = useState(false)
  const [editTask, setEditTask] = useState<any>(null)
  const [updatingId, setUpdatingId] = useState<string|null>(null)

  const filtered = tasks.filter((t: any) => {
    if (branch !== '전체' && t.branch !== branch) return false
    if (status !== '전체' && t.status !== status) return false
    return true
  })
  const done = filtered.filter((t: any) => t.status === '완료').length
  const pct  = filtered.length ? Math.round(done / filtered.length * 100) : 0

  const handleStatus = async (id: string, s: string) => {
    setUpdatingId(id)
    await fetch('/api/tasks/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: s }) })
    setUpdatingId(null)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 수행과제를 삭제할까요?')) return
    await fetch('/api/tasks/update', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    router.refresh()
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>수행과제</h1>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>변심 트리거 기반 문제 정의 & 해결 트래킹</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> 추가</button>
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* 월 선택 - 2026년 4월 형식 */}
        <select
          value={currentMonth}
          onChange={e => router.push(`/tasks?month=${e.target.value}`)}
          className="input"
          style={{ width: 'auto', padding: '7px 12px' }}
        >
          {months.map((m: string) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </select>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        {BRANCHES.map(b => (
          <button key={b} className={`btn ${branch === b ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setBranch(b)}>{b}</button>
        ))}
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        {STATUSES.map(s => (
          <button key={s} className={`btn ${status === s ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>

      {/* 진행률 */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 800, color: pct === 100 ? 'var(--done)' : 'var(--accent)' }}>{pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>완료율</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="progress" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--done)' : 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{done}/{filtered.length}건 완료 · {formatMonth(currentMonth)}</div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {STATUS_LIST.map(s => (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{filtered.filter((t: any) => t.status === s).length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 목록 */}
      {filtered.length === 0
        ? <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ color: 'var(--text-2)' }}>수행과제가 없습니다.<br/>Claude Code로 리뷰를 분석하면 자동 생성됩니다.</div>
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((task: any, i: number) => (
              <TaskCard
                key={task.id} task={task}
                expanded={expanded === task.id}
                onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                onStatusChange={handleStatus}
                onEdit={() => setEditTask(task)}
                onDelete={() => handleDelete(task.id)}
                updating={updatingId === task.id}
                delay={i * 0.03}
                highlight={highlightTaskId === task.id}
              />
            ))}
          </div>
      }

      {showAdd && <TaskModal currentMonth={currentMonth} months={months} onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); router.refresh() }} />}
      {editTask && <TaskModal task={editTask} currentMonth={currentMonth} months={months} onClose={() => setEditTask(null)} onSuccess={() => { setEditTask(null); router.refresh() }} />}
    </div>
  )
}

/* ─── 상태 배지 드롭다운 ─── */
function StatusBadge({ status, onChange, updating }: { status: string; onChange: (s: string) => void; updating: boolean }) {
  const [open, setOpen] = useState(false)
  const st = STATUS_STYLES[status] ?? STATUS_STYLES['시작전']

  if (updating) return <Loader2 size={15} className="spin" style={{ color: 'var(--text-3)' }} />

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 11px', borderRadius: 20,
          background: st.bg, color: st.color,
          border: `1px solid ${st.border}`,
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >
        {status === '진행중' && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--progress)', display: 'inline-block', animation: 'statusPulse 1.4s ease-in-out infinite', flexShrink: 0 }} />
        )}
        {status === '완료' && <span style={{ fontSize: 11 }}>✓</span>}
        {status}
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border-2)',
            borderRadius: 10, overflow: 'hidden', zIndex: 50,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)', minWidth: 110,
          }}>
            {STATUS_LIST.map(s => {
              const ss = STATUS_STYLES[s] ?? STATUS_STYLES['시작전']
              const isActive = s === status
              return (
                <button key={s} onClick={() => { onChange(s); setOpen(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '9px 14px',
                    background: isActive ? ss.bg : 'none',
                    border: 'none', color: isActive ? ss.color : 'var(--text-2)',
                    fontSize: 12, fontWeight: isActive ? 700 : 400,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = ss.bg; (e.currentTarget as HTMLElement).style.color = ss.color }}
                  onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' } }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ss.color, flexShrink: 0 }} />
                  {s}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── 수행과제 카드 ─── */
function TaskCard({ task, expanded, onToggle, onStatusChange, onEdit, onDelete, updating, delay, highlight }: any) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoaded, setLogsLoaded] = useState(false)

  const handleToggle = async () => {
    onToggle()
    if (!expanded && !logsLoaded) {
      const res = await fetch(`/api/tasks/logs?taskId=${task.id}`)
      setLogs(await res.json())
      setLogsLoaded(true)
    }
  }

  const refreshLogs = async () => {
    const res = await fetch(`/api/tasks/logs?taskId=${task.id}`)
    setLogs(await res.json())
  }

  const addLog = async () => {
    if (!comment.trim()) return
    setSubmitting(true)
    await fetch('/api/tasks/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: task.id, content: comment }) })
    setComment('')
    await refreshLogs()
    setSubmitting(false)
  }

  const addLink = async () => {
    if (!linkUrl.trim()) return
    setSubmitting(true)
    const content = linkLabel.trim() ? `[링크] ${linkLabel}||${linkUrl}` : `[링크] ${linkUrl}||${linkUrl}`
    await fetch('/api/tasks/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: task.id, content }) })
    setLinkUrl(''); setLinkLabel(''); setShowLinkInput(false)
    await refreshLogs()
    setSubmitting(false)
  }

  const deleteLog = async (logId: string) => {
    if (!confirm('이 진행 사항을 삭제할까요?')) return
    await fetch('/api/tasks/logs/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: logId }) })
    await refreshLogs()
  }

  const triggers = Array.isArray(task.churn_trigger) ? task.churn_trigger : []
  const cats     = Array.isArray(task.category) ? task.category : []
  const taskLink = task.link_url?.trim()

  return (
    <div id={`task-${task.id}`} className={`card fade-up ${SEV_CARD[task.severity] ?? 'task-low'}`} style={{ animationDelay: `${delay}s`, opacity: 0, outline: highlight ? '2px solid var(--accent)' : 'none', outlineOffset: 3 }}>
      {/* 카드 헤더 */}
      <div style={{ padding: '16px 20px', cursor: 'pointer' }} onClick={handleToggle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {task.severity && <span className={`badge ${SEV_BADGE[task.severity] ?? 'badge-low'}`}>{task.severity}</span>}
              {task.branch && <span className={`badge ${BRANCH_BADGE[task.branch] ?? 'badge-low'}`}>{task.branch}</span>}
              {task.task_month && <span className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-3)', border: '1px solid var(--border)', fontSize: 11 }}>{formatMonth(task.task_month)}</span>}
              {triggers.map((t: string) => (
                <span key={t} className="badge" style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--critical)', fontSize: 11 }}>📌 {t}</span>
              ))}
              {cats.slice(0, 2).map((c: string) => (
                <span key={c} className="badge" style={{ background: 'var(--bg-input)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{c}</span>
              ))}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{task.title}</div>

            {/* 수행과제 자체 링크 */}
            {taskLink && (
              <a href={taskLink} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>
                <ExternalLink size={11} />
                {task.link_label?.trim() || taskLink}
              </a>
            )}

            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
              {task.assignee && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><User size={11} />{task.assignee}</span>}
              {task.due_date && <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Calendar size={11} />{task.due_date}</span>}
              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><MessageSquare size={11} />{logs.length || 0}개</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <StatusBadge status={task.status} onChange={s => onStatusChange(task.id, s)} updating={updating} />
            <button onClick={onEdit} title="수정"
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} title="삭제"
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--critical)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--critical)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
              <Trash2 size={13} />
            </button>
            <ChevronDown size={15} color="var(--text-3)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', cursor: 'pointer' }} onClick={handleToggle} />
          </div>
        </div>
      </div>

      {/* 확장 영역 */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 20 }}>
          {task.problem_definition && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔍 문제가 뭐야?</div>
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '11px 14px', fontSize: 13, lineHeight: 1.7, borderLeft: '3px solid var(--medium)' }}>
                {task.problem_definition}
              </div>
            </div>
          )}
          {task.solution && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>💡 어떻게 해결할 거야?</div>
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '11px 14px', fontSize: 13, lineHeight: 1.7, borderLeft: '3px solid var(--done)' }}>
                {task.solution}
              </div>
            </div>
          )}
          {/* 리뷰 본문 */}
          {task.review_content && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📝 관련 리뷰 본문</div>
              <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '11px 14px', fontSize: 13, lineHeight: 1.7, borderLeft: '3px solid var(--accent)', color: 'var(--text-2)', fontStyle: 'italic' }}>
                "{task.review_content}"
              </div>
            </div>
          )}

          {/* 진행 로그 */}
          {logs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>진행 사항</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {logs.map((l: any) => {
                  const isLink = l.content?.startsWith('[링크] ')
                  let linkHref = '', linkText = ''
                  if (isLink) {
                    const raw = l.content.replace('[링크] ', '')
                    const parts = raw.split('||')
                    linkText = parts[0] ?? raw
                    linkHref = parts[1] ?? parts[0] ?? raw
                  }
                  return (
                    <div key={l.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: isLink ? 'var(--hold)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {isLink ? <Link size={12} /> : (l.author || 'U')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{l.author}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(l.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <button onClick={() => deleteLog(l.id)} title="삭제"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color 0.15s' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--critical)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                        {isLink
                          ? <a href={linkHref} target="_blank" rel="noopener noreferrer"
                              style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <ExternalLink size={11} /> {linkText}
                            </a>
                          : <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{l.content}</div>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 진행 사항 입력 */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>진행 사항 추가</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: showLinkInput ? 10 : 0 }}>
              <input className="input" placeholder="진행 사항을 입력하세요..." value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLog() } }}
                style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={addLog} disabled={submitting || !comment.trim()}>
                {submitting ? <Loader2 size={13} className="spin" /> : '추가'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowLinkInput(!showLinkInput)} title="링크 첨부" style={{ padding: '8px 10px' }}>
                <Link size={14} />
              </button>
            </div>

            {showLinkInput && (
              <div style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 10 }}>🔗 링크 첨부</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="input" placeholder="링크 제목 (선택, 예: 청결 점검 체크리스트)" value={linkLabel} onChange={e => setLinkLabel(e.target.value)} style={{ fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addLink() }}
                      style={{ flex: 1, fontSize: 13 }} />
                    <button className="btn btn-primary" onClick={addLink} disabled={submitting || !linkUrl.trim()} style={{ fontSize: 12 }}>
                      {submitting ? <Loader2 size={13} className="spin" /> : '첨부'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setShowLinkInput(false); setLinkUrl(''); setLinkLabel('') }} style={{ fontSize: 12 }}>취소</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 리뷰 피커 ─── */
function ReviewPickerField({ selectedReview, existingContent, onSelect, onClear }: any) {
  const [open, setOpen] = useState(false)
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterBranch, setFilterBranch] = useState('전체')
  const [filterMonth, setFilterMonth] = useState('전체')

  const openPicker = async () => {
    setOpen(true)
    if (reviews.length === 0) {
      setLoading(true)
      const res = await fetch('/api/reviews')
      const data = await res.json()
      setReviews(Array.isArray(data) ? data : [])
      setLoading(false)
    }
  }

  const close = () => { setOpen(false); setSearch(''); setFilterBranch('전체'); setFilterMonth('전체') }

  const months = ['전체', ...Array.from(new Set(reviews.map((r: any) => r.review_month).filter(Boolean))).sort().reverse()] as string[]

  const filtered = reviews.filter((r: any) => {
    if (filterBranch !== '전체' && r.branch !== filterBranch) return false
    if (filterMonth !== '전체' && r.review_month !== filterMonth) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(r.content_ko ?? r.content ?? '').toLowerCase().includes(q) &&
          !(r.ota_site ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const pickerProps = {
    reviews: filtered, loading, search, onSearch: setSearch,
    filterBranch, onFilterBranch: setFilterBranch,
    filterMonth, onFilterMonth: setFilterMonth, months,
    onSelect: (r: any) => { onSelect(r); close() },
    onClose: close,
  }

  if (selectedReview) {
    return (
      <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '12px 14px', borderLeft: '3px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>✓ 리뷰 연결됨</span>
            <span className={`badge ${BRANCH_BADGE[selectedReview.branch] ?? 'badge-low'}`} style={{ fontSize: 10 }}>{selectedReview.branch}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{selectedReview.ota_site}</span>
            <span style={{ fontSize: 11, color: selectedReview.rating < 5 ? 'var(--critical)' : selectedReview.rating < 7 ? 'var(--medium)' : 'var(--done)' }}>★ {selectedReview.rating}</span>
          </div>
          <button onClick={onClear} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer' }}>연결 해제</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {selectedReview.content_ko ?? selectedReview.content}
        </div>
        <button onClick={openPicker} style={{ marginTop: 8, background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', padding: 0 }}>다른 리뷰로 변경</button>
        {open && <ReviewPickerModal {...pickerProps} />}
      </div>
    )
  }

  return (
    <div>
      {existingContent && (
        <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: '3px solid var(--border-2)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, fontStyle: 'italic' }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'normal', marginBottom: 5 }}>기존 리뷰 내용 (리뷰 데이터와 미연결)</div>
          {existingContent.slice(0, 200)}{existingContent.length > 200 ? '...' : ''}
        </div>
      )}
      <button type="button" className="btn btn-ghost" onClick={openPicker}
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: 13 }}>
        <Search size={13} /> 리뷰 데이터에서 선택
      </button>
      {open && <ReviewPickerModal {...pickerProps} />}
    </div>
  )
}

function ReviewPickerModal({ reviews, loading, search, onSearch, filterBranch, onFilterBranch, filterMonth, onFilterMonth, months, onSelect, onClose }: any) {
  const branches = ['전체', '제주시티', '동대문', '신설', '고성']
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '90%', maxWidth: 660, maxHeight: '80vh',
        background: 'var(--bg-card)', border: '1px solid var(--border-2)',
        borderRadius: 12, zIndex: 200, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>리뷰 선택</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* 필터 영역 */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 텍스트 검색 */}
          <input className="input" placeholder="내용·OTA로 검색..." value={search} onChange={e => onSearch(e.target.value)} autoFocus />

          {/* 지점 필터 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, minWidth: 28 }}>지점</span>
            {branches.map((b: string) => (
              <button key={b} type="button"
                className={`btn ${filterBranch === b ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px', fontSize: 11 }}
                onClick={() => onFilterBranch(b)}>{b}</button>
            ))}
          </div>

          {/* 월 필터 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, minWidth: 28 }}>월</span>
            {months.map((m: string) => (
              <button key={m} type="button"
                className={`btn ${filterMonth === m ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '3px 10px', fontSize: 11 }}
                onClick={() => onFilterMonth(m)}>{m === '전체' ? '전체' : m}</button>
            ))}
          </div>
        </div>

        {/* 결과 카운트 */}
        {!loading && (
          <div style={{ padding: '6px 20px', fontSize: 11, color: 'var(--text-3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
            {reviews.length}건 표시됨
          </div>
        )}

        {/* 리뷰 목록 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading
            ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={22} className="spin" /></div>
            : reviews.length === 0
              ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>검색 결과가 없습니다</div>
              : reviews.map((r: any) => (
                  <div key={r.id} onClick={() => onSelect(r)}
                    style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', gap: 6, marginBottom: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge ${BRANCH_BADGE[r.branch] ?? 'badge-low'}`} style={{ fontSize: 10 }}>{r.branch}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.ota_site}</span>
                      <span style={{ fontSize: 11, color: r.rating < 5 ? 'var(--critical)' : r.rating < 7 ? 'var(--medium)' : 'var(--done)', fontWeight: 600 }}>★ {r.rating}</span>
                      <span className={`badge ${SEV_BADGE[r.severity] ?? 'badge-low'}`} style={{ fontSize: 10 }}>{r.severity}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{r.review_month}</span>
                    </div>
                    {r.content_ko && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.content_ko}
                      </div>
                    )}
                    {r.content && r.content !== r.content_ko && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.content}
                      </div>
                    )}
                    {!r.content_ko && r.content && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {r.content}
                      </div>
                    )}
                  </div>
                ))
          }
        </div>
      </div>
    </>
  )
}

/* ─── 수행과제 추가/수정 모달 ─── */
function TaskModal({ task, currentMonth, months, onClose, onSuccess }: any) {
  const isEdit = !!task
  // 월 선택지: DB에 있는 월 + 최근 12개월 생성된 월 합산 (중복 제거)
  const generatedMonths = generateMonthOptions()
  const allMonths = [...new Set([...(months ?? []), ...generatedMonths])].sort().reverse()

  const [form, setForm] = useState({
    branch:             task?.branch ?? '동대문',
    task_month:         task?.task_month ?? currentMonth,
    title:              task?.title ?? '',
    severity:           task?.severity ?? 'High',
    churn_trigger:      Array.isArray(task?.churn_trigger) ? task.churn_trigger : [] as string[],
    problem_definition: task?.problem_definition ?? '',
    solution:           task?.solution ?? '',
    review_content:     task?.review_content ?? '',
    linked_review_ids:  Array.isArray(task?.linked_review_ids) ? task.linked_review_ids : [] as string[],
    category:           Array.isArray(task?.category) ? task.category : [] as string[],
    assignee:           task?.assignee ?? '',
    due_date:           task?.due_date ?? '',
    link_url:           task?.link_url ?? '',
    link_label:         task?.link_label ?? '',
  })
  const [selectedReview, setSelectedReview] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const toggleArr = (k: string, v: string) => {
    const arr = (form as any)[k] as string[]
    set(k, arr.includes(v) ? arr.filter((x: string) => x !== v) : [...arr, v])
  }

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    if (isEdit) {
      await fetch('/api/tasks/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, ...form }) })
    } else {
      await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    }
    setSaving(false)
    onSuccess()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <span className="font-display" style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? '수행과제 수정' : '수행과제 추가'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 수행 월 - 드롭다운으로 변경 */}
            <Field label="수행 월">
              <select className="input" value={form.task_month} onChange={e => set('task_month', e.target.value)}>
                {allMonths.map((m: string) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            </Field>
            <Field label="지점">
              <select className="input" value={form.branch} onChange={e => set('branch', e.target.value)}>
                {['제주시티','동대문','신설','고성'].map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Severity">
            <select className="input" value={form.severity} onChange={e => set('severity', e.target.value)}>
              {['Critical','High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="제목 *">
            <input className="input" placeholder="수행과제 제목" value={form.title} onChange={e => set('title', e.target.value)} />
          </Field>

          <Field label="변심 트리거">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {TRIGGERS.map(t => (
                <button key={t} type="button" className={`btn ${form.churn_trigger.includes(t) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleArr('churn_trigger', t)}>{t}</button>
              ))}
            </div>
          </Field>

          <Field label="🔍 문제가 뭐야?">
            <textarea className="input" rows={3} placeholder="어떤 문제가 발생했는지 구체적으로" value={form.problem_definition} onChange={e => set('problem_definition', e.target.value)} style={{ resize: 'vertical' }} />
          </Field>

          <Field label="💡 어떻게 해결할 거야?">
            <textarea className="input" rows={3} placeholder="해결 방안을 구체적으로" value={form.solution} onChange={e => set('solution', e.target.value)} style={{ resize: 'vertical' }} />
          </Field>

          {/* 리뷰 연결 */}
          <Field label="📝 관련 리뷰 연결 (선택)">
            <ReviewPickerField
              selectedReview={selectedReview}
              existingContent={form.review_content}
              onSelect={(r: any) => {
                setSelectedReview(r)
                set('review_content', r.content_ko ?? r.content ?? '')
                set('linked_review_ids', [r.id])
              }}
              onClear={() => {
                setSelectedReview(null)
                set('review_content', '')
                set('linked_review_ids', [])
              }}
            />
          </Field>

          <Field label="카테고리">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {CATS.map(c => (
                <button key={c} type="button" className={`btn ${form.category.includes(c) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleArr('category', c)}>{c}</button>
              ))}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="담당자">
              <input className="input" placeholder="이름" value={form.assignee} onChange={e => set('assignee', e.target.value)} />
            </Field>
            <Field label="Due Date">
              <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </Field>
          </div>

          {/* 웹 링크 */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={13} /> 참고 링크 첨부 (선택)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Field label="링크 제목">
                <input className="input" placeholder="예: 청결 점검 체크리스트, 관련 보고서" value={form.link_label} onChange={e => set('link_label', e.target.value)} />
              </Field>
              <Field label="링크 URL">
                <input className="input" placeholder="https://..." value={form.link_url} onChange={e => set('link_url', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? '저장 중...' : isEdit ? '수정 완료' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
