'use client'
// STAY VOC 2.0 OTA 점수 — B 관제 콘솔형. 1.0 「OTA 점수 현황」의 기능을 그대로 두고 화면만 다시 짰다.
// 상단 바(지점·기간) → 지표 줄 4칸 → 왼쪽 지점 × 채널 목록 / 가운데 고른 것의 추이·상세 / 오른쪽 기준·스냅샷·원문.
// 지점과 고른 채널은 주소(?branch=&ch=)에 남기되 화면 안 상태로 바꾼다(임베드 ?key= 를 지키려고 페이지 이동을 하지 않는다).
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { granularityForOtaName } from '@/lib/otaDetail'
import {
  ALL, INTEGRATED, TARGET_INTEGRATED, branchesOf, channelNow, channelsOf, deltaTone, fmtDelta, fmtScore, nowOf, weeklyRows,
  type ChannelNow, type Now, type OtaProps, type TimeMode,
} from '@/lib/v2/ota'
import { NewReviewBars, TrendBlock, colorOf } from './OtaCharts'
import { ComplaintPanel, DistPanel, RatePanel, VocPanel } from './OtaPanels'
import OtaInputModal, { INPUT_LABEL, type InputMode } from './OtaInputModal'
import '@/app/v2/ota/ota.css'

type Sel = { kind: 'compare' } | { kind: 'item'; branch: string; ota: string }
type Sub = 'trend' | 'rate' | 'dist' | 'complaint' | 'voc'
const SUBS: { id: Sub; label: string; mode: InputMode }[] = [
  { id: 'trend', label: '점수 추이', mode: 'basic' },
  { id: 'rate', label: '리뷰 작성률', mode: 'checkouts' },
  { id: 'dist', label: '점수 분포', mode: 'score-dist' },
  { id: 'complaint', label: '불만 분석', mode: 'complaints' },
  { id: 'voc', label: 'VOC', mode: 'voc' },
]

interface Props {
  data: OtaProps
  urls: Record<number, string>
  initialScope: string
  initialCh: string | null
  readOnly: boolean
}

interface BranchSum { branch: string; integ: Now; channels: ChannelNow[]; met: number; total: number; reviews: number; newReviews: number; up: number; down: number; flat: number }

const defaultSel = (scope: string, ch: string | null): Sel =>
  scope === ALL ? { kind: 'compare' } : { kind: 'item', branch: scope, ota: ch ?? INTEGRATED }

