// KR4 STAY VOC 주간 점수 — 순수 계산 모듈 (화면 없음, DB 호출 없음).
// 원천 = 주간 러너가 정제해 올린 kr4_reviews(정제 규칙과 원인 분류는 러너 책임). 여기서는 그 행으로 점수만 계산한다.
// 규칙은 현재 로컬 HTML(template.html)과 같은 공식·같은 반올림 시점을 쓴다. 숫자 일치는 lib/kr4.test.ts 가 고정한다.
// 🔴 vitest 가 '@/' 별칭을 못 풀어 이 파일은 상대 경로 import 만 쓴다(lib/weeklyReport.ts 와 같은 규칙).

export const KR4_BRANCHES = ['신설', '동대문', '제주시티', '고성'] as const
export type Kr4Branch = (typeof KR4_BRANCHES)[number]
export type Kr4Mode = 'w' | 'm'

/** kr4_reviews 한 행에서 계산에 쓰는 열만(본문, 번역, 요지는 화면 상세용이라 여기서는 안 씀) */
export interface Kr4Row {
  branch: string
  channel: string
  review_date: string | null
  date_unit: 'day' | 'month'
  assigned_month: string
  collected_date: string
  score10: number
  cause_tags: string[]
  hi_checked: boolean
  /** 아래는 리뷰 상세 표시용(점수 계산에는 안 씀). 숫자 전용 픽스처에는 없다 */
  review_id?: string
  content?: string | null
  content_ko?: string | null
  ko_source?: string | null
  is_foreign?: boolean
  gist?: string | null
}

export interface Kr4Rec {
  id: string
  t: string | null
  tr: string | null
  ts: string | null
  fx: boolean
  g: string | null
  b: string
  c: string
  d: string
  k: 'd' | 'm'
  m: string
  col: string
  s: number
  cat: string[]
  hc: boolean
  /** 일 단위 = 작성일이 속한 주(화~월, 끝 월요일이 키) */
  wd: string | null
  /** 월 단위(에어비앤비 제외) = 수집일이 속한 주 */
  wc: string | null
}

export interface Kr4Data {
  recs: Kr4Rec[]
  last: string
  weeks: string[]
  months: string[]
}

const AIRBNB = '에어비앤비'
const FIRST_MONTH = '2026-07'
export const SOFT = ['불만없음', '코멘트없음', '미분류']
/** 원인 10종 고정 순서(0건도 표시) */
export const CAUSE_ORDER = ['시설', '셀프운영', '청결/냄새', '어메니티', '직원응대', '소음', '가성비', '위치/교통', '객실 기대 불일치', '기타']

