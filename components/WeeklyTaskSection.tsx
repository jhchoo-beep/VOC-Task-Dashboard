'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  flattenCandidates, buildTaskPrompt, selectVisibleTasks, branchesOf,
  type CandidateReview, type WeeklyTaskRow,
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
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