export default function OtaConsole({ data, urls, initialScope, initialCh, readOnly }: Props) {
  const router = useRouter()
  const branches = useMemo(() => branchesOf(data), [data])
  const [scope, setScope] = useState(initialScope)
  const [sel, setSel] = useState<Sel>(() => defaultSel(initialScope, initialCh))
  const [mode, setMode] = useState<TimeMode>('weekly')
  const [sub, setSub] = useState<Sub>('trend')
  const [listTab, setListTab] = useState<'all' | 'below'>('all')
  const [modal, setModal] = useState<InputMode | null>(null)

  // 지점·채널을 주소에 남긴다(새로고침·공유 시 같은 화면). 페이지 이동은 하지 않는다.
  useEffect(() => {
    const u = new URL(window.location.href)
    if (scope === ALL) u.searchParams.delete('branch'); else u.searchParams.set('branch', scope)
    if (sel.kind === 'item' && sel.ota !== INTEGRATED && sel.branch === scope) u.searchParams.set('ch', sel.ota); else u.searchParams.delete('ch')
    if (u.href !== window.location.href) window.history.replaceState(null, '', u.pathname + u.search)
  }, [scope, sel])

  // 지점별 요약: 통합(10점 환산·리뷰 수 가중) + 채널(자기 척도). 행 계산은 전부 lib.
  const rowsByOta = useMemo(() => {
    const m = new Map<string, ReturnType<typeof weeklyRows>>()
    for (const o of [INTEGRATED, ...data.otaList.map(o => o.name)]) m.set(o, weeklyRows(data, branches, o))
    return m
  }, [data, branches])

  const sums = useMemo(() => {
    const out = new Map<string, BranchSum>()
    for (const b of branches) {
      const channels = channelsOf(data, b).map(o => channelNow(data, rowsByOta.get(o)!, b, o))
      const scored = channels.filter(c => c.cur != null)
      const tone = (c: ChannelNow) => deltaTone(c.delta, c.digits)
      out.set(b, {
        branch: b, integ: nowOf(rowsByOta.get(INTEGRATED)!, b), channels,
        met: scored.filter(c => c.met).length, total: scored.length,
        reviews: channels.reduce((s, c) => s + c.reviews, 0),
        newReviews: channels.reduce((s, c) => s + (c.newReviews ?? 0), 0),
        up: channels.filter(c => tone(c) === 'up').length,
        down: channels.filter(c => tone(c) === 'down').length,
        flat: channels.filter(c => tone(c) === 'flat').length,
      })
    }
    return out
  }, [data, branches, rowsByOta])

  const listBranches = scope === ALL ? branches : [scope]
  const below = listBranches.flatMap(b => sums.get(b)!.channels.filter(c => c.met === false))
  const totalChannels = listBranches.reduce((s, b) => s + sums.get(b)!.channels.length, 0)

  const pickScope = (s: string) => { setScope(s); setSel(defaultSel(s, null)); setModal(null) }
  const pick = (next: Sel) => { setSel(next); setModal(null) }
  const isOn = (b: string, o: string) => sel.kind === 'item' && sel.branch === b && sel.ota === o

  const selCh = sel.kind === 'item' && sel.ota !== INTEGRATED ? sums.get(sel.branch)?.channels.find(c => c.ota === sel.ota) ?? null : null
  const lastDate = data.dates[data.dates.length - 1] ?? null
  const prevDate = data.dates[data.dates.length - 2] ?? null

  return (
    <main className="v2-console ota-root">
      <div className="v2-bar">
        <div className="v2-crumb">{readOnly ? <span>홈</span> : <Link href="/v2">홈</Link>}<span>/</span><b>OTA 점수</b></div>
        <div className="segs" role="group" aria-label="지점" style={{ marginLeft: 'auto' }}>
          {[ALL, ...branches].map(b => (
            <button type="button" key={b} className={`seg${scope === b ? ' on' : ''}`} aria-pressed={scope === b} onClick={() => pickScope(b)}>
              {b === ALL ? '전 지점' : b}
            </button>
          ))}
        </div>
        <div className="segs" role="group" aria-label="기간">
          <button type="button" className={`seg${mode === 'weekly' ? ' on' : ''}`} aria-pressed={mode === 'weekly'} onClick={() => setMode('weekly')}>주별</button>
          <button type="button" className={`seg${mode === 'monthly' ? ' on' : ''}`} aria-pressed={mode === 'monthly'} onClick={() => setMode('monthly')}>월별</button>
        </div>
      </div>

      <Kpis scope={scope} branches={branches} sums={sums} onBranch={pickScope} />

      <div className="v2-panes">
        <section className="v2-pane list" aria-label="지점 × 채널">
          <div className="tabbs" role="tablist">
            <button type="button" role="tab" aria-selected={listTab === 'all'} className={`tabb${listTab === 'all' ? ' on' : ''}`} onClick={() => setListTab('all')}>채널 <span className="num">{totalChannels}</span></button>
            <button type="button" role="tab" aria-selected={listTab === 'below'} className={`tabb${listTab === 'below' ? ' on' : ''}`} onClick={() => setListTab('below')}>목표 미달 <span className="num">{below.length}</span></button>
          </div>
          <div className="ota-lh" aria-hidden="true"><span>채널</span><span>누적 리뷰</span><span>전 주</span><span>점수</span></div>
          <div className="scroll">
            {listTab === 'all' && (
              <>
                {scope === ALL && (
                  <button type="button" className={`li ota-li grp${sel.kind === 'compare' ? ' on' : ''}`} onClick={() => pick({ kind: 'compare' })}>
                    <span className="ota-li-n"><span className="ota-li-t">전 지점 비교</span><span className="ota-li-m">지점별 통합 추이</span></span>
                  </button>
                )}
                {listBranches.map(b => {
                  const s = sums.get(b)!
                  return (
                    <div key={b} role="group" aria-label={b}>
                      <button type="button" className={`li ota-li grp${isOn(b, INTEGRATED) ? ' on' : ''}`} onClick={() => pick({ kind: 'item', branch: b, ota: INTEGRATED })}>
                        <span className="ota-li-n">
                          <span className="ota-li-t"><i className="ota-dot" style={{ background: colorOf(b) }} aria-hidden="true" />{b}</span>
                          <span className="ota-li-m">통합 · 목표 달성 <span className="num">{s.met}/{s.total}</span></span>
                        </span>
                        <span className="ota-li-r num">{s.reviews.toLocaleString()}</span>
                        <Delta d={s.integ.delta} digits={2} />
                        <ScoreBadge v={s.integ.cur} digits={2} met={s.integ.cur == null ? null : s.integ.cur >= TARGET_INTEGRATED} />
                      </button>
                      {s.channels.map(c => <ChannelRow key={c.ota} c={c} on={isOn(b, c.ota)} onPick={() => pick({ kind: 'item', branch: b, ota: c.ota })} />)}
                    </div>
                  )
                })}
              </>
            )}
            {listTab === 'below' && (below.length
              ? below.map(c => <ChannelRow key={`${c.branch}-${c.ota}`} c={c} withBranch on={isOn(c.branch, c.ota)} onPick={() => pick({ kind: 'item', branch: c.branch, ota: c.ota })} />)
              : <div className="empty">목표 미달 채널 없음</div>)}
          </div>
        </section>

        <section className="v2-pane main" aria-label="자세히">
          {sel.kind === 'compare' && (
            <CompareView key={`compare-${mode}`} data={data} branches={branches} mode={mode} lastDate={lastDate} />
          )}
          {sel.kind === 'item' && sel.ota === INTEGRATED && (
            <IntegratedView key={`int-${sel.branch}-${mode}`} data={data} branches={branches} sum={sums.get(sel.branch)!} mode={mode} />
          )}
          {selCh && (
            <ChannelView
              key={`${selCh.propertyId ?? `${selCh.branch}-${selCh.ota}`}-${mode}`}
              data={data} branches={branches} c={selCh} mode={mode} sub={sub} onSub={setSub}
              readOnly={readOnly} onInput={() => setModal('checkouts')}
            />
          )}
        </section>

        <aside className="v2-pane side" aria-label="기준과 원문">
          <Side sel={sel} c={selCh} sum={sel.kind === 'item' ? sums.get(sel.branch) ?? null : null}
            lastDate={lastDate} prevDate={prevDate} count={data.dates.length} scope={scope}
            url={selCh?.propertyId != null ? urls[selCh.propertyId] ?? null : null}
            readOnly={readOnly} inputMode={SUBS.find(s => s.id === sub)!.mode} onInput={m => setModal(m)} />
        </aside>
      </div>

      {!readOnly && modal && selCh && (
        <OtaInputModal
          key={`${selCh.propertyId}-${modal}`}
          branch={selCh.branch} ota={selCh.ota} propertyId={selCh.propertyId} scoreMax={selCh.scale} mode={modal}
          checkoutDates={data.snapshotDatesByChannel[selCh.branch]?.[selCh.ota] ?? []}
          granularity={granularityForOtaName(selCh.ota)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); router.refresh() }}
        />
      )}
    </main>
  )
}

