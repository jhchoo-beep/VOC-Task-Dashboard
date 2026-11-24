'use client'
// 수행과제 2.0 가운데 칸 — 고른 과제 하나(key=과제 id)의 문제 정의, 해결 방안, 관련 리뷰, 진행 사항(글·사진·링크)과 입력창.
// 진행 사항 목록과 입력 중인 글은 부모(TasksConsole)가 과제 id 별로 들고 있고, 여기는 그리기와 저장만 한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { compressImage } from '@/lib/imageCompress'
import { driveThumbUrl, driveViewUrl } from '@/lib/driveUrl'
import { formatMonth } from '@/lib/utils'
import {
  LOG_KINDS, categoriesOf, editorKey, linkLogContent, logContent, logLines, parseLog,
  type LogKind, type Task, type TaskLog,
} from '@/lib/v2/tasks'
import { SevPill, StatusPill, stamp } from './bits'
import type { LogsState } from './TasksConsole'

export interface Draft {
  comment: string
  kind: LogKind
  photos: File[]
  linkOpen: boolean
  linkUrl: string
  linkLabel: string
}
export const EMPTY_DRAFT: Draft = { comment: '', kind: '업데이트', photos: [], linkOpen: false, linkUrl: '', linkLabel: '' }
const MAX_PHOTOS = 5

interface Props {
  task: Task
  logs: TaskLog[] | undefined
  logsState: LogsState
  draft: Draft
  onDraft: (patch: Partial<Draft>) => void
  author: string
  onAuthor: (v: string) => void
  onReload: () => Promise<void>
  embed: boolean
}

export default function TaskDetail({ task, logs, logsState, draft, onDraft, author, onAuthor, onReload, embed }: Props) {
  const cats = categoriesOf(task)
  return (
    <>
      <div className="detail-meta">
        <SevPill severity={task.severity} />
        <span>{task.branch}{task.task_month ? ` · ${formatMonth(task.task_month)}` : ''}</span>
        {cats.map(c => <span key={c} className="pill">{c}</span>)}
        <span className="r"><StatusPill status={task.status} /></span>
      </div>
      <h2 className="h2">{task.title}</h2>

      {task.problem_definition && (
        <section className="tk-sec">
          <div className="sec-k">문제 정의</div>
          <div className="tk-text">{task.problem_definition}</div>
        </section>
      )}
      {task.solution && (
        <section className="tk-sec">
          <div className="sec-k">해결 방안</div>
          <div className="tk-text">{task.solution}</div>
        </section>
      )}
      {task.review_content && (
        <section className="tk-sec">
          <div className="sec-k">관련 리뷰</div>
          <div className="boxed"><div className="rv"><div className="rv-text">{task.review_content}</div></div></div>
        </section>
      )}

      <section className="tk-sec">
        <div className="sec-k">진행 사항{logs ? <> <span className="num">{logs.length}</span>건 · 최근 순</> : null}</div>
        {!embed && <Composer task={task} draft={draft} onDraft={onDraft} author={author} onAuthor={onAuthor} onReload={onReload} />}
        {logsState === 'error' && !logs && <div className="tk-note">진행 사항을 읽지 못했습니다.</div>}
        {logsState === 'loading' && !logs && <div className="tk-note">진행 사항을 읽는 중</div>}
        {logs && logs.length === 0 && <div className="tk-note">진행 사항 없음</div>}
        {logs && logs.length > 0 && (
          <div className="boxed tk-logs">
            {logs.map(l => <LogItem key={l.id} log={l} embed={embed} onDeleted={onReload} />)}
          </div>
        )}
      </section>
    </>
  )
}

