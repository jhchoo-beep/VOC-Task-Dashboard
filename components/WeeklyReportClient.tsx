'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { ESTIMATOR_LABEL, BRANCH_ORDER, type WeeklyReport, type WeeklyChannelRow, type BaselineRow } from '@/lib/weeklyReport'
import { bandsFor } from '@/lib/otaDetail'
import type { ChannelReviews } from '@/lib/weeklyReviews'
import type { WeeklyTaskRow } from '@/lib/weeklyTasks'
import WeeklyTaskSection from './WeeklyTaskSection'

// FO Weekly 회의 중 노션 임베드로 화면 공유하며 읽는 보고서다. 설계 정본은
// docs/superpowers/specs/2026-07-24-weekly-report-quality-design.md.
//
//   · 논의 카드 아래에는 주간 수행과제 섹션이 온다. 리포트가 관측에서 끝나지 않게 하는 층이다.
//     (2026-07-28에 '통과·월단위·리뷰0건' 접힌 참고를 걷어내고 그 자리를 내줬다 — 안 읽혔다.)
//   · 접힌 카드의 숫자는 셋뿐이다: 누적 → 그 주, 건수. 나머지는 펼침 안으로.
//   · 지점 순서는 고정한다. 격차 순으로 정렬하면 매주 자리가 바뀌어 회의에서 찾게 된다.
//   · 타이포는 프로젝터 기준이다. 11~13px은 회의실 화면에서 읽히지 않는다.

const BRANCH_COLOR: Record<string, string> = {
  신설: 'var(--sinseol)', 동대문: 'var(--ddm)', 제주시티: 'var(--jeju)', 고성: 'var(--goseong)',
}
const branchColor = (b: string) => BRANCH_COLOR[b] ?? 'var(--text-3)'

const fmt = (n: number) => n.toFixed(1)
const trim = (n: number) => String(Number(n.toFixed(2)))
const signed = (n: number) => (n > 0 ? '+' : '') + trim(n)

/** 지점 고정 순 → 지점 안에서 격차 큰(음수 큰) 순. */
function orderForMeeting(rows: WeeklyChannelRow[]): WeeklyChannelRow[] {
  const rank = (b: string) => {
    const i = BRANCH_ORDER.indexOf(b)
    return i === -1 ? BRANCH_ORDER.length : i   // 모르는 지점은 맨 뒤
  }
  return [...rows].sort((a, b) => {
    if (rank(a.branch) !== rank(b.branch)) return rank(a.branch) - rank(b.branch)
    return (a.gap ?? 0) - (b.gap ?? 0)
  })
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, color: 'var(--text-3)', border: '1px solid var(--text-3)', borderRadius: 10,
      padding: '2px 8px', whiteSpace: 'nowrap', opacity: 0.9,
    }}>{children}</span>
  )
}

function ratingColor(r: number | null) {
  if (r == null) return 'var(--text-3)'
  if (r >= 9) return 'var(--done)'
  if (r >= 7) return 'var(--medium)'
  if (r >= 5) return 'var(--high)'
  return 'var(--critical)'
}