// ── 지표 줄 ─────────────────────────────────────────────────────────────
function Kpis({ scope, branches, sums, onBranch }: { scope: string; branches: string[]; sums: Map<string, BranchSum>; onBranch: (b: string) => void }) {
  if (scope === ALL) {
    return (
      <div className="v2-kpis">
        {branches.slice(0, 4).map(b => {
          const s = sums.get(b)!
          return (
            <button type="button" key={b} className="v2-kpi ota-kpi-btn" onClick={() => onBranch(b)}>
              <span className="k"><i className="ota-dot" style={{ background: colorOf(b) }} aria-hidden="true" />{b} 통합 점수</span>
              <span className={`v num ${scoreTone(s.integ.cur, TARGET_INTEGRATED)}`}>{fmtScore(s.integ.cur, 2)}</span>
              <span className="s">전 주 <Delta d={s.integ.delta} digits={2} inline /> · 목표 달성 <span className="num">{s.met}/{s.total}</span></span>
            </button>
          )
        })}
      </div>
    )
  }
  const s = sums.get(scope)!
  const belowNames = s.channels.filter(c => c.met === false).map(c => c.ota)
  return (
    <div className="v2-kpis">
      <div className="v2-kpi">
        <span className="k">{scope} 통합 점수 · 10점 환산</span>
        <span className={`v num ${scoreTone(s.integ.cur, TARGET_INTEGRATED)}`}>{fmtScore(s.integ.cur, 2)}</span>
        <span className="s">전 주 <Delta d={s.integ.delta} digits={2} inline /> · 목표 <span className="num">{TARGET_INTEGRATED.toFixed(1)}</span></span>
      </div>
      <div className="v2-kpi">
        <span className="k">목표 달성 채널</span>
        <span className="v num">{s.met}<small>/{s.total}</small></span>
        <span className="s ota-ellipsis">{belowNames.length ? `미달 ${belowNames.join(', ')}` : '전 채널 달성'}</span>
      </div>
      <div className="v2-kpi">
        <span className="k">최근 1주 신규 리뷰</span>
        <span className="v num">{s.newReviews.toLocaleString()}<small>건</small></span>
        <span className="s">누적 <span className="num">{s.reviews.toLocaleString()}</span>건</span>
      </div>
      <div className="v2-kpi">
        <span className="k">전 주 대비 하락 채널</span>
        <span className={`v num${s.down > 0 ? ' tone-over' : ''}`}>{s.down}<small>개</small></span>
        <span className="s">상승 <span className="num">{s.up}</span> · 유지 <span className="num">{s.flat}</span></span>
      </div>
    </div>
  )
}

