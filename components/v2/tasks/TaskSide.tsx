'use client'
// 수행과제 2.0 오른쪽 칸 — 상태, 기준, 과제 정보(담당·기한·지점·월·심각도·카테고리), 링크, 변심 트리거 링크, 원문 데이터, 수정·삭제.
import Link from 'next/link'
import { useState } from 'react'
import { formatMonth } from '@/lib/utils'
import { TASK_STATUSES, UNCLASSIFIED, categoriesOf, triggersOf, type Task } from '@/lib/v2/tasks'
import { SevPill, StatusPill } from './bits'

export interface TriggerLink { url: string; label: string | null }

interface Props {
  task: Task
  embed: boolean
  updating: boolean
  onStatus: (s: string) => void
  onEdit: () => void
  onDelete: () => void
  links: Record<string, TriggerLink>
  onSaveLink: (trigger: string, url: string, label: string) => Promise<boolean>
  onDeleteLink: (trigger: string) => Promise<boolean>
}

export default function TaskSide({ task, embed, updating, onStatus, onEdit, onDelete, links, onSaveLink, onDeleteLink }: Props) {
  const triggers = triggersOf(task)
  const cats = categoriesOf(task)
  const taskLink = task.link_url?.trim()
  // 임베드 밖(로그인 화면)으로 나가는 링크는 새 탭으로, 미리 받기 없이
  const out = embed ? { target: '_blank', rel: 'noopener noreferrer', prefetch: false } : {}
  const bq = task.branch ? `branch=${encodeURIComponent(task.branch)}&` : ''
  const mq = task.task_month ? `month=${task.task_month}` : ''

  return (
    <>
      <div>
        <div className="sec-k">상태</div>
        {embed
          ? <StatusPill status={task.status} />
          : (
            <div className="segs tk-st-segs" role="group" aria-label="상태 바꾸기">
              {TASK_STATUSES.map(s => (
                <button key={s} type="button" className={`seg${task.status === s ? ' on' : ''}`} aria-pressed={task.status === s}
                  disabled={updating} onClick={() => { if (s !== task.status) onStatus(s) }}>{s}</button>
              ))}
            </div>
          )}
        {updating && <div className="tk-note">저장 중</div>}
      </div>

      <div>
        <div className="sec-k">기준</div>
        <div className="std">
          <div className="t">3개월 재발 0건이면 완료</div>
          <div className="s">재발 1건이면 다시 열림</div>
        </div>
      </div>

      <div>
        <div className="sec-k">과제 정보</div>
        <dl className="tk-kv">
          <dt>담당</dt><dd>{task.assignee || <span className="dim">미정</span>}</dd>
          <dt>기한</dt><dd>{task.due_date ? <span className="num">{task.due_date}</span> : <span className="dim">없음</span>}</dd>
          <dt>지점</dt><dd>{task.branch || <span className="dim">없음</span>}</dd>
          <dt>월</dt><dd>{task.task_month ? formatMonth(task.task_month) : <span className="dim">없음</span>}</dd>
          <dt>심각도</dt><dd>{task.severity ? <SevPill severity={task.severity} /> : <span className="dim">없음</span>}</dd>
          <dt>카테고리</dt><dd>{cats.length ? cats.join(', ') : <span className="dim">없음</span>}</dd>
        </dl>
      </div>

      <div>
        <div className="sec-k">링크</div>
        {taskLink
          ? <a className="lnk tk-break" href={taskLink} target="_blank" rel="noopener noreferrer">{task.link_label?.trim() || taskLink} ↗</a>
          : <span className="dim tk-small">없음</span>}
      </div>

      <div>
        <div className="sec-k">변심 트리거</div>
        {triggers.length === 0 && <span className="dim tk-small">{UNCLASSIFIED}</span>}
        <div className="tk-trigs">
          {triggers.map(t => <TriggerItem key={t} trigger={t} link={links[t] ?? null} embed={embed} onSave={onSaveLink} onDelete={onDeleteLink} />)}
        </div>
      </div>

      <div>
        <div className="sec-k">원문 데이터</div>
        <div className="tk-outs">
          <Link className="lnk" href={`/v2/reviews?${bq}${mq}`} {...out}>리뷰 원문 ↗</Link>
          <Link className="lnk" href={`/v2/discomfort?${bq}${mq}`} {...out}>불편 지수 ↗</Link>
        </div>
      </div>

      {!embed && (
        <div className="tk-side-acts">
          <button type="button" className="act" onClick={onEdit}>수정</button>
          <button type="button" className="act tk-danger" onClick={onDelete}>삭제</button>
        </div>
      )}
    </>
  )
}

function TriggerItem({ trigger, link, embed, onSave, onDelete }: {
  trigger: string; link: TriggerLink | null; embed: boolean
  onSave: Props['onSaveLink']; onDelete: Props['onDeleteLink']
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const start = () => { setUrl(link?.url ?? ''); setLabel(link?.label ?? ''); setOpen(true) }
  const save = async () => {
    if (!url.trim()) return
    setBusy(true)
    const ok = await onSave(trigger, url.trim(), label.trim())
    setBusy(false)
    if (ok) setOpen(false)
  }
  const remove = async () => {
    setBusy(true)
    const ok = await onDelete(trigger)
    setBusy(false)
    if (ok) setOpen(false)
  }
  return (
    <div className="tk-trig">
      <div className="tk-trig-t">{trigger}</div>
      <div className="tk-trig-a">
        {link?.url
          ? <a className="lnk" href={link.url} target="_blank" rel="noopener noreferrer">{link.label || '참고'} ↗</a>
          : <span className="dim tk-small">링크 없음</span>}
        {!embed && !open && <button type="button" className="tk-mini" onClick={start}>{link?.url ? '링크 편집' : '링크 추가'}</button>}
      </div>
      {open && (
        <div className="tk-linkbox">
          <input className="tk-in" aria-label="트리거 링크 제목" placeholder="링크 제목 (선택)" value={label} onChange={e => setLabel(e.target.value)} />
          <input className="tk-in" aria-label="트리거 링크 주소" placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} />
          <div className="tk-row-acts">
            {link?.url && <button type="button" className="act tk-danger" disabled={busy} onClick={remove}>삭제</button>}
            <button type="button" className="act" onClick={() => setOpen(false)}>취소</button>
            <button type="button" className="act pri" disabled={busy || !url.trim()} onClick={save}>{busy ? '저장 중' : '저장'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
