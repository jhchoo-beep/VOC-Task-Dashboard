'use client'
// STAY VOC 2.0 수행과제 — B 관제 콘솔형. 상단 바 → 지표 줄 4칸 → 왼쪽 목록 / 가운데 고른 과제 / 오른쪽 상태·정보·링크.
// 🔴 한 과제가 트리거 N개에 속하면 왼쪽 목록에 N줄로 나온다. 그래서 목록 줄은 상태가 없는 버튼으로만 두고,
//    고른 과제의 상세는 가운데 한 군데에서만(key=과제 id) 그린다. 진행 사항·입력 중인 글은 과제 id 를 키로 이 컴포넌트가 들고 있다.
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMonth } from '@/lib/utils'
import { ALL, BRANCHES, type Scope } from '@/lib/v2/metrics'
import {
  ALL_STATUS, TASK_STATUSES, countTasks, filterTasks, groupByTrigger, sortTasks, triggersOf, UNCLASSIFIED,
  type Task, type TaskLog,
} from '@/lib/v2/tasks'
import { SearchIcon, mLabel } from '../parts'
import { Chevron, SevPill, StatusPill, mdOf } from './bits'
import TaskDetail, { EMPTY_DRAFT, type Draft } from './TaskDetail'
import TaskSide, { type TriggerLink } from './TaskSide'
import TaskForm from './TaskForm'
import '@/app/v2/tasks/tasks.css'

type View = 'trigger' | 'list'
type FormState = null | { mode: 'new'; branch: string; title: string; fromUrl: boolean } | { mode: 'edit'; task: Task }
export type LogsState = 'loading' | 'ok' | 'error'

interface Props {
  tasks: Task[]
  months: string[]
  currentMonth: string
  initialSel: string | null
  initialBranch: Scope
  initialStatus: string
  prefill: { branch: string; title: string } | null
  embed: boolean
  embedKey: string | null
}

const AUTHOR_KEY = 'voc2-log-author'

/** PostgREST 는 한 응답 1000행이 상한이라 이어 받는다 */
async function readLogs(taskIds: string[]): Promise<Record<string, TaskLog[]>> {
  const out: Record<string, TaskLog[]> = {}
  for (let i = 0; i < taskIds.length; i += 50) {
    const chunk = taskIds.slice(i, i + 50)
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('task_logs').select('*').in('task_id', chunk)
        .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + 999)
      if (error) throw new Error(error.message)
      for (const r of (data ?? []) as TaskLog[]) (out[r.task_id] ??= []).push(r)
      if (!data || data.length < 1000) break
    }
  }
  return out
}

