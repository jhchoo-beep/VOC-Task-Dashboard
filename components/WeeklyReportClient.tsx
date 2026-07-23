'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, AlertTriangle, Check } from 'lucide-react'
import {
  ESTIMATOR_LABEL,
  type WeeklyReport, type WeeklyChannelRow,
} from '@/lib/weeklyReport'

// 화면의 뼈대는 FO Weekly 260721 결정을 그대로 옮긴 것이다.
//   · 기준선 미달 채널은 자리를 넉넉히 준다 — 원인까지 한눈에 읽혀야 확인이 시작된다.
//   · 통과 채널은 한 줄로 접는다 — 미팅에서 "통과는 논의하지 않는다"가 명시적 합의였다.
//   · 리포트의 페이로드는 숫자가 아니라 '도출되는 과제'다. 과제 블록이 맨 아래 결론이고
//     위의 숫자들은 그 근거다.
//   · 건수는 격차와 같은 크기로 쓴다 — 1건 -4.5는 진짜 악평 한 건이지 붕괴가 아니다.

const BRANCH_COLOR: Record<string, string> = {
  신설: 'var(--sinseol)', 동대문: 'var(--ddm)', 제주시티: 'var(--jeju)', 고성: 'var(--goseong)',
}
const branchColor = (b: string) => BRANCH_COLOR[b] ?? 'var(--text-3)'

const fmt  = (n: number) => n.toFixed(1)
const trim = (n: number) => String(Number(n.toFixed(2)))
const signed = (n: number) => (n > 0 ? '+' : '') + trim(n)

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' | 'critical' }) {
  const color = tone === 'warn' ? 'var(--medium)' : tone === 'critical' ? 'var(--critical)' : 'var(--text-3)'
  return (
    <span style={{
      fontSize: 10, color, border: `1px solid ${color}`, borderRadius: 10,
      padding: '1px 7px', whiteSpace: 'nowrap', opacity: 0.9,
    }}>{children}</span>
  )
}

/** 행에 붙는 단서들 — 소표본·근사값·기준선 대체는 판정을 단정하지 못하게 만드는 사실이다. */
function RowFlags({ r }: { r: WeeklyChannelRow }) {
  return (
    <>
      {r.thinSample && <Chip tone="warn">소표본 {r.reviewCount}건 · 추세 아님</Chip>}
      {r.estimator === 'approx' && <Chip tone="warn">{ESTIMATOR_LABEL.approx}</Chip>}
      {r.baselineIsFallback && <Chip tone="warn">기준선 대체(이후 스냅샷)</Chip>}
    </>
  )
}

function WowText({ r }: { r: WeeklyChannelRow }) {
  const unit = r.granularity === 'month' ? '직전 달' : '직전 주'
  if (r.wow == null) return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{unit} 데이터 없음</span>
  const color = r.wow > 0 ? 'var(--done)' : r.wow < 0 ? 'var(--critical)' : 'var(--text-3)'
  return (
    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
      {unit} 대비 <span style={{ color, fontWeight: 700 }}>{signed(r.wow)}</span>
      {r.prevWeekAvg != null && <> · {fmt(r.prevWeekAvg)}({r.prevReviewCount ?? 0}건)</>}
    </span>
  )
}

// ─── 미달 카드 ────────────────────────────────────────────────────────────────
function BelowCard({ r }: { r: WeeklyChannelRow }) {
  const c = r.cause
  return (
    <div className="card" style={{
      padding: '16px 18px', marginBottom: 10,
      borderLeft: `3px solid var(--critical)`,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: branchColor(r.branch) }} />
          {r.branch} {r.otaName}
        </span>

        {/* 건수는 점수·격차와 같은 크기로 — 1건짜리 격차를 붕괴로 읽지 않게 한다 */}
        <span className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
          {r.reviewCount}건
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>·</span>
        <span className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--critical)', lineHeight: 1 }}>
          {fmt(r.weekAvg)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          누적 {r.baseline != null ? fmt(r.baseline) : '—'}
        </span>
        {r.gap != null && (
          <span className="font-display" style={{ fontSize: 22, fontWeight: 800, color: 'var(--critical)', lineHeight: 1 }}>
            {signed(r.gap)}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <WowText r={r} />
        <RowFlags r={r} />
      </div>

      {/* 원인 — 기록이 없으면 그 사실을 그대로 띄운다(행을 숨기지 않는다) */}
      <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.6 }}>
        <span style={{ color: 'var(--text-3)' }}>└</span>
        {c?.hasCause ? (
          <span style={{ color: 'var(--text-1)' }}>
            {c.memo}
            {c.memo && c.badKeywords.length > 0 && <span style={{ color: 'var(--text-3)' }}> — </span>}
            {c.badKeywords.join(' · ')}
          </span>
        ) : (
          <span style={{ color: 'var(--medium)' }}>원인 미기록 — 불만 메모도 bad 키워드도 없음</span>
        )}
      </div>
    </div>
  )
}

