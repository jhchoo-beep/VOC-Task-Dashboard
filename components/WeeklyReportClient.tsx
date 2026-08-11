'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import {
  ESTIMATOR_LABEL, BRANCH_ORDER, discussionRows,
  type WeeklyReport, type WeeklyChannelRow, type ChannelBoardRow,
} from '@/lib/weeklyReport'
import { bandsFor } from '@/lib/otaDetail'
import { belowReviewCounts, type ChannelReviews, type WeeklyReviewItem } from '@/lib/weeklyReviews'
import type { WeeklyTaskRow } from '@/lib/weeklyTasks'
import {
  TRIAGE_VERDICTS, summarizeTriage, triageableIds,
  type TriageRow, type TriageVerdict,
} from '@/lib/weeklyTriage'
import WeeklyTaskSection from './WeeklyTaskSection'

// FO Weekly 회의 중 노션 임베드로 화면 공유하며 읽는 보고서다. 설계 정본은
// docs/superpowers/specs/2026-07-24-weekly-report-quality-design.md.
//
//   · 흐름은 점수 보드 → 논의 → 주간 수행과제 한 컬럼이다.
//   · 논의에 서는 것은 '목표(9.0)에 못 미친 리뷰가 난 채널'이다 — 주 평균이 목표를
//     넘겼어도 그 안에 미달 리뷰가 섞여 있으면 카드가 선다(2026-08-11 재헌 결정).
//   · 접힌 카드의 숫자는 셋뿐이다: 주 평균, 리뷰 수, 미달 건수. 나머지는 펼침 안으로.
//   · 지점 순서는 고정한다. 격차 순으로 정렬하면 매주 자리가 바뀌어 회의에서 찾게 된다.
//   · 타이포는 프로젝터 기준이다. 11~13px은 회의실 화면에서 읽히지 않는다.

const BRANCH_COLOR: Record<string, string> = {
  신설: 'var(--sinseol)', 동대문: 'var(--ddm)', 제주시티: 'var(--jeju)', 고성: 'var(--goseong)',
}
const branchColor = (b: string) => BRANCH_COLOR[b] ?? 'var(--text-3)'

const fmt = (n: number) => n.toFixed(1)
const trim = (n: number) => String(Number(n.toFixed(2)))
const signed = (n: number) => (n > 0 ? '+' : '') + trim(n)

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, color: 'var(--text-3)', border: '1px solid var(--text-3)', borderRadius: 10,
      padding: '2px 8px', whiteSpace: 'nowrap', opacity: 0.9,
    }}>{children}</span>
  )
}

/** 리뷰 한 건의 색은 그 채널 목표를 넘겼는지로 정한다(척도 환산 없음). */
function ratingColor(r: number | null, target: number) {
  if (r == null) return 'var(--text-3)'
  if (r >= target) return 'var(--done)'
  if (r >= target * 0.78) return 'var(--medium)'   // 10점제 7.0 · 5점제 3.5 언저리
  if (r >= target * 0.56) return 'var(--high)'     // 10점제 5.0 · 5점제 2.5 언저리
  return 'var(--critical)'
}

// ─── 판단(조치/이월/종결) ─────────────────────────────────────────────────────
// 🔴 판단은 FO가 회의 전에 붙이는 입력이다. 앱은 어떤 판단도 제안하지 않는다(07-27과 같은 선).
//    회의는 요약 한 줄("조치 3 · 이월 5 · 종결 8 · 대기 0")과 조치 건만 소비한다 —
//    미달 리뷰 원문을 그 자리에서 전부 읽는 독서 모임을 없애는 층이다(2026-08-11 재헌).

const VERDICT_COLOR: Record<TriageVerdict, string> = {
  조치: 'var(--progress)',
  이월: 'var(--medium)',
  종결: 'var(--text-3)',
}

interface TriageHandlers {
  set: (item: WeeklyReviewItem, verdict: TriageVerdict, note: string | null) => void
  clear: (id: string) => void
}