// ─── 리뷰 원문 ────────────────────────────────────────────────────────────────
// 기준선 미만 리뷰만 나온다(필터는 lib/weeklyReviews.ts). 카드가 '8.9 → 8.0'이라 써 놓고
// 펼치면 10.0짜리 호평이 함께 뜨던 문제를 없앤 것이다.
function ReviewList({ cr }: { cr: ChannelReviews | undefined }) {
  // 확보한 원문 총수 = 보여 주는 것 + 기준선 이상이라 뺀 것. 커버리지 경고의 분자다 —
  // items.length 를 쓰면 3건을 다 확보하고도 '원문 확보 1/3건'이 뜬다.
  const secured = cr ? cr.items.length + cr.hiddenCount : 0
  const baseTxt = cr?.baseline != null ? `기준 ${fmt(cr.baseline)}` : '기준선 없음'

  if (!cr || secured === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
        원문을 찾지 못했습니다 — 수집 커버리지 밖의 리뷰입니다
      </div>
    )
  }

  // 원문은 확보했는데 전부 기준선 이상인 상태. 위 문구와 합치면 '수집이 안 됐다'와
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
        {cr.items.map(it => (
          <div key={it.id} style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
            background: 'var(--bg-input)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span className="font-display" style={{ fontSize: 15, fontWeight: 800, color: ratingColor(it.rating) }}>
                {it.rating == null ? '—' : fmt(it.rating)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {[it.country, it.date, it.roomType].filter(Boolean).join(' · ') || '정보 없음'}
              </span>
              {!it.translated && <Chip>원문(번역 없음)</Chip>}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
              {it.body || '(본문 없음)'}
            </div>
          </div>
        ))}
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
// 🔴 카드는 원인을 쓰지 않는다(2026-07-27 재헌 결정). 말하는 것은 '기준 점수보다 낮은
//    리뷰가 났다'까지이고, 왜 그랬는지는 펼침의 리뷰 원문을 사람이 읽어 판단한다.
//    이전에는 ota_complaints.headline → memo → bad 키워드로 폴백해 결론 한 줄을 지어냈는데,
//    그 폴백이 밴드를 보지 않아 기준선을 밀어올린 9.5점 리뷰의 팁이 미달 원인 자리에 앉았다.
function DiscussionCard({ r, cr }: { r: WeeklyChannelRow; cr: ChannelReviews | undefined }) {
  const [open, setOpen] = useState(false)
  const unit = r.granularity === 'month' ? '직전 달' : '직전 주'

  return (
    <div className="card" style={{ padding: '14px 20px', marginBottom: 10, borderLeft: '3px solid var(--critical)' }}>
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {r.baseline != null ? fmt(r.baseline) : '—'} →
            </span>
            <span className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--critical)', lineHeight: 1 }}>
              {fmt(r.weekAvg)}
            </span>
            {/* 건수를 점수와 같은 크기로 — 1건짜리 격차를 붕괴로 읽지 않게 하는 장치다 */}
            <span className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
              {r.reviewCount}건
            </span>
          </span>
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
            {r.baselineRecordedAt && ` · 기준선 ${r.baselineRecordedAt} 스냅샷`}
            {r.baselineIsFallback && ' · 기준선 대체(이후 스냅샷)'}
          </div>

          <ReviewList cr={cr} />
        </div>
      )}
    </div>
  )
}

// ─── 점수 보드 ────────────────────────────────────────────────────────────────
// 첫 화면은 이 보드다(2026-08-04 FO Weekly 재헌 지시). 이전에는 기준 점수가 우측 보조
// 패널이었고 '이번 주에 몇 점짜리 리뷰가 몇 건 왔는가'는 상세 탭 분포도까지 들어가야
// 보였다 — 회의가 리포트↔점수 현황↔분포도를 오가며 끊겼다. 보드가 지점×채널마다
// '기준 → 이번 주 평균 + 수집 점수 밴드'를 한 벌로 펴고, 미달만 붉게 띄운다.
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

// 밴드 칩은 밴드 '전체'가 기준선 아래일 때만 붉게 칠한다. 밴드는 폭이 1점이라
// (8점대 = 8.0~8.9) 기준선이 밴드 안에 걸리면 그 칩의 리뷰가 미달인지 단정할 수 없다 —
// 단정은 카드 판정(weekAvg)과 펼침의 원문 목록이 한다.
function bandWhollyBelow(band: number, scoreMax: number, baseline: number | null): boolean {
  if (baseline == null) return false
  const top = band === scoreMax ? scoreMax : band + 0.99
  return top < baseline
}

function BandChips({ r }: { r: WeeklyChannelRow }) {
  const labels = bandsFor(r.scoreMax)
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
      {r.bands.map(b => {
        const below = bandWhollyBelow(b.band, r.scoreMax, r.baseline)
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

function BoardRow({ base, row }: { base: BaselineRow; row: WeeklyChannelRow | undefined }) {
  const below = row?.verdict === 'below'
  const avgColor = row == null ? 'var(--text-3)'
    : below ? 'var(--critical)'
    : row.verdict === 'onOrAbove' ? 'var(--done)' : 'var(--text-1)'

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
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {base.score == null ? '—' : fmt(base.score)}{base.isFallback && '*'} →
        </span>
        <span className="font-display" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: avgColor }}>
          {row == null ? '—' : fmt(row.weekAvg)}
        </span>
        {row != null && (
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.reviewCount}건</span>
        )}
      </span>

      <span style={{ marginLeft: 'auto', minWidth: 0 }}>
        {row != null && <BandChips r={row} />}
      </span>
    </div>
  )
}