// ─── 과제 도출 ────────────────────────────────────────────────────────────────
// 미달 채널의 '기록된 원인'에서만 과제를 만든다. 원인이 없으면 과제를 지어내지 않고
// '원인 미기록'으로 남긴다 — 없는 원인을 채우는 순간 리포트가 근거를 잃는다.
export function deriveTasks(below: WeeklyChannelRow[]) {
  return below
    .filter(r => r.cause?.hasCause)
    .map(r => ({
      row: r,
      cause: [r.cause!.memo, ...r.cause!.badKeywords].filter(Boolean).join(' · '),
    }))
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportClient({
  report, week, weeks, basePath, extraQuery = '',
}: {
  report: WeeklyReport | null
  week: string
  weeks: string[]
  basePath: string
  extraQuery?: string   // 임베드의 ?key= 처럼 주 이동 시에도 유지해야 하는 쿼리
}) {
  const router = useRouter()
  const hrefFor = (w: string) => `${basePath}?week=${w}${extraQuery ? `&${extraQuery}` : ''}`

  const idx  = weeks.indexOf(week)
  const older = idx >= 0 && idx + 1 < weeks.length ? weeks[idx + 1] : null   // 목록은 최신 우선
  const newer = idx > 0 ? weeks[idx - 1] : null

  const tasks = report ? deriveTasks(report.below) : []
  const causeless = report ? report.below.filter(r => !r.cause?.hasCause) : []

  const navBtn = (target: string | null, dir: 'prev' | 'next') => {
    const style: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
      borderRadius: 8, border: '1px solid var(--border)', fontSize: 12,
      color: target ? 'var(--text-2)' : 'var(--text-3)',
      background: 'var(--bg-card)', textDecoration: 'none',
      opacity: target ? 1 : 0.4, pointerEvents: target ? 'auto' : 'none',
    }
    return target
      ? <Link href={hrefFor(target)} style={style}>
          {dir === 'prev' ? <><ChevronLeft size={13} /> 이전 주</> : <>다음 주 <ChevronRight size={13} /></>}
        </Link>
      : <span style={style}>{dir === 'prev' ? <><ChevronLeft size={13} /> 이전 주</> : <>다음 주 <ChevronRight size={13} /></>}</span>
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 980 }}>
      {/* 헤더 + 주 이동 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>주간 OTA 리포트</div>
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>
            {report ? report.label : `${week || '—'} 주차`}
          </h1>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
            그 주에 리뷰를 쓴 사람들의 평균을 채널 자신의 누적 점수와 비교한다
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
        <>
          {/* 요약 한 줄 */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
            fontSize: 12, color: 'var(--text-2)', marginBottom: 22,
            padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10,
          }}>
            <span>주간 리뷰 <b style={{ color: 'var(--text-1)' }}>{report.summary.reviewTotal}건</b></span>
            <span style={{ color: 'var(--critical)' }}>미달 {report.summary.belowCount}</span>
            <span style={{ color: 'var(--done)' }}>통과 {report.summary.onOrAboveCount}</span>
            {report.summary.unknownCount > 0 && <span style={{ color: 'var(--medium)' }}>기준선 없음 {report.summary.unknownCount}</span>}
            <span style={{ color: 'var(--text-3)' }}>월 단위 {report.summary.monthlyCount}</span>
            <span style={{ color: 'var(--text-3)' }}>리뷰 0건 {report.summary.silentCount}</span>
          </div>

          {/* 미달 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <AlertTriangle size={15} color="var(--critical)" />
            <h2 className="font-display" style={{ fontSize: 16, fontWeight: 800, color: 'var(--critical)' }}>
              기준선 미달 {report.summary.belowCount}곳
            </h2>
          </div>
          {report.below.length === 0 ? (
            <div className="card" style={{ padding: '14px 18px', marginBottom: 18, fontSize: 12, color: 'var(--text-2)' }}>
              이번 주 기준선을 끌어내린 채널이 없습니다.
            </div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              {report.below.map(r => <BelowCard key={r.propertyId} r={r} />)}
            </div>
          )}

          {/* 통과 — 한 줄 */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--text-2)', marginBottom: 10,
          }}>
            <Check size={14} color="var(--done)" />
            <b style={{ color: 'var(--done)' }}>통과 {report.summary.onOrAboveCount}곳</b>
            {report.onOrAbove.map((r, i) => (
              <span key={r.propertyId} style={{ color: 'var(--text-2)' }}>
                {i > 0 && <span style={{ color: 'var(--text-3)', marginRight: 8 }}>·</span>}
                {r.branch} {r.otaName} <b style={{ color: 'var(--text-1)' }}>{fmt(r.weekAvg)}</b>
                <span style={{ color: 'var(--text-3)' }}> ({r.reviewCount}건)</span>
              </span>
            ))}
            {report.onOrAbove.length === 0 && <span style={{ color: 'var(--text-3)' }}>없음</span>}
          </div>

          {/* 기준선 없음 — 통과로도 미달로도 세지 않는다 */}
          {report.unknown.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--medium)', marginBottom: 10 }}>
              기준선 없음 {report.unknown.length}곳 — 스냅샷이 없어 판정 불가:{' '}
              <span style={{ color: 'var(--text-2)' }}>
                {report.unknown.map(r => `${r.branch} ${r.otaName}(${r.reviewCount}건 ${fmt(r.weekAvg)})`).join(' · ')}
              </span>
            </div>
          )}

          {/* 월 단위 채널 — 주간이 아니라 그 달의 값 */}
          {report.monthly.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>
              <b style={{ color: 'var(--text-2)' }}>월 단위 {report.monthly.length}곳</b>
              <span style={{ color: 'var(--text-3)' }}> (원본이 일 단위 날짜를 주지 않아 그 주가 아니라 그 달의 값)</span>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {report.monthly.map(r => (
                  <span key={r.propertyId} style={{ color: r.verdict === 'below' ? 'var(--critical)' : 'var(--text-2)' }}>
                    {r.verdict === 'below' ? '⚠ ' : ''}{r.branch} {r.otaName}{' '}
                    <b style={{ color: 'var(--text-1)' }}>{fmt(r.weekAvg)}</b>
                    <span style={{ color: 'var(--text-3)' }}>
                      {' '}({r.reviewCount}건 · 누적 {r.baseline != null ? fmt(r.baseline) : '—'}
                      {r.gap != null ? ` · ${signed(r.gap)}` : ''} · {r.weekStart.substring(0, 7)})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 리뷰 0건 — 통과가 아니다 */}
          {report.silent.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, lineHeight: 1.6 }}>
              리뷰 0건 {report.silent.length}곳 — 통과가 아니라 이번 주 목소리가 없었던 채널:{' '}
              {report.silent.map(s => `${s.branch} ${s.otaName}`).join(' · ')}
            </div>
          )}

          {/* 과제 — 이 리포트의 결론 */}
          <div style={{ height: 1, background: 'var(--border)', margin: '22px 0 16px' }} />
          <h2 className="font-display" style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>이번 주 과제</h2>
          {tasks.length === 0 && causeless.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>도출된 과제 없음 — 기준선을 끌어내린 채널이 없습니다</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tasks.map(({ row, cause }) => (
                <div key={row.propertyId} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--accent)' }}>·</span>
                  <div>
                    <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{row.branch} {row.otaName}</span>
                    <span style={{ color: 'var(--text-3)' }}> — </span>
                    <span style={{ color: 'var(--text-1)' }}>{cause}</span>
                    <span style={{ color: 'var(--text-2)' }}> 원인 확인</span>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      근거 {row.reviewCount}건 {fmt(row.weekAvg)} · 누적 {row.baseline != null ? fmt(row.baseline) : '—'}
                      {row.gap != null ? ` · ${signed(row.gap)}` : ''}
                      {row.thinSample && ' · 소표본(추세 아님)'}
                      {row.estimator === 'approx' && ` · ${ESTIMATOR_LABEL.approx}`}
                    </div>
                  </div>
                </div>
              ))}
              {causeless.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--medium)', lineHeight: 1.6 }}>
                  원인 미기록 {causeless.length}곳({causeless.map(r => `${r.branch} ${r.otaName}`).join(' · ')}) — 원인이 기록되기 전까지 과제를 세우지 않습니다. 리뷰 원문 확인이 먼저입니다
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