// 한 리뷰의 판단 컨트롤. 편집 모드(회의 전 FO)는 토글 3개 + 사유 입력,
// 읽기 모드(임베드=회의 화면)는 판단 배지 + 사유만 보인다.
function TriageControl({ item, row, canEdit, on }: {
  item: WeeklyReviewItem
  row: TriageRow | undefined
  canEdit: boolean
  on: TriageHandlers
}) {
  if (!canEdit) {
    if (!row) return null
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <span style={{
          fontSize: 11, fontWeight: 800, color: '#fff',
          background: VERDICT_COLOR[row.verdict], borderRadius: 10, padding: '2px 9px',
          whiteSpace: 'nowrap',
        }}>{row.verdict}</span>
        {row.note && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{row.note}</span>}
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
      {TRIAGE_VERDICTS.map(v => {
        const active = row?.verdict === v
        return (
          <button
            key={v}
            // 켜진 판단을 다시 누르면 해제 — 실수를 되돌리는 경로가 있어야 누르는 데 주저가 없다.
            onClick={() => (active ? on.clear(item.id) : on.set(item, v, row?.note ?? null))}
            style={{
              // 켜진 버튼은 통째로 칠한다 — 외곽선·글자색만 바꾸면 눌렀는지가 안 읽힌다(2026-08-11 재헌).
              fontSize: 11, fontWeight: active ? 800 : 400, padding: '3px 10px', borderRadius: 10,
              border: `1px solid ${active ? VERDICT_COLOR[v] : 'var(--border)'}`,
              color: active ? '#fff' : 'var(--text-3)',
              background: active ? VERDICT_COLOR[v] : 'transparent',
              fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >{v}</button>
        )
      })}
    </span>
  )
}

// ─── 리뷰 원문 ────────────────────────────────────────────────────────────────
// 목표 미달 리뷰만 나온다(필터는 lib/weeklyReviews.ts). 카드가 '미달 4건'이라 써 놓고
// 펼치면 10.0짜리 호평이 함께 뜨던 문제를 없앤 것이다.
function ReviewList({ cr, triage, embed, on }: {
  cr: ChannelReviews | undefined
  triage: Record<string, TriageRow>
  embed: boolean
  on: TriageHandlers
}) {
  // 확보한 원문 총수 = 보여 주는 것 + 목표 이상이라 뺀 것. 커버리지 경고의 분자다 —
  // items.length 를 쓰면 3건을 다 확보하고도 '원문 확보 1/3건'이 뜬다.
  const secured = cr ? cr.items.length + cr.hiddenCount : 0
  const baseTxt = cr ? `목표 ${fmt(cr.target)}` : '목표'

  if (!cr || secured === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
        원문을 찾지 못했습니다 — 수집 커버리지 밖의 리뷰입니다
      </div>
    )
  }

  // 원문은 확보했는데 전부 목표 이상인 상태. 위 문구와 합치면 '수집이 안 됐다'와
  // '나쁜 리뷰만 수집에서 빠졌다'가 구분되지 않는다 — 후자는 수집 쪽 결함 신호다.
  if (cr.items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--medium)', marginTop: 8, lineHeight: 1.7 }}>
        확보한 원문 {secured}건이 모두 {baseTxt} 이상입니다 — 점수를 끌어내린 리뷰는 수집 범위 밖입니다
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
        리뷰 원문 · {baseTxt} 미달 {cr.items.length}건
        {/* 조용히 적게 보여주지 않는다 — 아고다는 raw 커버리지가 31% 수준이다 */}
        {secured < cr.expectedCount && (
          <span style={{ color: 'var(--medium)' }}> (원문 확보 {secured}/{cr.expectedCount}건)</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cr.items.map(it => {
          const row = triage[it.id]
          return (
            <div key={it.id} style={{
              border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
              background: 'var(--bg-input)',
              // 편집 모드에서 판단이 붙은 리뷰는 살짝 가라앉힌다 — 회의 전 훑기에서
              // '대기'가 도드라져야 한다. 회의 화면(임베드)에서는 가라앉히지 않는다.
              opacity: !embed && row ? 0.75 : 1,
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span className="font-display" style={{ fontSize: 15, fontWeight: 800, color: ratingColor(it.rating, cr.target) }}>
                  {it.rating == null ? '—' : fmt(it.rating)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {[it.country, it.date, it.roomType].filter(Boolean).join(' · ') || '정보 없음'}
                </span>
                {!it.translated && <Chip>원문(번역 없음)</Chip>}
                <TriageControl item={it} row={row} canEdit={!embed} on={on} />
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
                {it.body || '(본문 없음)'}
              </div>
              {/* 사유는 판단이 있을 때만. 종결이 특히 이 한 줄을 남겨야 한다 —
                  회의에서 "이거 왜 종결이에요?"에 원문을 다시 읽지 않고 답하는 자리다. */}
              {!embed && row && (
                <input
                  defaultValue={row.note ?? ''}
                  placeholder="한 줄 사유 (선택)"
                  onBlur={e => {
                    const v = e.target.value.trim()
                    if (v !== (row.note ?? '')) on.set(it, row.verdict, v || null)
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  style={{
                    marginTop: 8, width: '100%', fontSize: 12, padding: '5px 9px',
                    border: '1px solid var(--border)', borderRadius: 6,
                    background: 'var(--bg-card)', color: 'var(--text-1)', fontFamily: 'inherit',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* 숨긴 사실을 남긴다 — 없으면 남은 목록이 '그 주 전부'로 읽힌다 */}
      {cr.hiddenCount > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
          {baseTxt} 이상 {cr.hiddenCount}건은 표시하지 않았습니다
        </div>
      )}
    </div>
  )
}

// ─── 논의 카드 ────────────────────────────────────────────────────────────────
// 🔴 카드는 원인을 쓰지 않는다(2026-07-27 재헌 결정). 말하는 것은 '목표보다 낮은
//    리뷰가 났다'까지이고, 왜 그랬는지는 펼침의 리뷰 원문을 사람이 읽어 판단한다.
//    이전에는 ota_complaints.headline → memo → bad 키워드로 폴백해 결론 한 줄을 지어냈는데,
//    그 폴백이 밴드를 보지 않아 기준선을 밀어올린 9.5점 리뷰의 팁이 미달 원인 자리에 앉았다.
//
// 카드가 서는 경로가 둘이라 왼쪽 띠 색으로 구분한다 —
//   빨강  주 평균 자체가 목표 미달
//   주황  주 평균은 목표를 넘겼지만 미달 리뷰가 섞임(이 경우가 이번 개편의 신규분이다)
function DiscussionCard({ r, cr, triage, embed, on }: {
  r: WeeklyChannelRow
  cr: ChannelReviews | undefined
  triage: Record<string, TriageRow>
  embed: boolean
  on: TriageHandlers
}) {
  const [open, setOpen] = useState(false)
  const unit = r.granularity === 'month' ? '직전 달' : '직전 주'
  const belowN = cr?.items.length ?? 0
  const avgBelow = r.verdict === 'below'

  // 접힌 채로도 판단 상태가 읽혀야 한다 — 펼쳐야 아는 요약은 요약이 아니다.
  const sum = cr ? summarizeTriage(cr.items.map(i => i.id), triage) : null

  return (
    <div className="card" style={{
      padding: '14px 20px', marginBottom: 10,
      borderLeft: `3px solid ${avgBelow ? 'var(--critical)' : 'var(--medium)'}`,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: branchColor(r.branch) }} />
          {r.branch} {r.otaName}
          {r.granularity === 'month' && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
              ({r.weekStart.substring(0, 7)} 월 단위)
            </span>
          )}
        </span>
        {/* 수치와 버튼을 한 줄에 둔다 — 원인 한 줄이 빠진 뒤 버튼만 남은 둘째 줄은 여백일 뿐이다 */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            평균{' '}
            <b style={{ color: avgBelow ? 'var(--critical)' : 'var(--done)', fontWeight: 700 }}>{fmt(r.weekAvg)}</b>
            {' · '}{r.reviewCount}건
          </span>
          {belowN > 0 ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>미달</span>
              <span className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--critical)', lineHeight: 1 }}>
                {belowN}건
              </span>
            </span>
          ) : (
            // 평균은 미달인데 미달 리뷰 원문이 0건 = 원문을 확보하지 못한 채널이다.
            // 숫자 자리를 0으로 채우면 '미달 리뷰가 없다'로 읽힌다.
            <Chip>원문 미확보</Chip>
          )}
          {/* 판단 내역을 접힌 채로 상시 노출 — 카드를 열어야 아는 요약은 요약이 아니다
              (2026-08-11 재헌: "일일이 카드를 열어서 확인해야 한다"). 0건 칩은 가라앉히고
              건수 있는 칩은 채워서, 훑기만 해도 카드별 판단 분포가 읽히게 한다. */}
          {sum && belowN > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {TRIAGE_VERDICTS.map(v => (
                <span key={v} style={{
                  fontSize: 11, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap',
                  fontWeight: sum[v] > 0 ? 800 : 400,
                  color: sum[v] > 0 ? '#fff' : 'var(--text-3)',
                  background: sum[v] > 0 ? VERDICT_COLOR[v] : 'transparent',
                  border: `1px solid ${sum[v] > 0 ? VERDICT_COLOR[v] : 'var(--border)'}`,
                  opacity: sum[v] > 0 ? 1 : 0.55,
                }}>{v} {sum[v]}</span>
              ))}
              {sum.대기 > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 800, borderRadius: 10, padding: '2px 8px',
                  whiteSpace: 'nowrap', color: '#fff', background: 'var(--critical)',
                  border: '1px solid var(--critical)',
                }}>대기 {sum.대기}</span>
              )}
            </span>
          )}
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12,
              fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {open ? '리뷰 닫기' : '리뷰 보기'}
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8 }}>
            {r.wow == null ? `${unit} 데이터 없음` : (
              <>
                {unit} 대비{' '}
                <span style={{ color: r.wow > 0 ? 'var(--done)' : r.wow < 0 ? 'var(--critical)' : 'var(--text-3)', fontWeight: 700 }}>
                  {signed(r.wow)}
                </span>
                {r.prevWeekAvg != null && ` (${fmt(r.prevWeekAvg)} · ${r.prevReviewCount ?? 0}건)`}
              </>
            )}
            {' · '}{ESTIMATOR_LABEL[r.estimator]}
          </div>

          <ReviewList cr={cr} triage={triage} embed={embed} on={on} />
        </div>
      )}
    </div>
  )
}

// ─── 점수 보드 ────────────────────────────────────────────────────────────────
// 첫 화면은 이 보드다(2026-08-04 FO Weekly 재헌 지시). 이전에는 기준 점수가 우측 보조
// 패널이었고 '이번 주에 몇 점짜리 리뷰가 몇 건 왔는가'는 상세 탭 분포도까지 들어가야
// 보였다 — 회의가 리포트↔점수 현황↔분포도를 오가며 끊겼다. 보드가 지점×채널마다
// '이번 주 평균 + 수집 점수 밴드 + 미달 건수'를 한 벌로 편다.
//
// 값은 카드와 같은 산출이다(lib/weeklyReport.ts). 여기서 다시 계산하지 말 것.
const OTA_ORDER = ['Agoda', 'Booking', 'Trip.com', 'Expedia', 'Airbnb', 'NOL', '여기어때']
const otaRank = (n: string) => {
  const i = OTA_ORDER.indexOf(n)
  return i === -1 ? OTA_ORDER.length : i
}
const brRank = (b: string) => {
  const i = BRANCH_ORDER.indexOf(b)
  return i === -1 ? BRANCH_ORDER.length : i
}

// 밴드 칩은 밴드 '전체'가 목표 아래일 때만 붉게 칠한다. 밴드는 폭이 1점이라
// (8점대 = 8.0~8.9) 목표가 밴드 안에 걸리면 그 칩의 리뷰가 미달인지 단정할 수 없다 —
// 목표 9.0은 10점제에서 밴드 경계와 맞아떨어지지만, 5점제 4.5는 4점대 밴드를 가른다.
function bandWhollyBelow(band: number, scoreMax: number, target: number): boolean {
  const top = band === scoreMax ? scoreMax : band + 0.99
  return top < target
}

function BandChips({ r }: { r: WeeklyChannelRow }) {
  const labels = bandsFor(r.scoreMax)
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
      {r.bands.map(b => {
        const below = bandWhollyBelow(b.band, r.scoreMax, r.target)
        return (
          <span key={b.band} style={{
            fontSize: 12, padding: '1px 7px', borderRadius: 6, whiteSpace: 'nowrap',
            border: `1px solid ${below ? 'var(--critical)' : 'var(--border-2)'}`,
            color: below ? 'var(--critical)' : 'var(--text-2)',
            fontWeight: below ? 700 : 400,
          }}>
            {labels[b.band - 1]}{b.count > 1 && ` ×${b.count}`}
          </span>
        )
      })}
    </span>
  )
}

function BoardRow({ base, row, belowN }: { base: ChannelBoardRow; row: WeeklyChannelRow | undefined; belowN: number }) {
  const below = row?.verdict === 'below'
  const avgColor = row == null ? 'var(--text-3)' : below ? 'var(--critical)' : 'var(--done)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 8,
      background: below ? 'color-mix(in srgb, var(--critical) 8%, transparent)' : 'transparent',
      boxShadow: below ? 'inset 3px 0 0 var(--critical)' : 'none',
      opacity: row == null ? 0.55 : 1,
    }}>
      <span style={{ fontSize: 13, fontWeight: below ? 700 : 500, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
        {base.otaName}
        {row?.granularity === 'month' && (
          <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}> 월</span>
        )}
      </span>

      <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
        <span className="font-display" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: avgColor }}>
          {row == null ? '—' : fmt(row.weekAvg)}
        </span>
        {row != null && (
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {row.reviewCount}건
            {belowN > 0 && (
              <span style={{ color: 'var(--critical)', fontWeight: 700 }}> · 미달 {belowN}</span>
            )}
          </span>
        )}
      </span>

      <span style={{ marginLeft: 'auto', minWidth: 0 }}>
        {row != null && <BandChips r={row} />}
      </span>
    </div>
  )
}