// ── 날짜 ────────────────────────────────────────────────────
/** 날짜가 속한 주의 끝(월요일). 주 = 화~월 */
export const wkOf = (d: string): string => {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + ((8 - t.getUTCDay()) % 7))
  return t.toISOString().slice(0, 10)
}
export const addDays = (d: string, n: number): string => {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export const md = (d: string): string => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`
const daysBetween = (x: string, y: string) =>
  Math.round((new Date(y + 'T00:00:00Z').getTime() - new Date(x + 'T00:00:00Z').getTime()) / 864e5) + 1

// ── 데이터 준비 ─────────────────────────────────────────────
/** last = 수집 마감일(kr4_runs.collected_through). 없으면 행의 가장 늦은 수집일 */
/** dash = 대시보드 방식(기본 켬): 월 표기 리뷰를 수집일이 속한 주에 넣는다. 끄면 주간에서 뺀다(주 목록은 그대로) */
export function buildKr4Data(rows: Kr4Row[], last?: string, dash = true): Kr4Data {
  const recs: Kr4Rec[] = rows.map(r => {
    const k = r.date_unit === 'day' ? 'd' : 'm'
    const d = r.review_date ?? ''
    return {
      b: r.branch, c: r.channel, d, k, m: r.assigned_month, col: r.collected_date, s: Number(r.score10),
      cat: r.cause_tags ?? [], hc: !!r.hi_checked,
      id: r.review_id ?? '', t: r.content ?? null, tr: r.content_ko ?? null, ts: r.ko_source ?? null, fx: !!r.is_foreign, g: r.gist ?? null,
      wd: k === 'd' ? wkOf(d) : null,
      wc: k === 'm' && r.channel !== AIRBNB ? wkOf(r.collected_date) : null,
    }
  })
  const weeks = [...new Set(recs.flatMap(r => [r.wd, r.wc]).filter((x): x is string => !!x))].sort()
  if (!dash) recs.forEach(r => { r.wc = null })
  const lastDay = last ?? recs.reduce((a, r) => (r.col > a ? r.col : a), '')
  const months = [...new Set(recs.map(r => r.m))].filter(m => m >= FIRST_MONTH).sort()
  return { recs, last: lastDay.slice(0, 10), weeks, months }
}

// ── 집계 ────────────────────────────────────────────────────
const keyOf = (r: Kr4Rec, mode: Kr4Mode): string | null => (mode === 'w' ? r.wd ?? r.wc : r.m)
export const avg = (rs: Kr4Rec[]): number | null => (rs.length ? rs.reduce((a, r) => a + r.s, 0) / rs.length : null)
export const f2 = (v: number | null): string => (v == null ? '—' : v.toFixed(2))
export type Tone = 'none' | 'red' | 'amber' | 'green'
export const tone = (v: number | null): Tone => (v == null ? 'none' : v < 8.9 ? 'red' : v < 9 ? 'amber' : 'green')
export const isSoft = (r: Kr4Rec) => r.cat.some(c => SOFT.includes(c))
export const isHid = (r: Kr4Rec) => r.s >= 9 && r.cat.length > 0

/** keys 에 속한 행. branches 가 비어 있으면 4개 지점 전체 */
export function rowsFor(d: Kr4Data, mode: Kr4Mode, keys: string[], branches: string[] = []): Kr4Rec[] {
  const ks = new Set(keys)
  return d.recs.filter(r => {
    const k = keyOf(r, mode)
    return !!k && ks.has(k) && (!branches.length || branches.includes(r.b))
  })
}
const periods = (d: Kr4Data, mode: Kr4Mode) => (mode === 'w' ? d.weeks : d.months)
export const latestKey = (d: Kr4Data, mode: Kr4Mode) => {
  const a = periods(d, mode)
  return a[a.length - 1]
}
/** 같은 길이의 바로 앞 기간. 앞에 기간이 모자라면 null */
export function prevKeys(d: Kr4Data, mode: Kr4Mode, keys: string[]): string[] | null {
  const all = periods(d, mode), s = [...keys].sort(), i = all.indexOf(s[0]), n = s.length
  return i - n >= 0 ? all.slice(i - n, i) : null
}
export interface Stat { v: number; n: number }
/** 기간별 평균(소수 2자리 반올림)과 건수. 리뷰 없으면 null */
export function stats(d: Kr4Data, mode: Kr4Mode, keys: string[], branches: string[] = []): (Stat | null)[] {
  return keys.map(k => {
    const r = rowsFor(d, mode, [k], branches)
    return r.length ? { v: +(avg(r) as number).toFixed(2), n: r.length } : null
  })
}

export const scopeName = (bs: string[]) => (!bs.length ? '4개 지점' : bs.join('+') + (bs.length > 1 ? ' 합산' : ''))

export function periodMain(d: Kr4Data, mode: Kr4Mode, keys: string[]): string {
  const s = [...keys].sort(), e = s[s.length - 1]
  if (mode === 'm') {
    const all = d.months, i0 = all.indexOf(s[0]), run = s.every((k, i) => all.indexOf(k) === i0 + i)
    const base = s.length === 1 ? `${+e.slice(5)}월` : run ? `${+s[0].slice(5)}월~${+e.slice(5)}월` : s.map(k => +k.slice(5) + '월').join('+')
    return base + (s.length > 1 ? ` (${s.length}달 합산)` : '')
  }
  const base = `${md(addDays(s[0], -6))}~${md(e)}`
  const nth = d.weeks.filter(w => w.slice(0, 7) === e.slice(0, 7) && w <= e).length
  return base + (s.length > 1 ? ` (${s.length}주 합산)` : ` (${+e.slice(5, 7)}월 ${nth}주차)`)
}

/** 고른 기간이 수집 마감 전에 끝나지 않으면 true(진행 중 기간) */
export const isCut = (d: Kr4Data, mode: Kr4Mode, keys: string[]) => {
  const e = [...keys].sort().pop() as string
  return mode === 'w' ? e >= d.last : e === d.last.slice(0, 7)
}
export function cutNote(d: Kr4Data, mode: Kr4Mode, sel: string[]): string {
  if (!isCut(d, mode, sel)) return ''
  const s = [...sel].sort(), last = d.last
  if (mode === 'w') {
    const n = daysBetween(addDays(s[0], -6), last)
    return n >= 7 ? `${md(last)} 수집분까지, 마지막 날(${md(last)})은 수집 시점까지만` : `${md(last)} 수집분까지, ${n}일치라 직전과 기간이 다름`
  }
  return `${md(last)} 수집분까지, ${+last.slice(8)}일치라 직전과 기간이 다름`
}

// ── 요약 ────────────────────────────────────────────────────
/** 9점 미만이면서 불만이 적힌 리뷰의 원인별 건수(건수 많은 순, 기타는 맨 뒤) */
export function causes(rs: Kr4Rec[]): [string, number][] {
  const cc: Record<string, number> = {}
  rs.filter(r => r.s < 9 && !isSoft(r)).forEach(r => r.cat.forEach(c => (cc[c] = (cc[c] || 0) + 1)))
  return Object.entries(cc).sort((a, b) => Number(a[0] === '기타') - Number(b[0] === '기타') || b[1] - a[1])
}

export type MoveKind = '하락' | '상승' | '유지'
export interface MoveModel {
  kind: MoveKind
  label: string
  rows: { c: string; n: number; p: number }[]
  side: { lab: string; t: string } | null
  /** 원인이 하나도 없을 때 복사 문구에 쓰는 말 */
  empty: string
}
function moveModel(d: Kr4Data, mode: Kr4Mode, sel: string[], branches: string[], rs: Kr4Rec[], pr: Kr4Rec[], delta: number): MoveModel {
  const scope = branches.length ? branches : [...KR4_BRANCHES]
  const cn = Object.fromEntries(causes(rs)), cp = Object.fromEntries(causes(pr))
  const a = +(avg(rs) as number).toFixed(2)
  const br = scope.length < 2 ? [] : scope.map(b => {
    const v = avg(rowsFor(d, mode, sel, [b]))
    return v == null ? null : { b, v: +v.toFixed(2) }
  }).filter((x): x is { b: string; v: number } => !!x)
  const kind: MoveKind = Math.abs(delta) <= 0.05 ? '유지' : delta < 0 ? '하락' : '상승'
  const lo = br.filter(x => x.v < a).sort((x, y) => x.v - y.v), hi = br.filter(x => x.v > a).sort((x, y) => y.v - x.v)
  const side = kind === '하락' && lo.length ? { lab: '평균을 끌어내린 지점', t: lo.map(x => `${x.b} ${x.v.toFixed(2)} (평균보다 ${(a - x.v).toFixed(2)} 낮음)`).join(', ') }
    : kind === '상승' && hi.length ? { lab: '평균을 끌어올린 지점', t: hi.map(x => `${x.b} ${x.v.toFixed(2)} (평균보다 ${(x.v - a).toFixed(2)} 높음)`).join(', ') } : null
  return {
    kind, label: { 하락: '하락 원인', 상승: '상승 원인', 유지: '유지(직전 대비 ±0.05 이내)' }[kind],
    rows: CAUSE_ORDER.map(c => ({ c, n: cn[c] || 0, p: cp[c] || 0 })), side,
    empty: kind === '상승' ? '직전보다 줄어든 불만 없음(리뷰 수 차이일 수 있음)' : '불만 적힌 9점 미만 리뷰 없음',
  }
}

/** 요약 맨 아래 한 줄: 연속 9.0 미만/이상, 최근 6주(달) 중 최고/최저 */
function overall(d: Kr4Data, mode: Kr4Mode, sel: string[], branches: string[]): string | null {
  const all = periods(d, mode), end = [...sel].sort().pop() as string, ks = all.filter(k => k <= end), unit = mode === 'w' ? '주' : '달'
  const st = stats(d, mode, ks, branches), idx = st.map((x, i) => (x ? i : null)).filter((i): i is number => i != null)
  if (!idx.length) return null
  const v = (i: number) => (st[i] as Stat).v, last = idx[idx.length - 1], below = v(last) < 9
  let s = 0
  for (let i = idx.length - 1; i >= 0 && (v(idx[i]) < 9) === below; i--) s++
  const recent = idx.slice(-6), mn = Math.min(...recent.map(v)), mx = Math.max(...recent.map(v))
  const isNow = sel.length === 1 && sel[0] === latestKey(d, mode)
  const me = sel.length > 1 ? '' : `${isNow ? '이번' : '이'} ${unit}${unit === '주' ? '가' : '이'} `
  const tail = ks[last] !== end || recent.length < 2 ? null : v(last) === mn ? `${me}최근 6${unit} 중 최저` : v(last) === mx ? `${me}최근 6${unit} 중 최고` : null
  const parts = [s >= 2 ? `${scopeName(branches)} ${s}${unit} 연속 9.0 ${below ? '미만' : '이상'}` : null, tail].filter(Boolean)
  return parts.length ? (sel.length > 1 ? `마지막 ${unit} 기준 ` : '') + parts.join(', ') : null
}

export interface Kr4Summary {
  per: string
  prevPer: string | null
  cut: boolean
  cn: string
  name: string
  cmp: string
  a: number | null
  pa: number | null
  d: number | null
  n: number
  pn: number
  low: number
  plow: number
  hid: number
  phid: number
  pk: string[] | null
  brs: { b: string; v: number | null }[] | null
  pbrs: { b: string; v: number | null }[] | null
  mv: MoveModel | null
  ov: string | null
}
export function summarize(d: Kr4Data, mode: Kr4Mode, sel: string[], branches: string[]): Kr4Summary {
  const rs = rowsFor(d, mode, sel, branches), a = avg(rs), pk = prevKeys(d, mode, sel), pr = pk ? rowsFor(d, mode, pk, branches) : []
  const pa = avg(pr), delta = a != null && pa != null ? a - pa : null
  const scope = branches.length ? branches : [...KR4_BRANCHES]
  return {
    per: periodMain(d, mode, sel), cut: isCut(d, mode, sel), name: scopeName(branches), a, pa, d: delta,
    cmp: `직전 ${sel.length}${mode === 'w' ? '주' : '달'}`, pk, prevPer: pk ? periodMain(d, mode, pk).replace(/ \(.*\)$/, '') : null,
    cn: pk ? cutNote(d, mode, sel) : '', n: rs.length, pn: pr.length,
    low: rs.filter(r => r.s < 9).length, plow: pr.filter(r => r.s < 9).length, hid: rs.filter(isHid).length, phid: pr.filter(isHid).length,
    brs: branches.length === 1 || !rs.length ? null : scope.map(b => ({ b, v: avg(rowsFor(d, mode, sel, [b])) })),
    pbrs: branches.length === 1 || !rs.length || !pk ? null : scope.map(b => ({ b, v: avg(rowsFor(d, mode, pk, [b])) })),
    mv: rs.length && delta != null ? moveModel(d, mode, sel, branches, rs, pr, delta) : null,
    ov: rs.length ? overall(d, mode, sel, branches) : null,
  }
}

// ── 지점 카드 ───────────────────────────────────────────────
export interface OtaProperty { property_id: number; branch: string; ota_name: string; score_max: number; active?: boolean }
export interface OtaScore { property_id: number; overall_score: number; review_count: number; recorded_at: string }
/** 지점(또는 전체)의 OTA 표시 평점 = 채널별 최신 표시 평점(소수 첫째 자리 반올림, 5점 만점은 ×2)을 리뷰 수로 가중.
 *  🔴 소수 첫째 자리 반올림은 현재 HTML 상수(OTA_AS_OF 값)와 맞추기 위한 잠정 결정이다(박일우 확인 대기). */
export function otaDisplay(props: OtaProperty[], scores: OtaScore[], branch: string | null): Stat | null {
  const latest = new Map<number, OtaScore>()
  for (const s of scores) {
    const cur = latest.get(s.property_id)
    if (!cur || s.recorded_at > cur.recorded_at) latest.set(s.property_id, s)
  }
  let sum = 0, n = 0
  for (const p of props) {
    if (p.active === false || (branch != null && p.branch !== branch)) continue
    const s = latest.get(p.property_id)
    if (!s) continue
    sum += Math.round(Number(s.overall_score) * 10) / 10 * (10 / p.score_max) * s.review_count
    n += s.review_count
  }
  return n ? { v: sum / n, n } : null
}

export interface KpiCell { label: string; v: number | null; n: number }
/** 카드 세 칸: 전체 누적(OTA 표시 평점) · 마지막 수집일이 속한 달 누적 · 이번 주. 기간 선택과 무관 */
export function kpiCells(d: Kr4Data, ota: { props: OtaProperty[]; scores: OtaScore[] }, branch: string | null): KpiCell[] {
  const curM = d.last.slice(0, 7), curW = wkOf(d.last)
  const o = otaDisplay(ota.props, ota.scores, branch)
  const m = d.recs.filter(r => r.m === curM && (branch == null || r.b === branch))
  const w = d.recs.filter(r => (r.wd ?? r.wc) === curW && (branch == null || r.b === branch))
  return [
    { label: '전체 누적', v: o ? o.v : null, n: o ? o.n : 0 },
    { label: `${+curM.slice(5)}월 누적`, v: avg(m), n: m.length },
    { label: '이번 주', v: avg(w), n: w.length },
  ]
}

// ── 추이 ────────────────────────────────────────────────────
/** 가로축 = 고른 기간만. cmpN 이 있으면 고른 기간 앞쪽 n개(직전)를 붙인다 */
export function trendKeys(d: Kr4Data, mode: Kr4Mode, sel: string[], cmpN = 0): { keys: string[]; prev: string[] } {
  const all = periods(d, mode), s = [...sel].sort()
  const i = all.indexOf(s[0])
  const prev = cmpN > 0 ? all.slice(Math.max(0, i - cmpN), i) : []
  return { keys: [...prev, ...all.slice(i, all.indexOf(s[s.length - 1]) + 1)], prev }
}

// ── 리뷰 상세 · 점수대 분포 (현재 HTML 의 BANDS, SOPT, COLS, passF 와 같은 규칙) ──────────
export const BANDS: [string, (r: Kr4Rec) => boolean][] = [
  ['10점', r => r.s >= 10], ['9점대', r => r.s >= 9 && r.s < 10], ['8점대', r => r.s >= 8 && r.s < 9],
  ['7점대', r => r.s >= 7 && r.s < 8], ['6점대 이하', r => r.s < 7],
]
/** 점수 필터 선택지: 키, 이름, 조건 */
export const SOPT: [string, string, (r: Kr4Rec) => boolean][] = [
  ['lo', '9.0 미만', r => r.s < 9], ['hi', '9.0 이상', r => r.s >= 9], ['hid', '9.0 이상, 불만 있음', isHid],
  ...BANDS.map(([l, f], i) => [`b${i}`, l, f] as [string, string, (r: Kr4Rec) => boolean]),
]
/** 리뷰 상세 필터. k = 히트맵에서 누른 기간(그 기간 전체 리뷰로 바뀜), s = 점수 선택지 키, 나머지 = 값 목록(없으면 전체) */
export interface Kr4Filter { k?: string; s?: string; d?: string[]; b?: string[]; c?: string[]; cat?: string[] }
export type Kr4Col = 'd' | 'b' | 'c' | 's' | 'cat'
export const COLV: Record<'d' | 'b' | 'c' | 'cat', (r: Kr4Rec) => string[]> = {
  d: r => [r.k === 'd' ? r.d : '수집'], b: r => [r.b], c: r => [r.c], cat: r => (r.cat.length ? r.cat : ['(없음)']),
}
export const passFilter = (r: Kr4Rec, F: Kr4Filter, skip?: Kr4Col): boolean => {
  if (skip !== 's' && F.s && !(SOPT.find(o => o[0] === F.s) as (typeof SOPT)[number])[2](r)) return false
  for (const c of ['d', 'b', 'c', 'cat'] as const) {
    const f = F[c]
    if (skip !== c && f && !COLV[c](r).some(v => f.includes(v))) return false
  }
  return true
}
/** 리뷰 상세의 바탕 행: 히트맵 칸을 눌렀으면 그 기간 전체, 아니면 고른 기간 */
export const reviewBase = (d: Kr4Data, mode: Kr4Mode, sel: string[], branches: string[], F: Kr4Filter): Kr4Rec[] =>
  F.k ? rowsFor(d, mode, [F.k], branches) : rowsFor(d, mode, sel, branches)
export const rowClass = (r: Kr4Rec): 'lo' | 'mid' | 'hi' => (r.s < 9 ? 'lo' : isHid(r) ? 'mid' : 'hi')

const SCRAPE = /^\s*(Show more|한국어 \(KR\)로 번역하기)\s*$/gm
/** 원문 끝 긁기 잔재 줄을 지운다 */
export const srcText = (s: string | null | undefined): string => String(s ?? '').replace(SCRAPE, '').trim()
/** 요약 칸: 요지가 있으면 요지, 없으면 번역(또는 원문) 첫 줄 40자 */
export function gistOf(r: Kr4Rec): string {
  if (r.g) return r.g
  const f = (r.tr ?? srcText(r.t)).split('\n')[0].trim()
  return f ? f.slice(0, 40) + (f.length > 40 ? '…' : '') : ''
}

// ── 요약 복사 문구 (현재 HTML sumText 와 같은 줄 구성) ────────────────────
const arrowT = (d: number) => `${d < 0 ? '▼' : '▲'}${Math.abs(d).toFixed(2)}`
export function summaryText(d: Kr4Data, M: Kr4Summary): string {
  const per = !M.cut ? M.per : M.per.endsWith(')') ? `${M.per.slice(0, -1)}, ${md(d.last)} 수집분까지)` : `${M.per} (${md(d.last)} 수집분까지)`
  const L = ['요약', `- 기간: ${per}`]
  if (!M.n) { L.push(`- 점수: ${M.name} 리뷰 없음`); return L.join('\n') }
  const brsT = (B: { b: string; v: number | null }[]) => B.map(x => `${x.b} ${x.v == null ? '없음' : f2(x.v)}`).join(' / ')
  L.push(`- 점수: ${M.name} ${f2(M.a)}${M.pk && M.d != null ? ' ' + arrowT(M.d) : ''}`)
  if (M.brs) L.push(`  - ${brsT(M.brs)}`)
  L.push(`- 리뷰 ${M.n}건 중 9점 미만 ${M.low}건`)
  L.push(`- 가려진 리뷰(9.0 이상인데 불만 적힘): ${M.hid}건${M.pk ? ` (직전 ${M.phid}건)` : ''}`)
  if (M.pk) {
    L.push(`- ${M.cmp}: ${M.pa != null ? `${f2(M.pa)}, 리뷰 ${M.pn}건 중 9점 미만 ${M.plow}건` : '리뷰 없음'} (${M.prevPer})`)
    if (M.pbrs) L.push(`  - ${brsT(M.pbrs)}`)
    if (M.cn) L.push(`  (${M.cn.replace(/^.*?수집분까지, /, '')})`)
  }
  if (M.mv) {
    const mv = M.mv, side = mv.side ? `  - ${mv.side.lab}: ${mv.side.t}` : null
    L.push(`- ${mv.label}`)
    if (mv.kind === '상승' && side) L.push(side)
    const nz = mv.rows.filter(x => x.n || x.p)
    if (nz.length) nz.forEach(x => L.push(`  - ${x.c} ${x.n}건 (직전 ${x.p}건)`))
    else L.push(`  - ${mv.empty}`)
    if (mv.kind !== '상승' && side) L.push(side)
  }
  if (M.ov) L.push(`- ${M.ov}`)
  return L.join('\n')
}
