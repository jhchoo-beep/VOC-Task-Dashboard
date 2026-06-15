'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, MessageSquare, Calendar, User, Plus, Loader2, Pencil, Trash2, Link, X, ExternalLink, Search, ImagePlus } from 'lucide-react'
import { formatMonth, generateMonthOptions } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { driveThumbUrl, driveViewUrl } from '@/lib/driveUrl'

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  '시작전': { bg: 'rgba(74,82,112,0.25)',   color: 'var(--todo)',     border: 'rgba(74,82,112,0.5)'   },
  '진행중': { bg: 'rgba(74,158,255,0.18)',  color: 'var(--progress)', border: 'rgba(74,158,255,0.55)' },
  '완료':   { bg: 'rgba(46,204,138,0.18)',  color: 'var(--done)',     border: 'rgba(46,204,138,0.55)' },
  '보류':   { bg: 'rgba(139,111,255,0.18)', color: 'var(--hold)',     border: 'rgba(139,111,255,0.55)'},
}

const SEV_ORDER:    Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
const STATUS_ORDER: Record<string, number> = { '진행중': 0, '시작전': 1, '완료': 2, '보류': 3 }
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

export default function TasksClient({ tasks, months, currentMonth, highlightTaskId, embed = false }: any) {
  const router = useRouter()
  const pathname = usePathname()
  // 현재 경로(/tasks 또는 /embed/tasks)와 기존 쿼리(임베드 토큰 ?key= 등)를 보존한 채 월만 교체
  const changeMonth = (m: string) => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    params.set('month', m)
    router.push(`${pathname}?${params.toString()}`)
  }
  const [branch, setBranch] = useState('전체')
  const [status, setStatus] = useState('전체')
  const [expanded, setExpanded] = useState<string|null>(highlightTaskId ?? null)
  const [viewMode, setViewMode] = useState<'trigger' | 'list'>('trigger')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

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
  const [triggerLinks, setTriggerLinks] = useState<Record<string, { url: string; label: string | null }>>({})

  useEffect(() => {
    fetch('/api/trigger-links')
      .then(r => r.json())
      .then((rows: any[]) => {
        const map: Record<string, { url: string; label: string | null }> = {}
        rows.forEach(r => { map[r.trigger_name] = { url: r.url, label: r.label } })
        setTriggerLinks(map)
      })
  }, [])

  // useMemo로 참조를 고정해야 아래 triggerGroups useMemo도 실제로 캐시가 작동한다
  const filtered = useMemo(() => tasks
    .filter((t: any) => {
      if (branch !== '전체' && t.branch !== branch) return false
      if (status !== '전체' && t.status !== status) return false
      return true
    })
    .sort((a: any, b: any) => {
      const sevDiff = (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99)
      if (sevDiff !== 0) return sevDiff
      return (b.priority_score ?? 0) - (a.priority_score ?? 0)
    }), [tasks, branch, status])
  const done = filtered.filter((t: any) => t.status === '완료').length
  const pct  = filtered.length ? Math.round(done / filtered.length * 100) : 0

  const triggerGroups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const task of filtered) {
      const triggers = Array.isArray(task.churn_trigger) ? task.churn_trigger : []
      if (triggers.length === 0) {
        const arr = map.get('미분류') ?? []; arr.push(task); map.set('미분류', arr)
      } else {
        for (const t of triggers) {
          const arr = map.get(t) ?? []; arr.push(task); map.set(t, arr)
        }
      }
    }
    const sortTasks = (tasks: any[]) => [...tasks].sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
      if (statusDiff !== 0) return statusDiff
      return (SEV_ORDER[a.severity] ?? 99) - (SEV_ORDER[b.severity] ?? 99)
    })
    const allHold = (tasks: any[]) => tasks.every((t: any) => t.status === '보류')
    return Array.from(map.entries())
      .map(([trigger, tasks]) => ({ trigger, tasks: sortTasks(tasks) }))
      .sort((a, b) => {
        if (a.trigger === '미분류') return 1
        if (b.trigger === '미분류') return -1
        const aHold = allHold(a.tasks)
        const bHold = allHold(b.tasks)
        if (aHold !== bHold) return aHold ? 1 : -1
        const aInProgress = a.tasks.filter((t: any) => t.status === '진행중').length
        const bInProgress = b.tasks.filter((t: any) => t.status === '진행중').length
        if (aInProgress !== bInProgress) return bInProgress - aInProgress
        const aNotDone = a.tasks.filter((t: any) => t.status !== '완료').length
        const bNotDone = b.tasks.filter((t: any) => t.status !== '완료').length
        return bNotDone - aNotDone
      })
  }, [filtered])

  const toggleGroup = (trigger: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(trigger)) next.delete(trigger); else next.add(trigger)
      return next
    })
  }

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 8, padding: 3, border: '1px solid var(--border)', gap: 2 }}>
            <button
              className={`btn ${viewMode === 'trigger' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '4px 11px', fontSize: 12, borderRadius: 6 }}
              onClick={() => setViewMode('trigger')}
            >📌 트리거별</button>
            <button
              className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '4px 11px', fontSize: 12, borderRadius: 6 }}
              onClick={() => setViewMode('list')}
            >목록</button>
          </div>
          {!embed && <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> 추가</button>}
        </div>
      </div>

      {/* 필터 — 데스크탑 (한 줄) */}
      <div className="filter-desktop" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={currentMonth} onChange={e => changeMonth(e.target.value)} className="input" style={{ width: 'auto', padding: '7px 12px' }}>
          {months.map((m: string) => <option key={m} value={m}>{formatMonth(m)}</option>)}
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

      {/* 필터 — 모바일 (3줄) */}
      <div className="filter-mobile" style={{ display: 'none', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {/* 1줄: 날짜 */}
        <div>
          <select value={currentMonth} onChange={e => changeMonth(e.target.value)} className="input" style={{ width: 'auto', padding: '7px 12px' }}>
            {months.map((m: string) => <option key={`mob-${m}`} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
        {/* 2줄: 지점 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BRANCHES.map(b => (
            <button key={`mob-br-${b}`} className={`btn ${branch === b ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setBranch(b)}>{b}</button>
          ))}
        </div>
        {/* 3줄: 상태 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <button key={`mob-st-${s}`} className={`btn ${status === s ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setStatus(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* 진행률 */}
      <div className="card tasks-progress-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ textAlign: 'center', minWidth: 60 }}>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 800, color: pct === 100 ? 'var(--done)' : 'var(--accent)' }}>{pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>완료율</div>
        </div>
        <div className="tasks-progress-bar" style={{ flex: 1 }}>
          <div className="progress" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--done)' : 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6 }}>{done}/{filtered.length}건 완료 · {formatMonth(currentMonth)}</div>
        </div>
        <div className="tasks-progress-counts" style={{ display: 'flex', gap: 20 }}>
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
        : viewMode === 'trigger'
          ? <div>
              {triggerGroups.map(({ trigger, tasks }) => (
                <TriggerGroupSection
                  key={trigger}
                  embed={embed}
                  trigger={trigger}
                  tasks={tasks}
                  collapsed={!expandedGroups.has(trigger)}
                  onToggleCollapse={() => toggleGroup(trigger)}
                  expandedTaskId={expanded}
                  onToggleTask={(id: string) => setExpanded(expanded === id ? null : id)}
                  onStatusChange={handleStatus}
                  onEdit={(task: any) => setEditTask(task)}
                  onDelete={(id: string) => handleDelete(id)}
                  updatingId={updatingId}
                  highlightTaskId={highlightTaskId}
                  triggerLink={triggerLinks[trigger] ?? null}
                  onTriggerLinkSave={(url: string, label: string) => {
                    fetch('/api/trigger-links', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ trigger_name: trigger, url, label }),
                    }).then(() => setTriggerLinks(prev => ({ ...prev, [trigger]: { url, label } })))
                  }}
                  onTriggerLinkDelete={() => {
                    fetch('/api/trigger-links', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ trigger_name: trigger }),
                    }).then(() => setTriggerLinks(prev => { const next = { ...prev }; delete next[trigger]; return next }))
                  }}
                />
              ))}
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((task: any, i: number) => (
                <TaskCard
                  key={task.id} task={task}
                  embed={embed}
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

/* ─── 트리거 그룹 섹션 ─── */
function TriggerGroupSection({ trigger, tasks, collapsed, onToggleCollapse, expandedTaskId, onToggleTask, onStatusChange, onEdit, onDelete, updatingId, highlightTaskId, triggerLink, onTriggerLinkSave, onTriggerLinkDelete, embed = false }: any) {
  const [showLinkEdit, setShowLinkEdit] = useState(false)
  const [linkUrl, setLinkUrl] = useState(triggerLink?.url ?? '')
  const [linkLabel, setLinkLabel] = useState(triggerLink?.label ?? '')

  const done = tasks.filter((t: any) => t.status === '완료').length
  const pct  = tasks.length ? Math.round(done / tasks.length * 100) : 0
  const hasCritical = tasks.some((t: any) => t.severity === 'Critical')
  const hasHigh     = tasks.some((t: any) => t.severity === 'High')
  const borderColor = hasCritical ? 'var(--critical)' : hasHigh ? 'var(--high)' : 'var(--accent)'

  const sevCounts: Record<string, number> = {}
  tasks.forEach((t: any) => { sevCounts[t.severity] = (sevCounts[t.severity] ?? 0) + 1 })

  const statusCounts: Record<string, number> = {}
  tasks.forEach((t: any) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1 })

  const assignees = [...new Set(tasks.map((t: any) => t.assignee).filter(Boolean))] as string[]
  const branches  = [...new Set(tasks.map((t: any) => t.branch).filter(Boolean))] as string[]

  const isMisc = trigger === '미분류'

  return (
    <div style={{ marginBottom: 14 }}>
      {/* 트리거 헤더 */}
      <div
        onClick={onToggleCollapse}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover, rgba(255,255,255,0.04))' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)' }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '13px 18px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-2)',
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: collapsed ? 10 : '10px 10px 0 0',
          cursor: 'pointer',
          transition: 'background 0.15s',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 14 }}>{isMisc ? '📁' : '📌'}</span>
        {/* 트리거명 + 링크 아이콘 */}
        <span style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, flexShrink: 1 }}>
          {trigger}
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{tasks.length}건</span>
          {triggerLink?.url && (
            <a href={triggerLink.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--accent)', fontSize: 11, textDecoration: 'none', fontWeight: 400 }}>
              <ExternalLink size={11} />
              {triggerLink.label || '참고'}
            </a>
          )}
          {!isMisc && !embed && (
            <button
              onClick={e => { e.stopPropagation(); setLinkUrl(triggerLink?.url ?? ''); setLinkLabel(triggerLink?.label ?? ''); setShowLinkEdit(v => !v) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'inline-flex', alignItems: 'center' }}
              title="링크 편집"
            >
              <Link size={11} />
            </button>
          )}
        </span>
        {/* 지점 배지 */}
        {branches.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {branches.map(b => (
              <span key={b} className={`badge ${BRANCH_BADGE[b] ?? 'badge-low'}`} style={{ fontSize: 10, padding: '2px 7px' }}>
                {b}
              </span>
            ))}
          </div>
        )}
        {/* 담당자 */}
        {assignees.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {assignees.map(a => (
              <span key={a} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500,
                background: 'rgba(255,255,255,0.06)', color: 'var(--text-2)',
                border: '1px solid var(--border)',
              }}>
                <User size={9} />
                {a}
              </span>
            ))}
          </div>
        )}
        {/* 우측 컨트롤 묶음 — 좁은 화면에서 통째로 줄바꿈되어 정렬 유지 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {(['Critical','High','Medium','Low'] as const).map(sev => sevCounts[sev] ? (
            <span key={sev} className={`badge ${SEV_BADGE[sev]}`} style={{ fontSize: 10, padding: '2px 7px' }}>
              {sev[0]} {sevCounts[sev]}
            </span>
          ) : null)}
        </div>
        {/* 상태별 카운트 */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {STATUS_LIST.map(s => {
            const cnt = statusCounts[s] ?? 0
            if (!cnt) return null
            const ss = STATUS_STYLES[s]
            return (
              <span key={s} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`,
                whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: ss.color, flexShrink: 0 }} />
                {s} {cnt}
              </span>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
          <div style={{ flex: 1, height: 5, background: 'var(--bg-input)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--done)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 11, color: pct === 100 ? 'var(--done)' : 'var(--text-2)', minWidth: 36, fontWeight: pct === 100 ? 700 : 400 }}>
            {done}/{tasks.length}
          </span>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: collapsed ? `${borderColor}22` : 'rgba(255,255,255,0.05)',
          color: collapsed ? borderColor : 'var(--text-3)',
          border: `1px solid ${collapsed ? borderColor + '55' : 'var(--border)'}`,
          transition: 'all 0.2s', flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {collapsed ? '수행과제 보기' : '접기'}
          <ChevronDown size={11} style={{ transform: collapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
        </span>
        </div>
      </div>

      {/* 링크 편집 패널 */}
      {showLinkEdit && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-2)',
            borderTop: 'none', padding: '12px 18px',
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          }}
        >
          <input
            value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
            placeholder="링크 제목 (선택)"
            className="input" style={{ fontSize: 12, padding: '6px 10px', width: 140 }}
          />
          <input
            value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className="input" style={{ fontSize: 12, padding: '6px 10px', flex: 1, minWidth: 180 }}
          />
          <button
            onClick={() => { if (linkUrl.trim()) { onTriggerLinkSave(linkUrl.trim(), linkLabel.trim()); setShowLinkEdit(false) } }}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
          >저장</button>
          {triggerLink?.url && (
            <button
              onClick={() => { onTriggerLinkDelete(); setShowLinkEdit(false) }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-3)' }}
            >삭제</button>
          )}
          <button
            onClick={() => setShowLinkEdit(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
          ><X size={14} /></button>
        </div>
      )}

      {/* 과제 목록 */}
      {!collapsed && (
        <div style={{
          border: '1px solid var(--border-2)', borderTop: 'none',
          borderLeft: `4px solid ${borderColor}`,
          borderRadius: '0 0 10px 10px',
          padding: '10px 10px',
          display: 'flex', flexDirection: 'column', gap: 8,
          background: 'rgba(0,0,0,0.10)',
        }}>
          {tasks.map((task: any, i: number) => (
            <TaskCard
              key={task.id}
              task={task}
              embed={embed}
              expanded={expandedTaskId === task.id}
              onToggle={() => onToggleTask(task.id)}
              onStatusChange={onStatusChange}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task.id)}
              updating={updatingId === task.id}
              delay={i * 0.03}
              highlight={highlightTaskId === task.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── 상태 배지 드롭다운 ─── */
function StatusBadge({ status, onChange, updating }: { status: string; onChange: (s: string) => void; updating: boolean }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const st = STATUS_STYLES[status] ?? STATUS_STYLES['시작전']

  if (updating) return <Loader2 size={15} className="spin" style={{ color: 'var(--text-3)' }} />

  const handleOpen = () => {
    if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  const dropdownStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    top: rect.bottom + 6,
    left: Math.max(4, rect.right - 120),
    background: 'var(--bg-card)',
    border: '1px solid var(--border-2)',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 9999,
    boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
    minWidth: 110,
  } : {}

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
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

      {open && rect && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={dropdownStyle}>
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
        </>,
        document.body
      )}
    </div>
  )
}

/* ─── 수행과제 카드 ─── */
function TaskCard({ task, expanded, onToggle, onStatusChange, onEdit, onDelete, updating, delay, highlight, embed = false }: any) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [logType, setLogType] = useState<'업데이트' | '이슈' | '해결'>('업데이트')
  const [logAuthor, setLogAuthor] = useState('')
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [typeMenuPos, setTypeMenuPos] = useState({ top: 0, left: 0 })
  const typeMenuBtnRef = useRef<HTMLButtonElement>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoaded, setLogsLoaded] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  // 로그 읽기는 인증 API 대신 Supabase에서 직접 조회한다(anon 키, 공개 읽기).
  // 이렇게 해야 비로그인 임베드(/embed)에서도 진행 사항이 보인다. (API GET과 동일 쿼리)
  const loadLogs = async () => {
    const { data } = await supabase
      .from('task_logs').select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
    setLogs(data ?? [])
  }

  const handleToggle = async () => {
    onToggle()
    if (!expanded && !logsLoaded) {
      await loadLogs()
      setLogsLoaded(true)
    }
  }

  const refreshLogs = loadLogs

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    setPhotos(prev => [...prev, ...picked].slice(0, 5))
    if (photoInputRef.current) photoInputRef.current.value = ''
  }
  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx))

  const addLog = async () => {
    if (!comment.trim()) return
    setSubmitting(true)
    try {
      let attachments: { fileId: string; name: string }[] = []
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(p => fd.append('files', p))
        const up = await fetch('/api/tasks/logs/upload', { method: 'POST', body: fd })
        if (!up.ok) { alert((await up.json()).error ?? '사진 업로드 실패'); setSubmitting(false); return }
        attachments = (await up.json()).attachments
      }
      const prefix = logType === '이슈' ? '[이슈] ' : logType === '해결' ? '[해결] ' : ''
      const content = prefix + comment.trim()
      await fetch('/api/tasks/logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content, author: logAuthor.trim() || undefined, attachments }),
      })
      setComment('')
      setPhotos([])
      await refreshLogs()
    } finally {
      setSubmitting(false)
    }
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
        <div className="task-card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div className="task-card-left" style={{ flex: 1, minWidth: 0 }}>
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
            <div className="task-title" style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{task.title}</div>

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

          <div className="task-card-right" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {embed
              ? <span className="badge" style={{ background: (STATUS_STYLES[task.status]?.bg ?? 'var(--bg-input)'), color: (STATUS_STYLES[task.status]?.color ?? 'var(--text-2)'), border: `1px solid ${STATUS_STYLES[task.status]?.border ?? 'var(--border)'}`, whiteSpace: 'nowrap' }}>{task.status}</span>
              : <StatusBadge status={task.status} onChange={s => onStatusChange(task.id, s)} updating={updating} />}
            {/* 수정·삭제는 쓰기 작업이라 임베드(비로그인)에서는 숨김 */}
            {!embed && (<>
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
            </>)}
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
                  const isIssue = l.content?.startsWith('[이슈] ')
                  const isResolved = l.content?.startsWith('[해결] ')
                  let linkHref = '', linkText = ''
                  if (isLink) {
                    const raw = l.content.replace('[링크] ', '')
                    const parts = raw.split('||')
                    linkText = parts[0] ?? raw
                    linkHref = parts[1] ?? parts[0] ?? raw
                  }
                  const displayContent = isIssue ? l.content.replace('[이슈] ', '') : isResolved ? l.content.replace('[해결] ', '') : l.content
                  const avatarBg = isLink ? 'var(--hold)' : isIssue ? '#e53e3e' : isResolved ? '#38a169' : 'var(--accent)'
                  const leftBorder = isIssue ? '3px solid #e53e3e' : isResolved ? '3px solid #38a169' : 'none'
                  return (
                    <div key={l.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8, borderLeft: leftBorder }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {isLink ? <Link size={12} /> : isResolved ? '✓' : (l.author || 'U')[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isIssue && <span style={{ fontSize: 10, fontWeight: 700, background: '#e53e3e22', color: '#e53e3e', borderRadius: 4, padding: '1px 6px' }}>이슈</span>}
                            {isResolved && <span style={{ fontSize: 10, fontWeight: 700, background: '#38a16922', color: '#38a169', borderRadius: 4, padding: '1px 6px' }}>해결</span>}
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{l.author}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{new Date(l.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {!embed && (
                            <button onClick={() => deleteLog(l.id)} title="삭제"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color 0.15s' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--critical)'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                              <X size={12} />
                            </button>
                            )}
                          </div>
                        </div>
                        {isLink
                          ? <a href={linkHref} target="_blank" rel="noopener noreferrer"
                              style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <ExternalLink size={11} /> {linkText}
                            </a>
                          : <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{displayContent}</div>
                        }
                        {Array.isArray(l.attachments) && l.attachments.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {l.attachments.map((a: { fileId: string; name: string }) => (
                              <a key={a.fileId} href={driveViewUrl(a.fileId)} target="_blank" rel="noopener noreferrer">
                                <img src={driveThumbUrl(a.fileId, 400)} alt={a.name}
                                  style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 진행 사항 입력 — 쓰기 작업이라 임베드(비로그인)에서는 숨김 */}
          {!embed && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>진행 사항 추가</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: showLinkInput ? 10 : 0 }}>
              {/* 타입 드롭다운 */}
              <div style={{ flexShrink: 0 }}>
                <button
                  ref={typeMenuBtnRef}
                  className="btn btn-ghost"
                  onClick={() => {
                    const r = typeMenuBtnRef.current?.getBoundingClientRect()
                    if (r) setTypeMenuPos({ top: r.bottom + 4, left: r.left })
                    setShowTypeMenu(v => !v)
                  }}
                  onBlur={() => setTimeout(() => setShowTypeMenu(false), 150)}
                  style={{ fontSize: 12, gap: 4, padding: '0 10px', height: '100%', minWidth: 90,
                    borderLeft: logType === '이슈' ? '3px solid #e53e3e' : logType === '해결' ? '3px solid #38a169' : undefined }}
                >
                  {logType === '이슈' && <span style={{ color: '#e53e3e', fontSize: 10 }}>●</span>}
                  {logType === '해결' && <span style={{ color: '#38a169', fontSize: 11 }}>✓</span>}
                  {logType} ▾
                </button>
                {showTypeMenu && createPortal(
                  <div style={{ position: 'fixed', top: typeMenuPos.top, left: typeMenuPos.left, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 99999, minWidth: 110, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {(['업데이트', '이슈', '해결'] as const).map(t => (
                      <button key={t} onMouseDown={() => { setLogType(t); setShowTypeMenu(false) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-1)', borderRadius: 6,
                          fontWeight: logType === t ? 700 : 400 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                        {t === '이슈' && <span style={{ color: '#e53e3e', fontSize: 10 }}>●</span>}
                        {t === '해결' && <span style={{ color: '#38a169' }}>✓</span>}
                        {t === '업데이트' && <span style={{ fontSize: 10, opacity: 0.4 }}>●</span>}
                        {t}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
              </div>
              {/* 작성자 */}
              <input className="input" placeholder="작성자" value={logAuthor} onChange={e => setLogAuthor(e.target.value)} style={{ width: 90, flexShrink: 0 }} />
              {/* 내용 */}
              <input className="input" placeholder="내용 입력 후 Enter..." value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addLog() } }}
                style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={addLog} disabled={submitting || !comment.trim()}>
                {submitting ? <Loader2 size={13} className="spin" /> : '+ 추가'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowLinkInput(!showLinkInput)} title="링크 첨부" style={{ padding: '8px 10px' }}>
                <Link size={14} />
              </button>
              <button className="btn btn-ghost" onClick={() => photoInputRef.current?.click()} title="사진 첨부" style={{ padding: '8px 10px' }}>
                <ImagePlus size={14} />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: 'none' }} />
            </div>

            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={URL.createObjectURL(p)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button onClick={() => removePhoto(i)} title="제거"
                      style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--critical)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}

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
          )}
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
      // API 라우트 우회 — 표시·검색·연결에 필요한 컬럼만 조회, 정렬은 DB에서 처리
      const { data } = await supabase
        .from('reviews')
        .select('id, branch, ota_site, rating, severity, review_month, content_ko, content')
        .order('review_month', { ascending: false })
        .order('rating', { ascending: false })
        .range(0, 4999)
      setReviews(Array.isArray(data) ? data : [])
      setLoading(false)
    }
  }

  const close = () => { setOpen(false); setSearch(''); setFilterBranch('전체'); setFilterMonth('전체') }

  const months = useMemo(
    () => ['전체', ...Array.from(new Set(reviews.map((r: any) => r.review_month).filter(Boolean))).sort().reverse()] as string[],
    [reviews]
  )

  const filtered = useMemo(() => reviews.filter((r: any) => {
    if (filterBranch !== '전체' && r.branch !== filterBranch) return false
    if (filterMonth !== '전체' && r.review_month !== filterMonth) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(r.content_ko ?? r.content ?? '').toLowerCase().includes(q) &&
          !(r.ota_site ?? '').toLowerCase().includes(q)) return false
    }
    return true
  }), [reviews, filterBranch, filterMonth, search])

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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, minWidth: 28 }}>월</span>
            <select className="input" value={filterMonth} onChange={e => onFilterMonth(e.target.value)}
              style={{ width: 'auto', padding: '4px 10px', fontSize: 12 }}>
              {months.map((m: string) => (
                <option key={m} value={m}>{m === '전체' ? '전체 월' : m}</option>
              ))}
            </select>
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
  const [customTriggerInput, setCustomTriggerInput] = useState('')
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {/* 사전 정의 트리거 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TRIGGERS.map(t => (
                  <button key={t} type="button" className={`btn ${form.churn_trigger.includes(t) ? 'btn-primary' : 'btn-ghost'}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => toggleArr('churn_trigger', t)}>{t}</button>
                ))}
              </div>
              {/* 직접 입력한 커스텀 트리거 태그 */}
              {form.churn_trigger.filter((t: string) => !TRIGGERS.includes(t)).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.churn_trigger.filter((t: string) => !TRIGGERS.includes(t)).map((t: string) => (
                    <span key={t} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 10px', borderRadius: 20, fontSize: 11,
                      background: 'rgba(74,158,255,0.18)', color: 'var(--progress)',
                      border: '1px solid rgba(74,158,255,0.45)',
                    }}>
                      {t}
                      <button type="button" onClick={() => toggleArr('churn_trigger', t)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', padding: 0, opacity: 0.7 }}>
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* 직접 입력 */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  placeholder="직접 입력 후 Enter (예: 와이파이 불량, 주차 불편)"
                  value={customTriggerInput}
                  onChange={e => setCustomTriggerInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = customTriggerInput.trim()
                      if (v && !form.churn_trigger.includes(v)) toggleArr('churn_trigger', v)
                      setCustomTriggerInput('')
                    }
                  }}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button type="button" className="btn btn-ghost"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => {
                    const v = customTriggerInput.trim()
                    if (v && !form.churn_trigger.includes(v)) toggleArr('churn_trigger', v)
                    setCustomTriggerInput('')
                  }}>
                  추가
                </button>
              </div>
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