function ScoreBoard({ report }: { report: WeeklyReport }) {
  const { baselines } = report
  if (baselines.length === 0) return null

  // 판정·평균·밴드는 리포트 본체가 이미 채널별로 갖고 있다 — propertyId 로 잇기만 한다.
  const rowByProp = new Map<number, WeeklyChannelRow>(
    [...report.below, ...report.onOrAbove, ...report.unknown, ...report.monthly].map(r => [r.propertyId, r]),
  )

  const branches = [...new Set(baselines.map(b => b.branch))].sort((a, b) => brRank(a) - brRank(b))

  // 스냅샷 날짜는 전 채널이 같을 때만 한 번 쓴다. 갈리는데 대표값 하나를 찍으면
  // 그 순간 화면이 거짓을 말한다.
  const dates = [...new Set(baselines.map(b => b.recordedAt).filter(Boolean))]
  const dateTxt = dates.length === 1 ? `기준 = ${dates[0]} 누적 점수` : '기준 = 채널별 누적 점수'

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>이번 주 점수</b>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{dateTxt}</span>
      </div>

      <div className="score-board">
        {branches.map(br => {
          const rows = baselines
            .filter(b => b.branch === br)
            .sort((a, b) => otaRank(a.otaName) - otaRank(b.otaName))
          const belowCount = rows.filter(b => b.below).length
          return (
            <div key={br} className="card" style={{ padding: '12px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: branchColor(br) }} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{br}</span>
                {belowCount > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--critical)',
                    border: '1px solid var(--critical)', borderRadius: 10, padding: '1px 8px',
                  }}>미달 {belowCount}</span>
                )}
              </div>
              {rows.map(b => <BoardRow key={b.propertyId} base={b} row={rowByProp.get(b.propertyId)} />)}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7, marginTop: 8 }}>
        에어비앤비·야놀자는 5점 만점 · — 는 이번 주 리뷰 0건
        {baselines.some(b => b.isFallback) && ' · * 이 주 이전 스냅샷이 없어 이후 값을 빌려 씀'}
      </div>
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportClient({
  report, week, weeks, reviews, weeklyTasks, basePath, extraQuery = '', embed = false,
}: {
  report: WeeklyReport | null
  week: string
  weeks: string[]
  reviews: Record<number, ChannelReviews>
  weeklyTasks: WeeklyTaskRow[]
  basePath: string
  extraQuery?: string   // 임베드의 ?key= 처럼 주 이동 시에도 유지해야 하는 쿼리
  embed?: boolean       // 임베드는 읽기 전용 — 쓰기 컨트롤을 아예 렌더하지 않는다
}) {
  const router = useRouter()
  const hrefFor = (w: string) => `${basePath}?week=${w}${extraQuery ? `&${extraQuery}` : ''}`

  const idx = weeks.indexOf(week)
  const older = idx >= 0 && idx + 1 < weeks.length ? weeks[idx + 1] : null   // 목록은 최신 우선
  const newer = idx > 0 ? weeks[idx - 1] : null

  // 월 단위 채널의 미달도 논의 대상이다 — 참고로 접으면 '에어비앤비는 문제 없었다'가 된다.
  const cards = report
    ? orderForMeeting([...report.below, ...report.monthly.filter(r => r.verdict === 'below')])
    : []

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
    <div style={{ padding: '28px 32px', maxWidth: 1220 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20, maxWidth: 900 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>주간 OTA 리포트</div>
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
            {report ? report.label : `${week || '—'} 주차`}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
            그 주에 리뷰를 쓴 사람들의 평균을 채널 자신의 누적 점수와 비교합니다
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
        <div style={{ maxWidth: 900, minWidth: 0 }}>
          <ScoreBoard report={report} />

          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            fontSize: 14, color: 'var(--text-2)', marginBottom: 16,
          }}>
            <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>
              논의 {cards.length}건
            </b>
            <span style={{ color: 'var(--text-3)' }}>· 주간 리뷰 {report.summary.reviewTotal}건</span>
          </div>

          {cards.length === 0 ? (
            <div className="card" style={{ padding: '18px 20px', fontSize: 14, color: 'var(--text-2)' }}>
              이번 주 기준선을 끌어내린 채널이 없습니다.
            </div>
          ) : (
            // 🔴 key에 week를 포함해야 한다. propertyId만 쓰면 같은 채널이 주가 바뀌어도 같은
            //    인스턴스로 재사용돼 펼침 상태가 따라온다 — 회의에서 주를 넘기면 지난 주에 열어
            //    둔 카드가 펼쳐진 채로 시작해 '논의 카드 한 벌이 한 화면'이 깨진다.
            cards.map(r => <DiscussionCard key={`${week}-${r.propertyId}`} r={r} cr={reviews[r.propertyId]} />)
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