/* 진행 사항 한 건 */
function LogItem({ log, embed, onDeleted }: { log: TaskLog; embed: boolean; onDeleted: () => Promise<void> }) {
  const p = parseLog(log.content)
  const photos = Array.isArray(log.attachments) ? log.attachments : []
  const del = async () => {
    if (!confirm('이 진행 사항을 삭제할까요?')) return
    const res = await fetch('/api/tasks/logs/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: log.id }) })
    if (!res.ok) { alert('진행 사항을 삭제하지 못했습니다. 다시 시도해 주세요.'); return }
    await onDeleted()
  }
  return (
    <div className={`rv tk-log k-${p.kind}`}>
      <div className="rv-meta">
        {p.kind !== '업데이트' && <span className={`pill ${p.kind === '이슈' ? 'warn' : p.kind === '해결' ? 'ok' : 'know'}`}>{p.kind}</span>}
        <span className="tk-author">{log.author || '작성자 없음'}</span>
        <span className="num">{stamp(log.created_at)}</span>
        {!embed && <button type="button" className="tk-x" aria-label="진행 사항 삭제" title="삭제" onClick={del}>×</button>}
      </div>
      {p.kind === '링크'
        ? <a className="lnk" href={p.href} target="_blank" rel="noopener noreferrer">{p.label} ↗</a>
        : <LogBody text={p.body} />}
      {photos.length > 0 && (
        <div className="tk-photos">
          {photos.map(a => (
            <a key={a.fileId} href={driveViewUrl(a.fileId)} target="_blank" rel="noopener noreferrer" className="tk-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={driveThumbUrl(a.fileId, 400)} alt={a.name} loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* 줄바꿈 보존 + '- '·'* '·'•' 글머리표 + 공백 2칸당 1단계 들여쓰기 */
function LogBody({ text }: { text: string }) {
  return (
    <div className="tk-body">
      {logLines(text).map((l, i) => l.blank
        ? <div key={i} style={{ height: 6 }} />
        : l.bullet
          ? <div key={i} className="tk-bl" style={{ paddingLeft: l.level * 16 }}><span aria-hidden="true">•</span><span>{l.text}</span></div>
          : <div key={i} style={{ paddingLeft: l.level * 16 }}>{l.text}</div>)}
    </div>
  )
}

/* 진행 사항 입력: 종류(업데이트·이슈·해결), 작성자, 여러 줄 글, 사진(1장씩 압축 후 업로드), 링크 */
function Composer({ task, draft, onDraft, author, onAuthor, onReload }: Pick<Props, 'task' | 'draft' | 'onDraft' | 'author' | 'onAuthor' | 'onReload'>) {
  const [busy, setBusy] = useState<null | 'log' | 'link'>(null)
  const [progress, setProgress] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 여러 줄이 늘면 높이를 키운다(최대 220px). 글머리 자동 이어가기 같은 코드 변경에도 반응
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }, [draft.comment])

  const addLog = async () => {
    const text = draft.comment.trim()
    if (!text || busy) return
    setBusy('log')
    try {
      // 사진은 업로드 전 브라우저에서 압축하고 1장씩 따로 보낸다(묶으면 Vercel 본문 한도 4.5MB 를 넘어 413)
      const attachments: { fileId: string; name: string }[] = []
      for (let i = 0; i < draft.photos.length; i++) {
        setProgress(`사진 ${i + 1}/${draft.photos.length}`)
        const fd = new FormData()
        fd.append('files', await compressImage(draft.photos[i]))
        const up = await fetch('/api/tasks/logs/upload', { method: 'POST', body: fd })
        if (!up.ok) {
          const err = await up.json().catch(() => ({}))
          alert(`${i + 1}번째 사진 업로드에 실패했습니다${err.error ? ` (${err.error})` : ''}. 다시 시도해 주세요.`)
          return // 글과 사진을 남겨 다시 시도할 수 있게
        }
        attachments.push(...((await up.json()).attachments ?? []))
      }
      setProgress('')
      const res = await fetch('/api/tasks/logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content: logContent(draft.kind, text), author: author.trim() || undefined, attachments }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? '진행 사항 저장에 실패했습니다. 다시 시도해 주세요.')
        return
      }
      onDraft({ comment: '', photos: [] })
      await onReload()
    } finally {
      setBusy(null)
      setProgress('')
    }
  }

  const addLink = async () => {
    if (!draft.linkUrl.trim() || busy) return
    setBusy('link')
    try {
      const res = await fetch('/api/tasks/logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content: linkLogContent(draft.linkUrl, draft.linkLabel), author: author.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? '링크 저장에 실패했습니다. 다시 시도해 주세요.')
        return
      }
      onDraft({ linkUrl: '', linkLabel: '', linkOpen: false })
      await onReload()
    } finally { setBusy(null) }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrl = e.ctrlKey || e.metaKey
    // 한글 조합 중에는 Ctrl+Enter 만 받고 나머지는 브라우저에 맡긴다(조합 중 Enter 가 두 번 처리되는 것 방지)
    if (e.nativeEvent.isComposing && !(ctrl && e.key === 'Enter')) return
    const ta = e.currentTarget
    const r = editorKey(ta.value, ta.selectionStart, ta.selectionEnd, e.key, { shift: e.shiftKey, ctrl })
    if (!r) return
    e.preventDefault()
    if (r.kind === 'submit') { addLog(); return }
    onDraft({ comment: r.value })
    requestAnimationFrame(() => { const el = taRef.current; if (el) { el.selectionStart = r.start; el.selectionEnd = r.end } })
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    onDraft({ photos: [...draft.photos, ...picked].slice(0, MAX_PHOTOS) })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="tk-comp">
      <div className="tk-comp-top">
        <div className="segs" role="group" aria-label="진행 사항 종류">
          {LOG_KINDS.map(k => (
            <button key={k} type="button" className={`seg${draft.kind === k ? ' on' : ''}${k === '이슈' ? ' k-issue' : k === '해결' ? ' k-done' : ''}`}
              aria-pressed={draft.kind === k} onClick={() => onDraft({ kind: k })}>{k}</button>
          ))}
        </div>
        <input className="tk-in tk-author-in" aria-label="작성자" placeholder="작성자" value={author} onChange={e => onAuthor(e.target.value)} />
      </div>
      <textarea ref={taRef} className="tk-in tk-ta" rows={2} aria-label="진행 사항"
        placeholder="진행 사항 ( - 글머리표 · Tab 들여쓰기 · Ctrl+Enter 추가 )"
        value={draft.comment} onChange={e => onDraft({ comment: e.target.value })} onKeyDown={onKey} />

      {draft.photos.length > 0 && <PhotoPreviews files={draft.photos} onRemove={i => onDraft({ photos: draft.photos.filter((_, j) => j !== i) })} />}

      {draft.linkOpen && (
        <div className="tk-linkbox">
          <input className="tk-in" aria-label="링크 제목" placeholder="링크 제목 (선택)" value={draft.linkLabel} onChange={e => onDraft({ linkLabel: e.target.value })} />
          <input className="tk-in" aria-label="링크 주소" placeholder="https://..." value={draft.linkUrl}
            onChange={e => onDraft({ linkUrl: e.target.value })} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addLink() }} />
          <div className="tk-row-acts">
            <button type="button" className="act" onClick={() => onDraft({ linkOpen: false, linkUrl: '', linkLabel: '' })}>취소</button>
            <button type="button" className="act pri" disabled={!!busy || !draft.linkUrl.trim()} onClick={addLink}>{busy === 'link' ? '저장 중' : '링크 첨부'}</button>
          </div>
        </div>
      )}

      <div className="tk-comp-foot">
        <button type="button" className={`act${draft.linkOpen ? ' on' : ''}`} onClick={() => onDraft({ linkOpen: !draft.linkOpen })}>링크</button>
        <button type="button" className="act" disabled={draft.photos.length >= MAX_PHOTOS} onClick={() => fileRef.current?.click()}>
          사진 <span className="num">{draft.photos.length}/{MAX_PHOTOS}</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} hidden />
        {progress && <span className="tk-note inline">{progress}</span>}
        <button type="button" className="act pri tk-push" disabled={!!busy || !draft.comment.trim()} onClick={addLog}>
          {busy === 'log' ? '저장 중' : '추가'}
        </button>
      </div>
    </div>
  )
}

function PhotoPreviews({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls])
  return (
    <div className="tk-photos">
      {urls.map((u, i) => (
        <span key={u} className="tk-photo sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={files[i]?.name ?? ''} />
          <button type="button" className="tk-photo-x" aria-label="사진 빼기" onClick={() => onRemove(i)}>×</button>
        </span>
      ))}
    </div>
  )
}
