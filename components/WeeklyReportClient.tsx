'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { ESTIMATOR_LABEL, type WeeklyReport, type WeeklyChannelRow, type BaselineRow } from '@/lib/weeklyReport'
import type { ChannelReviews } from '@/lib/weeklyReviews'

// FO Weekly 회의 중 노션 임베드로 화면 공유하며 읽는 보고서다. 설계 정본은
// docs/superpowers/specs/2026-07-24-weekly-report-quality-design.md.
//
//   · 논의 카드 한 벌이 화면의 전부다. 통과·월단위·리뷰0건은 맨 아래 한 줄로 접는다.
//     (숨기는 게 아니라 접는다 — '리뷰 0건은 통과가 아니다'가 숫자로 남아야 한다.)
//   · 접힌 카드의 숫자는 셋뿐이다: 누적 → 그 주, 건수. 나머지는 펼침 안으로.
//   · 지점 순서는 고정한다. 격차 순으로 정렬하면 매주 자리가 바뀌어 회의에서 찾게 된다.
//   · 타이포는 프로젝터 기준이다. 11~13px은 회의실 화면에서 읽히지 않는다.

const BRANCH_ORDER = ['신설', '동대문', '제주시티', '고성']
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

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  const color = tone === 'warn' ? 'var(--medium)' : 'var(--text-3)'
  return (
    <span style={{
      fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 10,
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
function DiscussionCard({ r, cr }: { r: WeeklyChannelRow; cr: ChannelReviews | undefined }) {
  const [open, setOpen] = useState(false)
  const c = r.cause
  const unit = r.granularity === 'month' ? '직전 달' : '직전 주'

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 12, borderLeft: '3px solid var(--critical)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: branchColor(r.branch) }} />
          {r.branch} {r.otaName}
          {r.granularity === 'month' && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
              ({r.weekStart.substring(0, 7)} 월 단위)
            </span>
          )}
        </span>
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
      </div>

      <div style={{
        fontSize: 16, lineHeight: 1.6, marginTop: 10,
        color: c?.hasCause ? 'var(--text-1)' : 'var(--medium)',
      }}>
        {c?.hasCause
          ? c.headline
          : '⚠ 원인 미기록 — 불만 메모도 키워드도 없습니다. 리뷰 원문 확인이 먼저입니다'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
        {r.thinSample && <Chip tone="warn">소표본 {r.reviewCount}건 · 추세 아님</Chip>}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {open ? '리뷰 닫기' : '리뷰 보기'}
          <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
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

          {c?.detail && (
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)', marginTop: 8 }}>
              <span style={{ color: 'var(--text-3)' }}>상세 </span>{c.detail}
            </div>
          )}
          {c && c.badKeywords.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              키워드 {c.badKeywords.join(' · ')}
            </div>
          )}

          <ReviewList cr={cr} />
        </div>
      )}
    </div>
  )
}

// ─── 기준 점수 패널 ───────────────────────────────────────────────────────────
// 왜 있나: 카드 오른쪽 작은 '8.9'가 기준선이라는 사실도, 채널마다 4.00~9.30으로 흩어져
// 있다는 사실도 화면에 없었다. 그래서 '왜 8.0이 미달인가'를 매번 말로 설명해야 했다.
//
// 값은 카드와 같은 pickBaseline 산출이다(lib/weeklyReport.ts). 여기서 다시 계산하지 말 것.
const OTA_ORDER = ['Agoda', 'Booking', 'Trip.com', 'Expedia', 'Airbnb', 'NOL', '여기어때']

function BaselinePanel({ baselines }: { baselines: BaselineRow[] }) {
  if (baselines.length === 0) return null

  const otaRank = (n: string) => {
    const i = OTA_ORDER.indexOf(n)
    return i === -1 ? OTA_ORDER.length : i
  }
  const branchRank = (b: string) => {
    const i = BRANCH_ORDER.indexOf(b)
    return i === -1 ? BRANCH_ORDER.length : i
  }

  const branches = [...new Set(baselines.map(b => b.branch))].sort((a, b) => branchRank(a) - branchRank(b))

  // 스냅샷 날짜는 전 채널이 같을 때만 한 번 쓴다. 갈리는데 대표값 하나를 찍으면
  // 그 순간 화면이 거짓을 말한다.
  const dates = [...new Set(baselines.map(b => b.recordedAt).filter(Boolean))]
  const dateTxt = dates.length === 1 ? `${dates[0]} 스냅샷` : '채널별 스냅샷'

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div className="font-display" style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>기준 점수</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 12 }}>
        채널 누적 점수 · {dateTxt}
        <br />이보다 낮은 리뷰만 논의 카드에 펼쳐집니다
      </div>

      {branches.map(br => (
        <div key={br} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: branchColor(br) }} />
            {br}
          </div>
          {baselines
            .filter(b => b.branch === br)
            .sort((a, b) => otaRank(a.otaName) - otaRank(b.otaName))
            .map(b => (
              <div key={b.propertyId} style={{
                display: 'flex', alignItems: 'baseline', gap: 6,
                padding: '2px 0 2px 12px', fontSize: 12,
              }}>
                {/* 미달 채널만 점 — 왼쪽 논의 카드와 눈으로 잇는 장치다 */}
                <span style={{
                  width: 4, height: 4, borderRadius: '50%', marginLeft: -8, marginRight: 2,
                  background: b.below ? 'var(--critical)' : 'transparent', alignSelf: 'center',
                }} />
                <span style={{ color: b.below ? 'var(--text-1)' : 'var(--text-2)' }}>{b.otaName}</span>
                <span className="font-display" style={{
                  marginLeft: 'auto', fontWeight: b.below ? 800 : 600,
                  color: b.score == null ? 'var(--text-3)' : b.below ? 'var(--critical)' : 'var(--text-1)',
                }}>
                  {b.score == null ? '—' : fmt(b.score)}
                </span>
                {b.isFallback && <span style={{ fontSize: 10, color: 'var(--medium)' }}>*</span>}
              </div>
            ))}
        </div>
      ))}

      <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        에어비앤비·야놀자는 5점 만점입니다
        {baselines.some(b => b.isFallback) && <><br />* 이 버킷 이전 스냅샷이 없어 이후 값을 빌려 썼습니다</>}
        {baselines.some(b => b.score == null) && <><br />— 는 스냅샷이 없어 판정할 수 없는 채널입니다</>}
      </div>
    </div>
  )
}