const scoreTone = (v: number | null, target: number) => (v == null ? 'dim' : v >= target ? 'tone-ok' : 'tone-over')

function Delta({ d, digits, inline }: { d: number | null; digits: number; inline?: boolean }) {
  const t = deltaTone(d, digits)
  const cls = t === 'up' ? 'tone-ok' : t === 'down' ? 'tone-over' : 'dim'
  return <span className={`num ${cls}${inline ? '' : ' ota-li-d'}`}>{fmtDelta(d, digits)}</span>
}

function ScoreBadge({ v, digits, met }: { v: number | null; digits: number; met: boolean | null }) {
  return (
    <span className="ota-li-s">
      <span className={`score num${met === false ? ' low' : ''}`} title={met === false ? '목표 미달' : met ? '목표 달성' : undefined}>{fmtScore(v, digits)}</span>
    </span>
  )
}

function ChannelRow({ c, on, withBranch, onPick }: { c: ChannelNow; on: boolean; withBranch?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`li ota-li ch${on ? ' on' : ''}`} onClick={onPick}
      aria-label={`${c.branch} ${c.ota} ${fmtScore(c.cur, c.digits)}점${c.met === false ? ' 목표 미달' : ''}`}>
      <span className="ota-li-n">
        <span className="ota-li-t">{withBranch && <i className="ota-dot" style={{ background: colorOf(c.branch) }} aria-hidden="true" />}{withBranch ? `${c.branch} · ` : ''}{c.ota}</span>
        <span className="ota-li-m"><span className="num">/{c.scale}</span> · 목표 <span className="num">{c.target.toFixed(1)}</span>{granularityForOtaName(c.ota) === 'month' ? ' · 월 단위' : ''}</span>
      </span>
      <span className="ota-li-r num">{c.reviews.toLocaleString()}</span>
      <Delta d={c.delta} digits={c.digits} />
      <ScoreBadge v={c.cur} digits={c.digits} met={c.met} />
    </button>
  )
}