export default function TasksConsole(p: Props) {
  const router = useRouter()
  const pathname = usePathname() ?? '/v2/tasks'
  const [branch, setBranch] = useState<Scope>(p.initialBranch)
  const [status, setStatus] = useState(p.initialStatus)
  const [q, setQ] = useState('')
  const [view, setView] = useState<View>('trigger')
  const [sel, setSel] = useState<string | null>(p.initialSel)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [links, setLinks] = useState<Record<string, TriggerLink>>({})
  const [logs, setLogs] = useState<Record<string, TaskLog[]>>({})
  const [logsState, setLogsState] = useState<LogsState>('loading')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [author, setAuthorState] = useState('')
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => p.prefill
    ? { mode: 'new', branch: p.prefill.branch || (p.initialBranch !== ALL ? p.initialBranch : ''), title: p.prefill.title, fromUrl: true }
    : null)
  const detailRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 서버에서 새 목록이 오면 낙관적 상태 표시는 버린다
  useEffect(() => { setStatusOverride({}) }, [p.tasks])

  const tasks = useMemo(() => p.tasks.map(t => (statusOverride[t.id] ? { ...t, status: statusOverride[t.id] } : t)), [p.tasks, statusOverride])
  const scoped = useMemo(() => (branch === ALL ? tasks : tasks.filter(t => t.branch === branch)), [tasks, branch])
  const counts = useMemo(() => countTasks(scoped), [scoped])
  const visible = useMemo(() => sortTasks(filterTasks(tasks, { branch, status, q })), [tasks, branch, status, q])
  const groups = useMemo(() => groupByTrigger(visible), [visible])
  const first = view === 'trigger' ? groups[0]?.tasks[0] : visible[0]
  const cur = visible.find(t => t.id === sel) ?? first ?? null

  // 진행 사항: 인증 API 대신 Supabase 직접 조회(anon, 공개 읽기) — 비로그인 임베드에서도 보이게(1.0 과 같은 방식)
  const idsKey = p.tasks.map(t => t.id).join(',')
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : []
    let alive = true
    setLogsState('loading')
    readLogs(ids)
      .then(m => {
        if (!alive) return
        setLogs(prev => { const next = { ...prev }; for (const id of ids) next[id] = m[id] ?? []; return next })
        setLogsState('ok')
      })
      .catch(e => { console.error('진행 사항 조회 실패', e); if (alive) setLogsState('error') })
    return () => { alive = false }
  }, [idsKey])
  const reloadLogs = useCallback(async (id: string) => {
    try {
      const m = await readLogs([id])
      setLogs(prev => ({ ...prev, [id]: m[id] ?? [] }))
    } catch (e) { console.error('진행 사항 조회 실패', e) }
  }, [])

  // 트리거 링크도 직접 읽는다(/api/trigger-links GET 은 미들웨어 로그인 검사에 걸려 임베드에서 못 읽음). 쓰기는 API.
  useEffect(() => {
    supabase.from('churn_trigger_links').select('trigger_name,url,label').then(({ data, error }) => {
      if (error) { console.error('트리거 링크 조회 실패', error.message); return }
      const m: Record<string, TriggerLink> = {}
      for (const r of data ?? []) m[r.trigger_name as string] = { url: r.url as string, label: (r.label as string | null) ?? null }
      setLinks(m)
    })
  }, [])

  // 작성자 이름은 이 브라우저에만 기억(편의)
  useEffect(() => { try { setAuthorState(localStorage.getItem(AUTHOR_KEY) ?? '') } catch { /* 없어도 됨 */ } }, [])
  const setAuthor = (v: string) => { setAuthorState(v); try { localStorage.setItem(AUTHOR_KEY, v) } catch { /* 없어도 됨 */ } }

  // ?id= 로 들어오면 그 줄이 목록 안에서 보이게. 페이지 자체는 움직이지 않는다(scrollIntoView 는 창까지 굴려 상단 바가 가려진다)
  useEffect(() => {
    const box = listRef.current
    if (!p.initialSel || !box || box.scrollHeight <= box.clientHeight) return
    const el = box.querySelector(`[data-task="${p.initialSel}"]`)
    if (!el) return
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect()
    box.scrollTop += (r.top - b.top) - (b.height - r.height) / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const urlWith = (set: Record<string, string | null>) => {
    const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    for (const [k, v] of Object.entries(set)) { if (v == null || v === '') qs.delete(k); else qs.set(k, v) }
    const s = qs.toString()
    return s ? `${pathname}?${s}` : pathname
  }
  const changeMonth = (m: string) => router.push(urlWith({
    month: m, branch: branch === ALL ? null : branch, status: status === ALL_STATUS ? null : status, id: null, task: null, new: null, title: null,
  }))

  const pick = (id: string) => {
    setSel(id)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }
  const toggleGroup = (t: string) => setCollapsed(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n })

  const patchDraft = useCallback((id: string, patch: Partial<Draft>) =>
    setDrafts(d => ({ ...d, [id]: { ...(d[id] ?? EMPTY_DRAFT), ...patch } })), [])

  // ─── 쓰기(1.0 API 그대로) ───
  const changeStatus = async (id: string, s: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/tasks/status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: s }) })
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error ?? '상태를 바꾸지 못했습니다. 다시 시도해 주세요.'); return }
      setStatusOverride(o => ({ ...o, [id]: s }))
      router.refresh()
    } finally { setUpdatingId(null) }
  }
  const deleteTask = async (id: string) => {
    if (!confirm('이 수행과제를 삭제할까요?')) return
    const res = await fetch('/api/tasks/update', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error ?? '삭제하지 못했습니다. 다시 시도해 주세요.'); return }
    setSel(null)
    router.refresh()
  }
  const saveLink = async (trigger: string, url: string, label: string) => {
    const res = await fetch('/api/trigger-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger_name: trigger, url, label }) })
    if (!res.ok) { alert('트리거 링크를 저장하지 못했습니다. 다시 시도해 주세요.'); return false }
    setLinks(prev => ({ ...prev, [trigger]: { url, label: label || null } }))
    return true
  }
  const deleteLink = async (trigger: string) => {
    const res = await fetch('/api/trigger-links', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger_name: trigger }) })
    if (!res.ok) { alert('트리거 링크를 지우지 못했습니다. 다시 시도해 주세요.'); return false }
    setLinks(prev => { const n = { ...prev }; delete n[trigger]; return n })
    return true
  }
  const closeForm = () => {
    if (form?.mode === 'new' && form.fromUrl) router.replace(urlWith({ new: null, title: null }), { scroll: false })
    setForm(null)
  }
  const onSaved = (month: string | null, id: string) => {
    const fromUrl = form?.mode === 'new' && form.fromUrl
    setForm(null)
    if (month && month !== p.currentMonth) {
      router.push(urlWith({ month, id, task: null, new: null, title: null }))
      return
    }
    setSel(id)
    if (fromUrl) router.replace(urlWith({ new: null, title: null }), { scroll: false })
    router.refresh()
  }

  const scopeName = branch === ALL ? '전 지점' : branch
  const home = p.embed ? `/embed/v2${p.embedKey ? `?key=${encodeURIComponent(p.embedKey)}` : ''}` : '/v2'
  const monthOpts = p.months.includes(p.currentMonth) || !p.currentMonth ? p.months : [p.currentMonth, ...p.months]
  const share = (n: number) => (counts.total ? `${Math.round(n / counts.total * 100)}%` : '–')

  // 목록 한 줄. 🔴 상태 없는 버튼만 — 같은 과제가 여러 묶음에 나와도 섞일 상태가 없다
  const row = (t: Task, sub = false) => {
    const ls = logs[t.id]
    const last = ls?.[0]?.created_at
    return (
      <button key={t.id} type="button" data-task={t.id} className={`li tk-row${sub ? ' sub' : ''}${cur?.id === t.id ? ' on' : ''}`}
        aria-current={cur?.id === t.id ? 'true' : undefined} onClick={() => pick(t.id)}>
        <span className="li-meta">
          <SevPill severity={t.severity} />
          <span className="tk-ell">{t.branch} · {t.assignee || '담당 미정'}{t.due_date ? <> · 기한 <span className="num">{mdOf(t.due_date)}</span></> : null}</span>
          <span className="r"><StatusPill status={t.status} /></span>
        </span>
        <span className="li-t sm tk-clamp2">{t.title}</span>
        {!sub && triggersOf(t).length > 0 && <span className="tk-row-sub tk-ell">{triggersOf(t).join(' · ')}</span>}
        <span className="tk-row-sub">진행 사항 <span className="num">{ls ? ls.length : '–'}</span>{last ? <> · 마지막 <span className="num">{mdOf(last.slice(0, 10))}</span></> : null}</span>
      </button>
    )
  }

  return (
    <main className="v2-console tk-console">
      <div className="v2-bar tk-bar">
        {/* 임베드는 미리 받기를 끈다 — 미리 받기 요청은 ?key= 를 떼고 나가 미들웨어 토큰 검사에 403 으로 막힌다 */}
        <div className="v2-crumb"><Link href={home} prefetch={p.embed ? false : undefined}>홈</Link><span>/</span><b>수행과제</b></div>
        <div className="segs" role="group" aria-label="지점" style={{ marginLeft: 'auto' }}>
          {[ALL, ...BRANCHES].map(b => (
            <button key={b} type="button" className={`seg${branch === b ? ' on' : ''}`} aria-pressed={branch === b} onClick={() => setBranch(b as Scope)}>
              {b === ALL ? '전 지점' : b}
            </button>
          ))}
        </div>
        <select className="select" aria-label="상태" value={status} onChange={e => setStatus(e.target.value)}>
          <option value={ALL_STATUS}>전체 상태</option>
          {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" aria-label="수행 월" value={p.currentMonth} onChange={e => changeMonth(e.target.value)}>
          {monthOpts.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>
        <label className="search tk-search">
          <SearchIcon />
          <span className="tk-sr">수행과제 검색</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="과제 · 담당 · 트리거 검색" />
        </label>
        {!p.embed && (
          <button type="button" className="act pri" onClick={() => setForm({ mode: 'new', branch: branch === ALL ? '' : branch, title: '', fromUrl: false })}>
            새 수행과제
          </button>
        )}
      </div>

      <div className="v2-kpis">
        <div className="v2-kpi">
          <span className="k">{scopeName} · {p.currentMonth ? mLabel(p.currentMonth) : '–'} 완료율</span>
          <span className={`v num${counts.pct === 100 ? ' tone-ok' : ''}`}>{counts.pct == null ? '–' : `${counts.pct}%`}</span>
          <span className="s">완료 <span className="num">{counts.done}</span> / 전체 <span className="num">{counts.total}</span>건</span>
          <span className="tk-kbar" aria-hidden="true"><i style={{ width: `${counts.pct ?? 0}%` }} /></span>
        </div>
        {(['진행중', '시작전', '보류'] as const).map(s => (
          <div key={s} className="v2-kpi">
            <span className="k">{s}</span>
            <span className={`v num${s === '진행중' ? ' tone-know' : ''}`}>{counts.byStatus[s]}<small>건</small></span>
            <span className="s">전체의 <span className="num">{share(counts.byStatus[s])}</span></span>
          </div>
        ))}
      </div>

      <div className="v2-panes">
        <section className="v2-pane list" aria-label="수행과제 목록">
          <div className="tabbs" role="tablist">
            <button type="button" role="tab" aria-selected={view === 'trigger'} className={`tabb${view === 'trigger' ? ' on' : ''}`} onClick={() => setView('trigger')}>
              트리거별 <span className="num">{groups.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={view === 'list'} className={`tabb${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')}>
              과제 목록 <span className="num">{visible.length}</span>
            </button>
          </div>
          <div className="scroll" ref={listRef}>
            {visible.length === 0 && (
              <div className="empty">{p.tasks.length === 0 ? `${p.currentMonth ? formatMonth(p.currentMonth) : '이 달'} 수행과제 없음` : '조건에 맞는 수행과제 없음'}</div>
            )}
            {view === 'list' && visible.map(t => row(t))}
            {view === 'trigger' && groups.map(g => {
              const open = !collapsed.has(g.trigger)
              const c = countTasks(g.tasks)
              const brs = [...new Set(g.tasks.map(t => t.branch).filter(Boolean))]
              const link = links[g.trigger]
              return (
                <div key={g.trigger} className="tk-grp">
                  <div className="tk-grp-h">
                    <button type="button" className="tk-grp-btn" aria-expanded={open} onClick={() => toggleGroup(g.trigger)}>
                      <span className="li-meta">
                        <Chevron open={open} />
                        <span className="tk-ell">{brs.join(', ')} · 과제 <span className="num">{g.tasks.length}</span>{c.byStatus['진행중'] ? <> · 진행중 <span className="num">{c.byStatus['진행중']}</span></> : null}</span>
                        <span className="r">완료 <span className="num">{c.done}/{c.total}</span></span>
                      </span>
                      <span className={`tk-grp-t${g.trigger === UNCLASSIFIED ? ' dim' : ''}`}>{g.trigger}</span>
                      <span className="tk-gbar" aria-hidden="true"><i className={c.pct === 100 ? 'full' : ''} style={{ width: `${c.pct ?? 0}%` }} /></span>
                    </button>
                    {link?.url && (
                      <a className="lnk tk-grp-link" href={link.url} target="_blank" rel="noopener noreferrer">{link.label || '참고'} ↗</a>
                    )}
                  </div>
                  {open && g.tasks.map(t => row(t, true))}
                </div>
              )
            })}
          </div>
        </section>

        <section className="v2-pane main" aria-label="고른 수행과제" ref={detailRef}>
          {cur
            ? <TaskDetail key={cur.id} task={cur} logs={logs[cur.id]} logsState={logsState} draft={drafts[cur.id] ?? EMPTY_DRAFT}
                onDraft={patch => patchDraft(cur.id, patch)} author={author} onAuthor={setAuthor}
                onReload={() => reloadLogs(cur.id)} embed={p.embed} />
            : <div className="empty">{p.tasks.length ? '왼쪽 목록에서 고르면 여기에 문제 정의와 진행 사항이 보입니다.' : '이 달 수행과제 없음'}</div>}
        </section>

        <aside className="v2-pane side" aria-label="상태와 정보">
          {cur
            ? <TaskSide key={cur.id} task={cur} embed={p.embed} updating={updatingId === cur.id}
                onStatus={s => changeStatus(cur.id, s)} onEdit={() => setForm({ mode: 'edit', task: cur })} onDelete={() => deleteTask(cur.id)}
                links={links} onSaveLink={saveLink} onDeleteLink={deleteLink} />
            : <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>고른 과제 없음</div>}
        </aside>
      </div>

      {form && !p.embed && (
        <TaskForm
          key={form.mode === 'edit' ? form.task.id : 'new'}
          task={form.mode === 'edit' ? form.task : null}
          initialBranch={form.mode === 'new' ? form.branch : undefined}
          initialTitle={form.mode === 'new' ? form.title : undefined}
          currentMonth={p.currentMonth} months={p.months}
          onClose={closeForm} onSaved={onSaved}
        />
      )}
    </main>
  )
}