// ─── 접힌 참고 영역 ───────────────────────────────────────────────────────────
function ReferenceFold({ report }: { report: WeeklyReport }) {
  const [open, setOpen] = useState(false)
  const s = report.summary
  // 월 단위 미달은 위 논의 카드로 승격됐다 — 여기서 다시 세면 같은 건이 두 번 잡힌다.
  const monthlyRest = report.monthly.filter(r => r.verdict !== 'below')
  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span>
          통과 {s.onOrAboveCount}{monthlyRest.length > 0 && ` · 월 단위 ${monthlyRest.length}`} · 리뷰 0건 {s.silentCount}
          {s.unknownCount > 0 && ` · 기준선 없음 ${s.unknownCount}`}
        </span>
        <ChevronDown size={14} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--done)' }}>통과 {s.onOrAboveCount}곳</b>{' '}
            {report.onOrAbove.length === 0
              ? <span style={{ color: 'var(--text-3)' }}>없음</span>
              : report.onOrAbove.map(r => `${r.branch} ${r.otaName} ${fmt(r.weekAvg)}(${r.reviewCount}건)`).join(' · ')}
          </div>

          {monthlyRest.length > 0 && (
            <div style={{ color: 'var(--text-2)' }}>
              <b>월 단위 {monthlyRest.length}곳</b>
              <span style={{ color: 'var(--text-3)' }}> (원본이 일 단위 날짜를 주지 않아 그 주가 아니라 그 달의 값)</span>
              <div style={{ marginTop: 3 }}>
                {monthlyRest.map(r => (
                  `${r.branch} ${r.otaName} ${fmt(r.weekAvg)}` +
                  ` (${r.reviewCount}건 · 누적 ${r.baseline != null ? fmt(r.baseline) : '—'}` +
                  `${r.gap != null ? ` · ${signed(r.gap)}` : ''} · ${r.weekStart.substring(0, 7)})`
                )).join('  ·  ')}
              </div>
            </div>
          )}

          {report.unknown.length > 0 && (
            <div style={{ color: 'var(--medium)' }}>
              기준선 없음 {report.unknown.length}곳 — 스냅샷이 없어 판정 불가:{' '}
              <span style={{ color: 'var(--text-2)' }}>
                {report.unknown.map(r => `${r.branch} ${r.otaName}(${r.reviewCount}건 ${fmt(r.weekAvg)})`).join(' · ')}
              </span>
            </div>
          )}

          {report.silent.length > 0 && (
            <div style={{ color: 'var(--text-3)' }}>
              리뷰 0건 {report.silent.length}곳 — 통과가 아니라 이번 주 목소리가 없었던 채널:{' '}
              {report.silent.map(s2 => `${s2.branch} ${s2.otaName}`).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportClient({
  report, week, weeks, reviews, basePath, extraQuery = '',
}: {
  report: WeeklyReport | null
  week: string
  weeks: string[]
  reviews: Record<number, ChannelReviews>
  basePath: string
  extraQuery?: string   // 임베드의 ?key= 처럼 주 이동 시에도 유지해야 하는 쿼리
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
        // 논의 카드(주) + 기준 점수 패널(부). 폭이 좁아지면 1컬럼으로 접히고 패널이
        // 카드 '아래'로 간다 — 위로 올리면 노션 임베드에서 논의 카드가 첫 화면 밖으로 밀린다.
        // 미디어쿼리는 인라인 스타일로 쓸 수 없어 globals.css의 .weekly-grid 를 쓴다.
        <div className="weekly-grid">
          <div style={{ minWidth: 0 }}>
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
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                  아래 참고를 펼치면 리뷰 0건 채널을 확인할 수 있습니다 — 목소리가 없었던 것은 통과가 아닙니다
                </div>
              </div>
            ) : (
              // 🔴 key에 week를 포함해야 한다. propertyId만 쓰면 같은 채널이 주가 바뀌어도 같은
              //    인스턴스로 재사용돼 펼침 상태가 따라온다 — 회의에서 주를 넘기면 지난 주에 열어
              //    둔 카드가 펼쳐진 채로 시작해 '논의 카드 한 벌이 한 화면'이 깨진다.
              cards.map(r => <DiscussionCard key={`${week}-${r.propertyId}`} r={r} cr={reviews[r.propertyId]} />)
            )}

            <ReferenceFold report={report} />
          </div>

          <div className="weekly-aside">
            <BaselinePanel baselines={report.baselines} />
          </div>
        </div>
      )}
    </div>
  )
}