// ── 가운데: 전 지점 비교 ───────────────────────────────────────────────
function CompareView({ data, branches, mode, lastDate }: { data: OtaProps; branches: string[]; mode: TimeMode; lastDate: string | null }) {
  const [ota, setOta] = useState(INTEGRATED)
  const [only, setOnly] = useState<string[]>([])   // 빈 배열 = 전 지점
  const visible = only.length ? only : branches
  const chips = [INTEGRATED, ...data.otaList.filter(o => branches.some(b => (data.scoreHistory[b]?.[o.name] ?? []).some(v => v > 0))).map(o => o.name)]
  const shownFor = (o: string) => branches.filter(b => o === INTEGRATED || channelsOf(data, b).includes(o))

  // 1.0 과 같은 토글: 전체에서 누르면 그 지점만, 이후 누르면 더하기·빼기, 다 고르거나 다 빼면 전체
  const toggle = (b: string) => setOnly(prev => {
    const next = prev.length === 0 ? [b] : prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    return next.length === 0 || branches.every(x => next.includes(x)) ? [] : next
  })
  const drawn = visible.filter(b => shownFor(ota).includes(b))

  return (
    <>
      <div className="detail-meta">
        <span>전 지점 · {ota === INTEGRATED ? '통합 · 10점 환산' : `${ota} · 채널 점수`}</span>
        {lastDate && <span className="r pill">기준 <span className="num">{lastDate}</span></span>}
      </div>
      <h2 className="h2">지점별 점수 추이</h2>
      <div className="ota-chips" role="group" aria-label="채널">
        {chips.map(o => (
          <button type="button" key={o} className={`ota-chip${ota === o ? ' on' : ''}`} aria-pressed={ota === o} onClick={() => setOta(o)}>
            {o === INTEGRATED ? '통합' : o}
          </button>
        ))}
      </div>
      <TrendBlock key={`${ota}-${mode}`} data={data} branches={branches} visible={drawn} ota={ota} mode={mode}
        legend={(
          <div className="ota-legend" role="group" aria-label="지점">
            <button type="button" className={`ota-chip${only.length === 0 ? ' on' : ''}`} aria-pressed={only.length === 0} onClick={() => setOnly([])}>전 지점</button>
            {branches.map(b => {
              const on = visible.includes(b)
              const has = shownFor(ota).includes(b)
              return (
                <button type="button" key={b} className={`ota-chip${only.length > 0 && on ? ' on' : ''}${!on || !has ? ' off' : ''}`} aria-pressed={on} disabled={!has} onClick={() => toggle(b)}>
                  <i style={{ background: colorOf(b) }} aria-hidden="true" />{b}
                </button>
              )
            })}
          </div>
        )} />
    </>
  )
}

