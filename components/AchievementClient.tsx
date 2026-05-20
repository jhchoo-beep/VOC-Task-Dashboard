'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMonth } from '@/lib/utils'
import { Trophy, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'

const BRANCH_BADGE: Record<string, string> = {
  '제주시티': 'badge-jeju', '제주': 'badge-jeju',
  '동대문': 'badge-ddm', '신설': 'badge-sinseol', '고성': 'badge-goseong',
}

function AchievementTaskCard({ task }: { task: any }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ background: 'var(--bg-hover)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
      {/* 카드 헤더 */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10 }}
      >
        <span style={{ color: 'var(--done)', marginTop: 1, flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>✓ {task.title}</span>
            {task.link_url && (
              <a href={task.link_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
                <ExternalLink size={11} />
              </a>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge ${BRANCH_BADGE[task.branch] ?? 'badge-low'}`} style={{ fontSize: 10 }}>{task.branch}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatMonth(task.task_month)}</span>
            {task.assignee && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {task.assignee}</span>}
          </div>
        </div>
      </button>

      {/* 확장 영역 */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
          {task.problem_definition && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>문제가 뭐야?</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{task.problem_definition}</div>
            </div>
          )}
          {task.solution && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>어떻게 해결했어?</div>
              <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.6, background: 'rgba(99,179,255,0.06)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(99,179,255,0.15)' }}>
                {task.solution}
              </div>
            </div>
          )}
          {task.done_memo && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--done)', marginBottom: 4 }}>완료 메모</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{task.done_memo}</div>
            </div>
          )}
          {(task.linked_review_ids ?? []).length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
              관련 리뷰 {task.linked_review_ids.length}건 연결됨
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TriggerGroupCard({ group }: { group: any }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* 그룹 헤더 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 20px', textAlign: 'left', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f472b6' }}>
              📌 {group.trigger}
            </span>
            <span style={{ padding: '2px 8px', background: 'rgba(0,229,102,0.12)', border: '1px solid rgba(0,229,102,0.25)', borderRadius: 12, fontSize: 11, color: 'var(--done)', fontWeight: 600 }}>
              완료 {group.tasks.length}건
            </span>
            {group.totalLinkedReviews > 0 && (
              <span style={{ padding: '2px 8px', background: 'rgba(99,179,255,0.1)', border: '1px solid rgba(99,179,255,0.2)', borderRadius: 12, fontSize: 11, color: 'var(--accent)' }}>
                관련 리뷰 {group.totalLinkedReviews}건
              </span>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              {group.branches.map((b: string) => (
                <span key={b} className={`badge ${BRANCH_BADGE[b] ?? 'badge-low'}`} style={{ fontSize: 10 }}>{b}</span>
              ))}
            </div>
          </div>
          <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {/* 과제 목록 */}
      {!collapsed && (
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {group.tasks.map((t: any) => (
            <AchievementTaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AchievementClient({
  tasks,
  triggerGroups,
  monthSummaryList,
  months,
  branches,
  selectedMonth,
  selectedBranch,
  stats,
}: any) {
  const router = useRouter()

  function updateFilter(newMonth?: string, newBranch?: string) {
    const m = newMonth ?? selectedMonth
    const b = newBranch ?? selectedBranch
    const params = new URLSearchParams()
    if (m && m !== 'all') params.set('month', m)
    if (b && b !== '전체') params.set('branch', b)
    router.push(`/achievement${params.toString() ? '?' + params.toString() : ''}`)
  }

  return (
    <div className="page-pad" style={{ padding: '32px 36px' }}>
      {/* 헤더 */}
      <div className="fade-up" style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Trophy size={20} color="var(--done)" />
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>성과 & 개선 이력</h1>
          </div>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            {selectedMonth === 'all' ? '전체 기간' : formatMonth(selectedMonth)} · {selectedBranch} · 완료된 수행과제 기록
          </div>
        </div>
        {/* 필터 */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={selectedMonth}
            onChange={e => updateFilter(e.target.value)}
            className="input"
            style={{ width: 'auto', padding: '7px 12px', fontSize: 13 }}
          >
            <option value="all">전체 기간</option>
            {months.map((m: string) => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
          <select
            value={selectedBranch}
            onChange={e => updateFilter(undefined, e.target.value)}
            className="input"
            style={{ width: 'auto', padding: '7px 12px', fontSize: 13 }}
          >
            <option value="전체">전체 지점</option>
            {branches.map((b: string) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 상단 통계 */}
      <div className="fade-up delay-1" style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: '누적 완료', value: stats.totalDone, unit: '건', color: 'var(--done)', bg: 'rgba(0,229,102,0.07)', border: 'rgba(0,229,102,0.2)' },
          { label: '해결된 트리거', value: stats.totalTriggers, unit: '종', color: '#f472b6', bg: 'rgba(244,114,182,0.07)', border: 'rgba(244,114,182,0.2)' },
          { label: '개선된 지점', value: stats.totalBranches, unit: '개', color: 'var(--accent)', bg: 'rgba(99,179,255,0.07)', border: 'rgba(99,179,255,0.2)' },
        ].map(item => (
          <div key={item.label} style={{ padding: '14px 20px', background: item.bg, border: `1px solid ${item.border}`, borderRadius: 10, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: item.color, lineHeight: 1 }}>
              {item.value}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>{item.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {stats.totalDone === 0 ? (
        <div className="card fade-up delay-2" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
          {selectedMonth === 'all' ? '완료된 수행과제가 없습니다.' : `${formatMonth(selectedMonth)}에 완료된 수행과제가 없습니다.`}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: monthSummaryList.length > 0 ? '1fr 260px' : '1fr', gap: 20, alignItems: 'start' }}>
          {/* 트리거별 개선 스토리 */}
          <div className="fade-up delay-2" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
              트리거별 개선 스토리
            </div>
            {triggerGroups.map((g: any) => (
              <TriggerGroupCard key={g.trigger} group={g} />
            ))}
          </div>

          {/* 월별 완료 현황 사이드바 */}
          {monthSummaryList.length > 0 && (
            <div className="fade-up delay-3">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                월별 완료 현황
              </div>
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {monthSummaryList.map((s: any) => (
                    <button
                      key={s.month}
                      onClick={() => updateFilter(s.month)}
                      style={{
                        background: selectedMonth === s.month ? 'var(--bg-card)' : 'none',
                        border: selectedMonth === s.month ? '1px solid var(--border)' : '1px solid transparent',
                        borderRadius: 6, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', width: '100%',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: selectedMonth === s.month ? 600 : 400 }}>
                          {formatMonth(s.month)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--done)', fontWeight: 600 }}>{s.count}건</span>
                      </div>
                      {s.triggerCount > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>트리거 {s.triggerCount}종 해결</div>
                      )}
                    </button>
                  ))}
                </div>
                {selectedMonth !== 'all' && (
                  <button
                    onClick={() => updateFilter('all')}
                    style={{ marginTop: 10, width: '100%', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)' }}
                  >
                    전체 기간 보기
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