function ScoreBoard({ report, belowCounts }: { report: WeeklyReport; belowCounts: Record<number, number> }) {
  const { board } = report
  if (board.length === 0) return null

  // 판정·평균·밴드는 리포트 본체가 이미 채널별로 갖고 있다 — propertyId 로 잇기만 한다.
  const rowByProp = new Map<number, WeeklyChannelRow>(
    [...report.below, ...report.onOrAbove, ...report.monthly].map(r => [r.propertyId, r]),
  )

  const branches = [...new Set(board.map(b => b.branch))].sort((a, b) => brRank(a) - brRank(b))

  // 목표는 채널 척도로 갈린다(10점제 9.0 · 5점제 4.5). 하나로 뭉뚱그리면 화면이 거짓을 말한다.
  const targetsOf = (max: number) =>
    [...new Set(board.filter(b => b.scoreMax === max).map(b => b.target))].sort((a, b) => a - b)
  const targetTxt = [
    targetsOf(10).map(t => `기준 ${fmt(t)}`).join('·'),
    targetsOf(5).map(t => `5점 만점 채널 ${fmt(t)}`).join('·'),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>이번 주 점수</b>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{targetTxt}</span>
      </div>

      <div className="score-board">
        {branches.map(br => {
          const rows = board
            .filter(b => b.branch === br)
            .sort((a, b) => otaRank(a.otaName) - otaRank(b.otaName))
          const belowTotal = rows.reduce((s, b) => s + (belowCounts[b.propertyId] ?? 0), 0)
          return (
            <div key={br} className="card" style={{ padding: '12px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: branchColor(br) }} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{br}</span>
                {belowTotal > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--critical)',
                    border: '1px solid var(--critical)', borderRadius: 10, padding: '1px 8px',
                  }}>미달 리뷰 {belowTotal}</span>
                )}
              </div>
              {rows.map(b => (
                <BoardRow
                  key={b.propertyId}
                  base={b}
                  row={rowByProp.get(b.propertyId)}
                  belowN={belowCounts[b.propertyId] ?? 0}
                />
              ))}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7, marginTop: 8 }}>
        에어비앤비·야놀자는 5점 만점 · — 는 이번 주 리뷰 0건
      </div>
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportClient({
  report, week, weeks, reviews, triage, weeklyTasks, basePath, extraQuery = '', embed = false,
}: {
  report: WeeklyReport | null
  week: string
  weeks: string[]
  reviews: Record<number, ChannelReviews>
  triage: Record<string, TriageRow>
  weeklyTasks: WeeklyTaskRow[]
  basePath: string
  extraQuery?: string   // 임베드의 ?key= 처럼 주 이동 시에도 유지해야 하는 쿼리
  embed?: boolean       // 임베드는 읽기 전용 — 쓰기 컨트롤을 아예 렌더하지 않는다
}) {
  const router = useRouter()
  const hrefFor = (w: string) => `${basePath}?week=${w}${extraQuery ? `&${extraQuery}` : ''}`

  // 판단의 낙관적 상태. 서버 값(triage) 위에 이 세션의 변경만 덮는다 — null=해제.
  // 주를 이동해도 남지만 해가 없다: 판단은 리뷰의 속성이라 리뷰가 같으면 값도 같아야 한다.
  const [overrides, setOverrides] = useState<Record<string, TriageRow | null>>({})
  const merged: Record<string, TriageRow> = { ...triage }
  for (const [id, row] of Object.entries(overrides)) {
    if (row) merged[id] = row
    else delete merged[id]
  }

  const triageOn: TriageHandlers = {
    set: async (item, verdict, note) => {
      // propertyId는 카드가 아니라 리뷰가 속한 채널에서 찾는다.
      const propertyId = Number(Object.keys(reviews).find(pid =>
        reviews[Number(pid)].items.some(i => i.id === item.id)) ?? 0)
      const prev = merged[item.id] ?? null
      const next: TriageRow = { review_id: item.id, week_start: week, property_id: propertyId, verdict, note }
      setOverrides(o => ({ ...o, [item.id]: next }))
      const res = await fetch('/api/review-triage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      // 낙관적으로 그려 놓고 실패를 삼키면 "판단했는데 저장 안 됨"이 된다 — 되돌린다.
      if (!res.ok) setOverrides(o => ({ ...o, [item.id]: prev }))
    },
    clear: async (id) => {
      const prev = merged[id] ?? null
      setOverrides(o => ({ ...o, [id]: null }))
      const res = await fetch(`/api/review-triage?review_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) setOverrides(o => ({ ...o, [id]: prev }))
    },
  }

  const idx = weeks.indexOf(week)
  const older = idx >= 0 && idx + 1 < weeks.length ? weeks[idx + 1] : null   // 목록은 최신 우선
  const newer = idx > 0 ? weeks[idx - 1] : null

  // 🔴 논의 대상 선정은 순수 함수 discussionRows 가 한다. 화면에서 조건을 다시 쓰면
  //    점수 보드의 '미달 N'과 카드 목록이 조용히 갈라진다.
  const belowCounts = belowReviewCounts(reviews)
  const cards = report ? discussionRows(report, belowCounts) : []
  const belowTotal = cards.reduce((s, r) => s + (belowCounts[r.propertyId] ?? 0), 0)
  // 🔴 분모는 summary.reviewTotal(주간 채널만)이 아니다. 미달 건수에는 월 단위 채널
  //    (에어비앤비·여기어때)의 미달 리뷰가 들어 있어, 주간만 세면 '미달 17 / 33'처럼
  //    분자에만 있고 분모에는 없는 리뷰가 생긴다. 보드가 덮는 범위와 같게 맞춘다.
  const reviewTotal = report
    ? [...report.below, ...report.onOrAbove, ...report.monthly].reduce((s, r) => s + r.reviewCount, 0)
    : 0

  const navBtn = (target: string | null, dir: 'prev' | 'next') => {
    const style: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
      borderRadius: 8, border: '1px solid var(--border)', fontSize: 12,
      color: target ? 'var(--text-2)' : 'var(--text-3)',
      background: 'var(--bg-card)', textDecoration: 'none',
      opacity: target ? 1 : 0.4, pointerEvents: target ? 'auto' : 'none',
    }
    const body = dir === 'prev'
      ? <><ChevronLeft size={13} /> 이전 주</>
      : <>다음 주 <ChevronRight size={13} /></>
    return target
      ? <Link href={hrefFor(target)} style={style}>{body}</Link>
      : <span style={style}>{body}</span>
  }

  return (
    // 폭 상한을 두지 않는다 — 수행과제 등 다른 탭과 같이 우측 여백까지 쓴다(2026-08-11 재헌).
    // 이전의 maxWidth 900은 07-27 2컬럼(리포트+기준 패널) 설계의 잔재였고, 패널이
    // 점수 보드로 대체된 뒤에는 넓은 모니터에서 왼쪽에 몰려 보이는 원인일 뿐이었다.
    <div style={{ padding: '28px 32px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>주간 OTA 리포트</div>
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
            {report ? report.label : `${week || '—'} 주차`}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
            그 주에 달린 리뷰 중 목표 9.0에 못 미친 리뷰를 모두 논의에 올립니다
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {navBtn(older, 'prev')}
          <select
            value={week}
            onChange={e => router.push(hrefFor(e.target.value))}
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--bg-input)', color: 'var(--text-1)',
              border: '1px solid var(--border)', fontFamily: 'inherit',
            }}
          >
            {weeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          {navBtn(newer, 'next')}
        </div>
      </div>

      {!report ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
          이 주에는 분포 데이터가 없어 리포트를 낼 수 없습니다.
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            데이터가 없는 주를 최신 주로 바꿔치지 않습니다 — &apos;이번 주는 문제 없었다&apos;로 읽히기 때문입니다
          </div>
        </div>
      ) : (
        // 흐름은 점수 보드 → 논의 → 주간 수행과제 한 컬럼이다(2026-08-04 재헌 지시).
        // 보드에서 미달을 눈으로 잡고, 논의에서 원문을 읽고, 수행과제로 넘길지 정한다.
        <div style={{ minWidth: 0 }}>
          <ScoreBoard report={report} belowCounts={belowCounts} />

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 14, color: 'var(--text-2)' }}>
              <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>
                논의 {cards.length}건
              </b>
              <span style={{ color: 'var(--text-3)' }}>
                · 미달 리뷰 {belowTotal}건 / 전체 리뷰 {reviewTotal}건
              </span>
            </div>
            {/* FO 보고의 한 줄. 회의는 이 줄과 조치 건만 소비한다 — 원문 전수 낭독을 없애는 층.
                전 지점 합산이다(처음의 신설·동대문 제한은 2026-08-11 재헌 지시로 개방). */}
            {(() => {
              const ids = triageableIds(cards, reviews)
              if (ids.length === 0) return null
              const s = summarizeTriage(ids, merged)
              return (
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6 }}>
                  판단 —{' '}
                  {TRIAGE_VERDICTS.map(v => (
                    <span key={v} style={{ marginRight: 10 }}>
                      <span style={{ color: VERDICT_COLOR[v], fontWeight: 700 }}>{v} {s[v]}</span>
                    </span>
                  ))}
                  <span style={{ color: s.대기 > 0 ? 'var(--critical)' : 'var(--text-3)', fontWeight: s.대기 > 0 ? 700 : 400 }}>
                    대기 {s.대기}
                  </span>
                </div>
              )
            })()}
          </div>

          {cards.length === 0 ? (
            <div className="card" style={{ padding: '18px 20px', fontSize: 14, color: 'var(--text-2)' }}>
              이번 주 목표에 못 미친 리뷰가 없습니다.
            </div>
          ) : (
            // 🔴 key에 week를 포함해야 한다. propertyId만 쓰면 같은 채널이 주가 바뀌어도 같은
            //    인스턴스로 재사용돼 펼침 상태가 따라온다 — 회의에서 주를 넘기면 지난 주에 열어
            //    둔 카드가 펼쳐진 채로 시작해 '논의 카드 한 벌이 한 화면'이 깨진다.
            cards.map(r => (
              <DiscussionCard
                key={`${week}-${r.propertyId}`}
                r={r}
                cr={reviews[r.propertyId]}
                triage={merged}
                embed={embed}
                on={triageOn}
              />
            ))
          )}

          {/* key에 week를 줘야 한다 — 안 주면 주가 바뀌어도 리마운트되지 않아
              selected·openCandidates·copied 가 지난 주 값 그대로 남는다(DiscussionCard와 같은 이유). */}
          <WeeklyTaskSection
            key={week}
            week={week}
            cards={cards}
            reviews={reviews}
            tasks={weeklyTasks}
            embed={embed}
          />
        </div>
      )}
    </div>
  )
}