// ── 가운데: 지점 통합 ─────────────────────────────────────────────────
function IntegratedView({ data, branches, sum, mode }: { data: OtaProps; branches: string[]; sum: BranchSum; mode: TimeMode }) {
  const { integ } = sum
  const met = integ.cur == null ? null : integ.cur >= TARGET_INTEGRATED
  return (
    <>
      <div className="detail-meta">
        <span>{sum.branch} · 채널 <span className="num">{sum.channels.length}</span>개 · 10점 환산 · 리뷰 수 가중</span>
        {met != null && <span className={`r pill ${met ? 'ok' : 'warn'}`}>{met ? '목표 달성' : '목표 미달'}</span>}
      </div>
      <h2 className="h2">{sum.branch} 통합 점수</h2>
      <div className="stats">
        <div className="stat"><div className="k">통합 점수</div><div className={`v num ${scoreTone(integ.cur, TARGET_INTEGRATED)}`}>{fmtScore(integ.cur, 2)}</div><div className="s">목표 <span className="num">{TARGET_INTEGRATED.toFixed(1)}</span></div></div>
        <div className="stat"><div className="k">전 주 대비</div><div className="v"><Delta d={integ.delta} digits={2} inline /></div><div className="s">기준 <span className="num">{integ.date ?? '–'}</span></div></div>
        <div className="stat"><div className="k">목표 달성 채널</div><div className="v num">{sum.met}/{sum.total}</div><div className="s">하락 <span className="num">{sum.down}</span> · 상승 <span className="num">{sum.up}</span></div></div>
        <div className="stat"><div className="k">누적 리뷰</div><div className="v num">{sum.reviews.toLocaleString()}</div><div className="s">최근 1주 <span className="num">+{sum.newReviews.toLocaleString()}</span></div></div>
      </div>
      <div className="sec-k" style={{ marginTop: 22 }}>통합 점수 추이 · {mode === 'weekly' ? '주별' : '월별'}</div>
      <TrendBlock data={data} branches={branches} visible={[sum.branch]} ota={INTEGRATED} mode={mode} />
    </>
  )
}

// ── 가운데: 채널 상세(고른 채널 하나만 여기서 그린다. key = property_id + 기간) ──────────
function ChannelView({ data, branches, c, mode, sub, onSub, readOnly, onInput }: {
  data: OtaProps; branches: string[]; c: ChannelNow; mode: TimeMode; sub: Sub; onSub: (s: Sub) => void; readOnly: boolean; onInput: () => void
}) {
  const monthlyOnly = granularityForOtaName(c.ota) === 'month'
  const eff: TimeMode = monthlyOnly ? 'monthly' : mode
  const rateRaw = data.reviewRate[c.branch]?.[c.ota] ?? []
  const latestRate = rateRaw[rateRaw.length - 1]
  const prev = c.cur != null && c.delta != null ? c.cur - c.delta : null
  const hist = data.reviewHistory[c.branch]?.[c.ota] ?? []

  return (
    <>
      <div className="detail-meta">
        <span>{c.branch} · <span className="num">/{c.scale}</span>점 만점 · {monthlyOnly ? '리뷰 날짜 월 단위' : '리뷰 날짜 주 단위'}</span>
        {c.met != null && <span className={`r pill ${c.met ? 'ok' : 'warn'}`}>{c.met ? '목표 달성' : '목표 미달'}</span>}
      </div>
      <h2 className="h2">{c.ota}</h2>
      <div className="stats">
        <div className="stat"><div className="k">현재 점수</div><div className={`v num ${scoreTone(c.cur, c.target)}`}>{fmtScore(c.cur, c.digits)}</div><div className="s">목표 <span className="num">{c.target.toFixed(1)}</span></div></div>
        <div className="stat"><div className="k">전 주 대비</div><div className="v"><Delta d={c.delta} digits={c.digits} inline /></div><div className="s">직전 <span className="num">{fmtScore(prev, c.digits)}</span></div></div>
        <div className="stat"><div className="k">리뷰 작성률</div><div className="v num">{latestRate ? `${latestRate.ratePct}%` : '–'}</div><div className="s">{latestRate ? <><span className="num">{latestRate.reviewCount}/{latestRate.checkoutCount}</span>건 · <span className="num">{latestRate.week}</span></> : '체크아웃 미입력'}</div></div>
        <div className="stat"><div className="k">누적 리뷰</div><div className="v num">{c.reviews.toLocaleString()}</div><div className="s">최근 1주 {c.newReviews == null ? '–' : <span className="num">+{c.newReviews.toLocaleString()}</span>}</div></div>
      </div>

      <div className="tabbs ota-subtabs" role="tablist" aria-label="채널 상세">
        {SUBS.map(s => (
          <button type="button" key={s.id} role="tab" data-sub={s.id} aria-selected={sub === s.id} className={`tabb${sub === s.id ? ' on' : ''}`} onClick={() => onSub(s.id)}>{s.label}</button>
        ))}
        {monthlyOnly && sub !== 'trend' && <span className="pill ota-subtabs-r">월 단위 채널</span>}
      </div>

      <div className="ota-sub">
        {sub === 'trend' && (
          <>
            <TrendBlock data={data} branches={branches} visible={[c.branch]} ota={c.ota} mode={mode} />
            <div className="sec-k" style={{ marginTop: 22 }}>신규 리뷰 수 · 누적 리뷰 증가분</div>
            <NewReviewBars hist={hist} dates={data.dates} mode={mode} color={colorOf(c.branch)} />
          </>
        )}
        {sub === 'rate' && <RatePanel raw={rateRaw} mode={eff} readOnly={readOnly} onInput={onInput} />}
        {sub === 'dist' && <DistPanel raw={data.scoreDist[c.branch]?.[c.ota] ?? []} scale={c.scale} target={c.target} mode={eff} monthlyOnly={monthlyOnly} />}
        {sub === 'complaint' && <ComplaintPanel raw={data.complaints[c.branch]?.[c.ota] ?? []} memo={data.complaintMemos[c.branch]?.[c.ota] ?? ''} mode={eff} monthlyOnly={monthlyOnly} />}
        {sub === 'voc' && <VocPanel rows={data.voc[c.branch]?.[c.ota] ?? []} mode={mode} />}
      </div>
    </>
  )
}

// ── 오른쪽: 기준·스냅샷·입력·원문 ─────────────────────────────────────
function Side({ sel, c, sum, lastDate, prevDate, count, scope, url, readOnly, inputMode, onInput }: {
  sel: Sel; c: ChannelNow | null; sum: BranchSum | null; lastDate: string | null; prevDate: string | null; count: number; scope: string
  url: string | null; readOnly: boolean; inputMode: InputMode; onInput: (m: InputMode) => void
}) {
  const branch = sel.kind === 'item' ? sel.branch : scope === ALL ? null : scope
  const q = branch ? `?branch=${encodeURIComponent(branch)}` : ''
  return (
    <>
      <div>
        <div className="sec-k">기준</div>
        {c ? (
          <div className="std">
            <div className="t">목표 <span className="num">{c.target.toFixed(1)}</span> 이상 · <span className="num">/{c.scale}</span>점</div>
            <div className="s">지금 <span className="num">{fmtScore(c.cur, c.digits)}</span>{c.cur != null && <> · 차이 <span className="num">{fmtDelta(c.cur - c.target, c.digits)}</span></>}</div>
          </div>
        ) : (
          <div className="std">
            <div className="t">목표 <span className="num">{TARGET_INTEGRATED.toFixed(1)}</span> 이상</div>
            <div className="s">5점 만점 채널 <span className="num">4.5</span> 이상</div>
            <div className="s">통합 = <span className="num">10</span>점 환산 · 리뷰 수 가중 평균</div>
            {sum && sum.integ.cur != null && <div className="s">{sum.branch} 지금 <span className="num">{fmtScore(sum.integ.cur, 2)}</span></div>}
          </div>
        )}
      </div>

      <div className="ai">
        <div className="k">최근 스냅샷</div>
        <div className="t num">{lastDate ?? '–'}</div>
        <div className="s">직전 <span className="num">{prevDate ?? '–'}</span> · 누적 <span className="num">{count}</span>회</div>
      </div>

      {c && !readOnly && (
        <div>
          <div className="sec-k">데이터 입력</div>
          <button type="button" className="act pri" onClick={() => onInput(inputMode)}>{INPUT_LABEL[inputMode]} 입력</button>
        </div>
      )}

      {((c && url) || !readOnly) && (
        <div>
          <div className="sec-k">원문 데이터</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {c && url && <a className="lnk" href={url} target="_blank" rel="noopener noreferrer">{c.ota} 페이지 ↗</a>}
            {!readOnly && (
              <>
                <Link className="lnk" href={`/v2/reviews${q}`}>리뷰 원문 ↗</Link>
                <Link className="lnk" href={`/v2/discomfort${q}`}>불편 지수 ↗</Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
