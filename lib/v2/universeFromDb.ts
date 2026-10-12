/**
 * V2 우주 — 운영 DB 행 → 계약 JSON(BRIEF 6절 · data/universe.json 과 같은 모양) 조립
 * ────────────────────────────────────────────────────────────────
 * 읽는 표(전부 SELECT, 쓰기 없음):
 *   새 표   voc_stars · voc_constellations · voc_constellation_events · voc_metrics_monthly
 *   기존 표 reviews(별이 가리키는 리뷰의 계약 칸만) · tasks(연결 과제 제목·상태) ·
 *          ota_properties · ota_scores(가드레일 OTA 평점)
 *
 * 🔴 캐시 없음. unstable_cache·revalidate 를 쓰지 않는다(lib/pageData.ts 상단 주석 — 기록자가 앱 밖이라
 *    무효화가 영원히 안 불린다). 요청마다 DB 에서 읽는다.
 * 🔴 PostgREST 한 응답 상한(db-max-rows 1000)은 .range(0, 9999)로 못 넘는다 — 에러 없이 1000행만 온다.
 *    fetchAllPaged 가 count 를 보며 끝까지 이어 받고, 마지막에 PK 로 정렬한다.
 * 🔴 리뷰어 이름 같은 개인 식별 칸은 조회하지 않는다(COLUMNS.reviews 참고 — reviews 표에는 reviewer 칸이 없고,
 *    raw_reviews 는 읽지 않는다).
 * 🔴 키와 값의 뜻은 scripts/v2/build-universe.ts 가 만든 universe.json 과 같다. 다른 점:
 *    - 설명 문구만 있는 칸(core.basis, north_star.not_computed, guardrails.voice_ratio_not_computed)과
 *      DB 에 원천이 없는 숫자(meta.counts.duplicate_reviews)는 넣지 않는다.
 *    - 가드레일 OTA 평점은 기준일(as_of) 이전 스냅샷 중 최신(기준일과 화면 숫자가 어긋나지 않게).
 *    - 기존 표의 은하 값 「직원서비스」는 「응대/환대/커뮤니티」로 바꿔 부른다(새 표는 이미 새 이름).
 * ────────────────────────────────────────────────────────────────
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { RULES, addDays, compareConstellations, windowStart } from './constellationRules'
import { OTA_SITE_BY_NAME, ratingInChannelScale } from '../otaDetail'

// ─── 고정값 ──────────────────────────────────────────────────────

/** 은하 9개와 순서(확정 결정 4). */
export const GALAXIES = ['청결', '소음', '시설', '응대/환대/커뮤니티', '체크인/체크아웃', '위치/접근성', '어메니티', '가격', '기타'] as const
/** 기존 표 값 → 화면 이름. 기존 표는 바꾸지 않는다. */
export const GALAXY_ALIAS: Record<string, string> = { '직원서비스': '응대/환대/커뮤니티', '직원 서비스': '응대/환대/커뮤니티' }
/** 상태 값 집합(확정 결정 11). 이 밖의 값은 계약 위반 — 조용히 그리지 않고 오류로 멈춘다. */
export const NEG_STATUSES = ['씨앗', '열림', '수행과제 진행', '관찰', '성운', '재발'] as const
export const POS_STATUSES = ['씨앗', '유지', '흐려짐'] as const
/** 은하 안 두 나선팔 순서(B 화면이 meta.branches 순서로 팔을 놓는다). 목록 밖 지점은 이름순으로 뒤에 붙는다. */
export const BRANCH_ORDER = ['신설', '동대문']

const NS_LABEL = '불편 없이 끝난 체류 비율'
const NS_NO_CHANNEL = '체크아웃 데이터가 있는 채널 없음'
const WEEK_BASIS = 'ISO 주(월~일). 주간 리포트 버킷(화~월)과 다름'
const SEED = '씨앗'
const PAGE = 1000
/** reviews 를 id 로 나눠 읽는 묶음 크기 — in.(…) 이 URL 에 들어가므로 길이를 제한한다(uuid 150개 ≈ 5.6KB). */
const ID_CHUNK = 150

/** 각 표에서 읽는 칸. 리뷰는 계약에 필요한 칸만(작성자·국적·객실 칸 없음). */
export const COLUMNS = {
  stars: 'id, review_id, branch, channel, star_date, date_source, iso_week, polarity, galaxy, phenomenon, quote, owner, relation_signal, constellation_id',
  constellations: 'id, branch, polarity, galaxy, name, owner, status, formed_at, first_date, last_date, star_count, distinct_weeks, recent_4w, monthly, channels, task_id, observation_start, relapse_count, summary, sort_order, as_of',
  events: 'id, constellation_id, event_type, event_at, note',
  metrics: 'branch, month, channel, inputs',
  reviews: 'id, branch, ota_site, rating, content, content_ko',
  tasks: 'id, title, status, task_month',
  properties: 'property_id, branch, ota_name, score_max, active',
  scores: 'id, property_id, overall_score, review_count, recorded_at',
} as const

// ─── DB 행 ───────────────────────────────────────────────────────

export interface StarRow {
  id: string
  review_id: string | null
  branch: string
  channel: string | null
  star_date: string
  date_source: string
  iso_week: string
  polarity: string
  galaxy: string
  phenomenon: string
  quote: string
  owner: string
  relation_signal: string | null
  constellation_id: string | null
}

export interface ConstellationRow {
  id: string
  branch: string
  polarity: string
  galaxy: string
  name: string
  owner: string
  status: string
  formed_at: string | null
  first_date: string
  last_date: string
  star_count: number | null
  distinct_weeks: number
  recent_4w: number
  monthly: Record<string, number> | null
  channels: Record<string, number> | null
  task_id: string | null
  observation_start: string | null
  relapse_count: number | null
  summary: string | null
  sort_order: number | null
  as_of: string
}

export interface EventRow {
  id: string
  constellation_id: string
  event_type: string
  event_at: string
  note: string | null
}

export interface MetricWeek { week: string; reviews: number; checkouts: number; ratio?: number }
export interface MetricInputs {
  period?: { from: string; to: string; weeks: number; week_labels?: string[] } | null
  text_reviews?: number
  text_reviews_with_neg_star?: number
  neg_ratio?: number | null
  channel_reviews_delta?: number
  channel_checkouts?: number
  weeks?: MetricWeek[]
}
export interface MetricRow {
  branch: string
  month: string
  channel: string
  inputs: MetricInputs | null
}

export interface ReviewRow {
  id: string
  branch: string
  ota_site: string
  rating: number | string | null
  content: string | null
  content_ko: string | null
}

export interface TaskRow { id: string; title: string; status: string; task_month: string | null }
export interface PropertyRow { property_id: number; branch: string; ota_name: string; score_max: number; active: boolean | null }
export interface ScoreRow { id: number; property_id: number; overall_score: number | string | null; review_count: number | null; recorded_at: string }
export interface ReviewCounts { reviews: number; reviews_with_text: number }

export interface DbSnapshot {
  stars: StarRow[]
  constellations: ConstellationRow[]
  events: EventRow[]
  metrics: MetricRow[]
  reviews: ReviewRow[]
  tasks: TaskRow[]
  properties: PropertyRow[]
  scores: ScoreRow[]
  reviewCounts: ReviewCounts
}

// ─── 계약 JSON ───────────────────────────────────────────────────

export type Polarity = 'neg' | 'pos'

export interface UniverseStar {
  id: string
  review_id: string | null
  branch: string
  channel: string | null
  date: string
  date_source: string
  week: string
  polarity: Polarity
  galaxy: string
  phenomenon: string
  quote: string
  owner: string
  relation_signal: string | null
  constellation_id: string | null
}

export interface UniverseTask { id: string; title: string; status: string; task_month: string | null }
export interface UniverseHistory { type: string; at: string; note: string }

export interface UniverseConstellation {
  id: string
  branch: string
  galaxy: string
  name: string
  polarity: Polarity
  status: string
  star_ids: string[]
  first_date: string
  last_date: string
  distinct_weeks: number
  recent_4w: number
  monthly: Record<string, number>
  channels: Record<string, number>
  owner: string
  task: UniverseTask | null
  summary: string
  history: UniverseHistory[]
  formed_at: string | null
  relapse_count: number
  observation_start: string | null
  order: number | null
}

export interface UniverseReview {
  branch: string
  channel: string
  date: string
  date_source: string
  rating: number | null
  scale: number
  text_ko: string | null
  text_orig: string | null
}

export interface UniverseGalaxy {
  id: string
  name: string
  order: number
  stars: number
  neg: number
  pos: number
  constellations: number
  nebulae: number
  seeds: number
}

export interface NorthStar {
  label: string
  value: number | null
  scope: string
  is_estimate: boolean
  inputs: {
    text_reviews: number
    text_reviews_with_neg_star: number
    neg_ratio: number | null
    channel_reviews_delta: number
    channel_checkouts: number
    est_neg_stays: number | null
  } | null
}

export interface OtaRating { branch: string; channel: string; score: number | null; scale: number; recorded_at: string; review_count: number | null }
export interface VoiceRatio { branch: string; channel: string; ratio: number | null; weeks: number; reviews: number; checkouts: number; period: { from: string; to: string } }
export interface Fraction { num: number; den: number }

export interface Universe {
  meta: {
    as_of: string
    generated_at: string
    branches: string[]
    period: { from: string; to: string }
    rules: { seed: number; constellation_min: number; distinct_weeks: number; window_days: number }
    counts: {
      reviews: number
      reviews_with_text: number
      reviews_with_stars: number
      stars: number
      neg: number
      pos: number
      constellations: number
      constellations_neg: number
      constellations_pos: number
      seeds: number
      singles: number
    }
    week_basis: string
    window: { from: string; to: string }
  }
  north_star: NorthStar
  core: { structural_solved: number; relapse_rate: Fraction; keep_rate: Fraction }
  guardrails: { ota_rating: OtaRating[]; voice_ratio: VoiceRatio[] }
  galaxies: UniverseGalaxy[]
  constellations: UniverseConstellation[]
  stars: UniverseStar[]
  reviews: Record<string, UniverseReview>
}

export type UniverseLoad =
  | { state: 'ready'; universe: Universe; warnings: string[] }
  | { state: 'empty'; reason: 'no_rows' | 'tables_missing'; tables: Record<string, number | null> }

// ─── 작은 도구 ───────────────────────────────────────────────────

const cmp = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0)
const round = (v: number, digits: number) => { const k = 10 ** digits; return Math.round(v * k) / k }
const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0 }
const SITE_TO_CHANNEL: Record<string, string> = Object.fromEntries(Object.entries(OTA_SITE_BY_NAME).map(([name, site]) => [site, name]))

/** reviews.ota_site(한국어 표기) → 채널 코드(ota_properties.ota_name). build-universe·load-universe 와 같은 대응. */
export function channelOfSite(site: string): string {
  return SITE_TO_CHANNEL[site] ?? site
}

export function galaxyName(g: string | null | undefined): string {
  const v = (g ?? '').trim()
  return GALAXY_ALIAS[v] ?? v
}

/** 연결 과제 제목에서 「[지점] 수행과제 — 」 머리말을 뗀다(build-universe 와 같은 표시). */
export function stripTaskTitle(title: string): string {
  return title.replace(/^\[[^\]]+\] 수행과제 — /, '')
}

function branchList(names: Iterable<string>): string[] {
  const set = new Set(names)
  const known = BRANCH_ORDER.filter(b => set.has(b))
  const extra = [...set].filter(b => !BRANCH_ORDER.includes(b)).sort((a, b) => a.localeCompare(b))
  return [...known, ...extra]
}

function polarityOf(v: string, where: string): Polarity {
  if (v === 'neg' || v === 'pos') return v
  throw new Error(`${where}: polarity 값이 계약 밖(${JSON.stringify(v)})`)
}

/** 은하 9개 안의 이름으로. 옛 이름은 새 이름으로 바꿔 부르고, 9개 밖이면 「기타」에 두고 경고를 남긴다. */
function knownGalaxy(g: string, where: string, warnings: string[]): string {
  const name = galaxyName(g)
  if ((GALAXIES as readonly string[]).includes(name)) return name
  warnings.push(`${where}: 은하 「${name}」 → 기타`)
  return '기타'
}

function eventSeq(id: string): number {
  const m = /#(\d+)$/.exec(id)
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
}

// ─── 1000행 상한을 넘는 전량 조회 ─────────────────────────────────

export interface PageResult<T> {
  data: T[] | null
  error: { message: string; code?: string } | null
  count?: number | null
}

export class DbReadError extends Error {
  code: string | undefined
  constructor(label: string, error: { message: string; code?: string }) {
    super(`${label} 조회 실패: ${error.message}`)
    this.name = 'DbReadError'
    this.code = error.code
  }
}

/**
 * 한 표를 끝까지 읽는다.
 *  - fetchPage(from, to) 는 PK 정렬을 건 질의에 .range(from, to) 를 붙여 돌려준다(count: 'exact' 권장).
 *  - 서버 상한이 페이지 크기보다 작아도 잘리지 않게, count 가 있으면 받은 행 수가 count 에 닿을 때까지
 *    받은 만큼 앞으로 간다(상한이 1000 보다 작게 바뀌어도 「1000 미만이면 끝」 판정으로 끊기지 않는다).
 *  - 페이지 경계에서 같은 행이 두 번 오면 PK 로 하나만 남기고, 마지막에 PK 로 정렬한다.
 */
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  keyOf: (row: T) => string | number,
  opts: { pageSize?: number; label?: string; maxPages?: number } = {},
): Promise<T[]> {
  const size = opts.pageSize ?? PAGE
  const label = opts.label ?? '표'
  const maxPages = opts.maxPages ?? 500
  const byKey = new Map<string | number, T>()
  let from = 0
  let total: number | null = null
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new Error(`${label}: ${maxPages}쪽을 넘게 이어 받음 — 중단`)
    const { data, error, count } = await fetchPage(from, from + size - 1)
    if (error) throw new DbReadError(label, error)
    if (typeof count === 'number') total = count
    const rows = data ?? []
    for (const r of rows) byKey.set(keyOf(r), r)
    from += rows.length
    if (rows.length === 0) break
    if (total != null ? from >= total : rows.length < size) break
  }
  return [...byKey.entries()].sort((a, b) => cmp(a[0], b[0])).map(e => e[1])
}

// ─── 지표 ────────────────────────────────────────────────────────

interface ChannelAgg {
  branch: string
  channel: string
  texts: number
  neg: number
  delta: number
  checkouts: number
  from: string | null
  to: string | null
  periodWeeks: number
  weeks: Map<string, MetricWeek>
}

/** voc_metrics_monthly 의 채널 행(channel ≠ '전체')을 채널별로 모은다. 순서 = ota_properties.property_id 순. */
function channelAggregates(rows: MetricRow[], properties: PropertyRow[]): ChannelAgg[] {
  const order = new Map(properties.map(p => [`${p.branch}|${p.ota_name}`, p.property_id]))
  const byKey = new Map<string, ChannelAgg>()
  for (const r of rows) {
    if (r.channel === '전체' || !r.inputs || typeof r.inputs.text_reviews !== 'number') continue
    const k = `${r.branch}|${r.channel}`
    if (!byKey.has(k)) {
      byKey.set(k, { branch: r.branch, channel: r.channel, texts: 0, neg: 0, delta: 0, checkouts: 0, from: null, to: null, periodWeeks: 0, weeks: new Map() })
    }
    const a = byKey.get(k)!
    const i = r.inputs
    a.texts += num(i.text_reviews)
    a.neg += num(i.text_reviews_with_neg_star)
    a.delta += num(i.channel_reviews_delta)
    a.checkouts += num(i.channel_checkouts)
    if (i.period) {
      if (a.from == null || i.period.from < a.from) a.from = i.period.from
      if (a.to == null || i.period.to > a.to) a.to = i.period.to
      a.periodWeeks += num(i.period.weeks)
    }
    for (const w of i.weeks ?? []) a.weeks.set(w.week, w)
  }
  return [...byKey.values()].sort((x, y) =>
    (order.get(`${x.branch}|${x.channel}`) ?? Number.MAX_SAFE_INTEGER) - (order.get(`${y.branch}|${y.channel}`) ?? Number.MAX_SAFE_INTEGER) ||
    cmp(`${x.branch}|${x.channel}`, `${y.branch}|${y.channel}`))
}

/**
 * 북극성(첫 가동 추정, 확정 결정 9) — 월 행의 산출 근거(inputs)를 채널별로 더해 다시 계산한다.
 *   1 − Σ채널(원문 리뷰 중 부정 별 있는 리뷰 비율 × 그 채널 전체 리뷰 증가분) ÷ Σ채널 OTA 채널 체크아웃
 * 채널이 하나면 compute-metrics.ts 의 값과 같은 계산이다(채널 여럿이면 합산 — 판단 기록).
 */
export function northStarFromMetrics(rows: MetricRow[], properties: PropertyRow[]): NorthStar {
  const aggs = channelAggregates(rows, properties).filter(a => a.texts > 0 && a.checkouts > 0)
  if (aggs.length === 0) return { label: NS_LABEL, value: null, scope: NS_NO_CHANNEL, is_estimate: true, inputs: null }
  const texts = aggs.reduce((s, a) => s + a.texts, 0)
  const neg = aggs.reduce((s, a) => s + a.neg, 0)
  const delta = aggs.reduce((s, a) => s + a.delta, 0)
  const checkouts = aggs.reduce((s, a) => s + a.checkouts, 0)
  const estNeg = aggs.reduce((s, a) => s + (a.neg / a.texts) * a.delta, 0)
  const from = aggs.map(a => a.from).filter((v): v is string => !!v).sort()[0] ?? ''
  const to = aggs.map(a => a.to).filter((v): v is string => !!v).sort().pop() ?? ''
  const scope = aggs.length === 1
    ? `${aggs[0].branch} ${aggs[0].channel}만(체크아웃 데이터가 있는 유일한 채널) · ${from}~${to} ${aggs[0].periodWeeks}주 · 리뷰 1건=체류 1건 추정`
    : `${aggs.map(a => `${a.branch} ${a.channel}`).join('·')}(체크아웃 데이터가 있는 채널) · ${from}~${to} · 리뷰 1건=체류 1건 추정`
  return {
    label: NS_LABEL,
    value: round(1 - estNeg / checkouts, 4),
    scope,
    is_estimate: true,
    inputs: {
      text_reviews: texts,
      text_reviews_with_neg_star: neg,
      neg_ratio: round(neg / texts, 4),
      channel_reviews_delta: delta,
      channel_checkouts: checkouts,
      est_neg_stays: round(estNeg, 1),
    },
  }
}

/** 목소리 비율(V1 리뷰 작성률과 같은 계산) — 채널별 주 행(inputs.weeks)을 더한다. */
export function voiceRatioFromMetrics(rows: MetricRow[], properties: PropertyRow[]): VoiceRatio[] {
  return channelAggregates(rows, properties)
    .filter(a => a.weeks.size > 0)
    .map(a => {
      const weeks = [...a.weeks.values()]
      const reviews = weeks.reduce((s, w) => s + num(w.reviews), 0)
      const checkouts = weeks.reduce((s, w) => s + num(w.checkouts), 0)
      return {
        branch: a.branch, channel: a.channel,
        ratio: checkouts ? round(reviews / checkouts, 4) : null,
        weeks: weeks.length, reviews, checkouts,
        period: { from: a.from ?? '', to: a.to ?? '' },
      }
    })
}

/** OTA 평점(가드레일, 목표로 쫓지 않음) — 지점 채널마다 기준일 이전 최신 스냅샷. 순서 = property_id. */
export function otaRatingFrom(properties: PropertyRow[], scores: ScoreRow[], branches: string[], asOf: string): OtaRating[] {
  const props = properties.filter(p => branches.includes(p.branch) && p.active).sort((a, b) => a.property_id - b.property_id)
  const out: OtaRating[] = []
  for (const p of props) {
    let last: ScoreRow | null = null
    for (const s of scores) {
      if (s.property_id !== p.property_id || s.recorded_at > asOf) continue
      if (!last || s.recorded_at > last.recorded_at || (s.recorded_at === last.recorded_at && s.id > last.id)) last = s
    }
    if (!last) continue
    out.push({
      branch: p.branch, channel: p.ota_name,
      score: last.overall_score == null ? null : Number(last.overall_score),
      scale: p.score_max, recorded_at: last.recorded_at, review_count: last.review_count,
    })
  }
  return out
}

// ─── 조립(순수 함수) ─────────────────────────────────────────────

/**
 * DB 행 → 계약 JSON. 순수 함수(DB·시계 무관 — now 는 generated_at 에만 쓴다).
 * 계약 위반(상태·극성 값이 계약 밖)은 오류로 멈춘다. 데이터 누락(리뷰 행 없음 등)은 warnings 로 돌려준다.
 */
export function assembleUniverse(db: DbSnapshot, opts: { now?: Date } = {}): { universe: Universe; warnings: string[] } {
  const warnings: string[] = []
  const now = opts.now ?? new Date()
  if (db.stars.length === 0) throw new Error('별 0행 — 조립하지 않는다(적재 전은 빈 우주 대신 empty 상태)')

  // ── 별자리(행) ──
  const conRows = [...db.constellations].sort((a, b) => cmp(a.id, b.id))
  const conIds = new Set(conRows.map(c => c.id))

  // ── 별 ──
  const stars: UniverseStar[] = [...db.stars].sort((a, b) => cmp(a.id, b.id)).map(s => {
    let cid = s.constellation_id
    if (cid && !conIds.has(cid)) {
      warnings.push(`별 ${s.id}: 없는 별자리 ${cid} 를 가리킴 → 단발로 둠`)
      cid = null
    }
    return {
      id: s.id, review_id: s.review_id, branch: s.branch, channel: s.channel, date: s.star_date,
      date_source: s.date_source, week: s.iso_week, polarity: polarityOf(s.polarity, `별 ${s.id}`),
      galaxy: knownGalaxy(s.galaxy, `별 ${s.id}`, warnings),
      phenomenon: s.phenomenon, quote: s.quote, owner: s.owner, relation_signal: s.relation_signal, constellation_id: cid,
    }
  })
  const starsByCon = new Map<string, UniverseStar[]>()
  for (const s of stars) {
    if (!s.constellation_id) continue
    if (!starsByCon.has(s.constellation_id)) starsByCon.set(s.constellation_id, [])
    starsByCon.get(s.constellation_id)!.push(s)
  }

  // ── 기준일·지점·기간 ──
  const asOfs = [...new Set(conRows.map(c => c.as_of).filter(Boolean))].sort()
  if (asOfs.length > 1) warnings.push(`별자리 기준일이 여러 개(${asOfs.join(', ')}) → 가장 늦은 날을 씀`)
  const starDates = stars.map(s => s.date).sort()
  const asOf = asOfs[asOfs.length - 1] ?? starDates[starDates.length - 1]
  const branches = branchList([...stars.map(s => s.branch), ...conRows.map(c => c.branch)])
  // 기간 첫날 = 월 지표 표의 첫 달 1일(백필 시작). 월 지표가 없으면 첫 별이 든 달의 1일.
  const months = [...new Set(db.metrics.map(m => m.month))].sort()
  const periodFrom = months.length ? `${months[0]}-01` : `${starDates[0].substring(0, 7)}-01`

  // ── 이력·과제 ──
  const eventsByCon = new Map<string, EventRow[]>()
  for (const e of db.events) {
    if (!eventsByCon.has(e.constellation_id)) eventsByCon.set(e.constellation_id, [])
    eventsByCon.get(e.constellation_id)!.push(e)
  }
  const taskById = new Map(db.tasks.map(t => [t.id, t]))

  // ── 별자리 ──
  const constellations: UniverseConstellation[] = conRows.map(c => {
    const polarity = polarityOf(c.polarity, `별자리 ${c.id}`)
    const allowed: readonly string[] = polarity === 'neg' ? NEG_STATUSES : POS_STATUSES
    if (!allowed.includes(c.status)) throw new Error(`별자리 ${c.id}: ${polarity} 상태 값이 계약 밖(${JSON.stringify(c.status)})`)
    const members = (starsByCon.get(c.id) ?? []).slice().sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id))
    if (c.star_count != null && c.star_count !== members.length) {
      warnings.push(`별자리 ${c.id}: star_count ${c.star_count} ≠ 붙은 별 ${members.length}`)
    }
    let task: UniverseTask | null = null
    if (c.task_id) {
      const t = taskById.get(c.task_id)
      if (t) task = { id: t.id, title: stripTaskTitle(t.title), status: t.status, task_month: t.task_month }
      else warnings.push(`별자리 ${c.id}: 연결 과제 ${c.task_id} 가 tasks 에 없음 → 과제 없이 표시`)
    }
    const history = (eventsByCon.get(c.id) ?? [])
      .slice()
      .sort((a, b) => eventSeq(a.id) - eventSeq(b.id) || cmp(a.event_at, b.event_at) || cmp(a.id, b.id))
      .map(e => ({ type: e.event_type, at: e.event_at, note: e.note ?? '' }))
    return {
      id: c.id, branch: c.branch,
      galaxy: knownGalaxy(c.galaxy, `별자리 ${c.id}`, warnings),
      name: c.name, polarity, status: c.status,
      star_ids: members.map(s => s.id),
      first_date: c.first_date, last_date: c.last_date,
      distinct_weeks: c.distinct_weeks, recent_4w: c.recent_4w,
      monthly: c.monthly && typeof c.monthly === 'object' ? c.monthly : {},
      channels: c.channels && typeof c.channels === 'object' ? c.channels : {},
      owner: c.owner, task, summary: c.summary ?? '', history,
      formed_at: c.formed_at, relapse_count: c.relapse_count ?? 0, observation_start: c.observation_start,
      order: c.sort_order,
    }
  })
  // 화면 순서: 지점 → 극성 → 최근 4주 별 수 → 최근 순 → 이름(build-universe 와 같은 비교)
  constellations.sort((a, b) =>
    a.branch.localeCompare(b.branch) || a.polarity.localeCompare(b.polarity) ||
    compareConstellations({ recent4w: a.recent_4w, lastDate: a.last_date, name: a.name }, { recent4w: b.recent_4w, lastDate: b.last_date, name: b.name }))

  // ── 리뷰(별이 있는 리뷰만, 계약 칸만) ──
  const scaleOf = new Map(db.properties.map(p => [`${p.branch}|${p.ota_name}`, p.score_max]))
  const reviewRow = new Map(db.reviews.map(r => [r.id, r]))
  const firstStarOfReview = new Map<string, UniverseStar>()
  for (const s of stars) if (s.review_id && !firstStarOfReview.has(s.review_id)) firstStarOfReview.set(s.review_id, s)
  const reviewEntries: [string, UniverseReview][] = []
  for (const [rid, s] of firstStarOfReview) {
    const r = reviewRow.get(rid)
    if (!r) { warnings.push(`리뷰 ${rid}: reviews 에 없음(별 ${s.id})`); continue }
    const channel = channelOfSite(r.ota_site)
    if (s.channel && s.channel !== channel) warnings.push(`리뷰 ${rid}: 채널 ${channel} ≠ 별 ${s.id} 채널 ${s.channel}`)
    if (r.branch !== s.branch) warnings.push(`리뷰 ${rid}: 지점 ${r.branch} ≠ 별 ${s.id} 지점 ${s.branch}`)
    const scale = scaleOf.get(`${r.branch}|${channel}`) ?? 10
    reviewEntries.push([rid, {
      branch: r.branch, channel, date: s.date, date_source: s.date_source,
      rating: ratingInChannelScale(r.rating, scale), scale, text_ko: r.content_ko, text_orig: r.content,
    }])
  }
  reviewEntries.sort((a, b) => a[1].branch.localeCompare(b[1].branch) || cmp(a[1].date, b[1].date) || cmp(a[0], b[0]))
  const reviews: Record<string, UniverseReview> = Object.fromEntries(reviewEntries)

  // ── 은하 ──
  const formed = constellations.filter(c => c.status !== SEED)
  const galaxies: UniverseGalaxy[] = GALAXIES.map((name, order) => {
    const gs = stars.filter(s => s.galaxy === name)
    const gc = formed.filter(c => c.galaxy === name)
    return {
      id: name, name, order,
      stars: gs.length, neg: gs.filter(s => s.polarity === 'neg').length, pos: gs.filter(s => s.polarity === 'pos').length,
      constellations: gc.length, nebulae: gc.filter(c => c.status === '성운').length,
      seeds: constellations.filter(c => c.galaxy === name && c.status === SEED).length,
    }
  })

  // ── 핵심 지표(build-universe 와 같은 정의) ──
  const negC = formed.filter(c => c.polarity === 'neg')
  const posC = formed.filter(c => c.polarity === 'pos')
  const observed = negC.filter(c => c.observation_start)
  const core = {
    structural_solved: negC.filter(c => c.status === '성운').length,
    relapse_rate: { num: observed.filter(c => c.relapse_count > 0).length, den: observed.length },
    keep_rate: { num: posC.filter(c => c.status === '유지').length, den: posC.length },
  }

  const universe: Universe = {
    meta: {
      as_of: asOf,
      generated_at: now.toISOString(),
      branches,
      period: { from: periodFrom, to: asOf },
      rules: { seed: RULES.seed, constellation_min: RULES.constellationMin, distinct_weeks: RULES.distinctWeeks, window_days: RULES.windowDays },
      counts: {
        reviews: db.reviewCounts.reviews,
        reviews_with_text: db.reviewCounts.reviews_with_text,
        reviews_with_stars: reviewEntries.length,
        stars: stars.length,
        neg: stars.filter(s => s.polarity === 'neg').length,
        pos: stars.filter(s => s.polarity === 'pos').length,
        constellations: formed.length,
        constellations_neg: negC.length,
        constellations_pos: posC.length,
        seeds: constellations.length - formed.length,
        singles: stars.filter(s => !s.constellation_id).length,
      },
      week_basis: WEEK_BASIS,
      window: { from: windowStart(asOf), to: asOf },
    },
    north_star: northStarFromMetrics(db.metrics, db.properties),
    core,
    guardrails: {
      ota_rating: otaRatingFrom(db.properties, db.scores, branches, asOf),
      voice_ratio: voiceRatioFromMetrics(db.metrics, db.properties),
    },
    galaxies,
    constellations,
    stars,
    reviews,
  }
  return { universe, warnings }
}

// ─── DB 읽기 ─────────────────────────────────────────────────────

/** 표가 아직 없다는 오류인가(마이그레이션 전). 칸 이름 오류(42703) 같은 다른 오류는 그대로 올린다. */
export function isMissingTableError(e: unknown): boolean {
  if (!(e instanceof DbReadError)) return false
  return e.code === 'PGRST205' || e.code === '42P01' || /Could not find the table|relation .* does not exist/i.test(e.message)
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/**
 * 운영 DB 에서 읽어 조립한다. 요청마다 새로 읽는다(캐시 없음).
 * 별이 0행이면(적재 전) 빈 우주 대신 state 'empty' 를 돌려준다. 새 표가 아직 없어도 'empty'(tables_missing).
 */
export async function loadUniverseFromDb(client: SupabaseClient, opts: { now?: Date; pageSize?: number } = {}): Promise<UniverseLoad> {
  const pageSize = opts.pageSize ?? PAGE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paged = <T>(table: string, columns: string, order: string[], keyOf: (r: T) => string | number, shape?: (q: any) => any) =>
    fetchAllPaged<T>((from, to) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = client.from(table).select(columns, { count: 'exact' })
      if (shape) q = shape(q)
      for (const c of order) q = q.order(c, { ascending: true })
      return q.range(from, to)
    }, keyOf, { pageSize, label: table })

  const base = await Promise.all([
    paged<StarRow>('voc_stars', COLUMNS.stars, ['id'], r => r.id),
    paged<ConstellationRow>('voc_constellations', COLUMNS.constellations, ['id'], r => r.id),
    paged<EventRow>('voc_constellation_events', COLUMNS.events, ['id'], r => r.id),
    paged<MetricRow>('voc_metrics_monthly', COLUMNS.metrics, ['branch', 'month', 'channel'], r => `${r.branch}|${r.month}|${r.channel}`),
  ]).catch((e: unknown) => {
    if (isMissingTableError(e)) return null
    throw e
  })
  if (!base) {
    return { state: 'empty', reason: 'tables_missing', tables: { voc_stars: null, voc_constellations: null, voc_constellation_events: null, voc_metrics_monthly: null } }
  }
  const [stars, constellations, events, metrics] = base
  if (stars.length === 0) {
    return {
      state: 'empty', reason: 'no_rows',
      tables: { voc_stars: 0, voc_constellations: constellations.length, voc_constellation_events: events.length, voc_metrics_monthly: metrics.length },
    }
  }

  const branches = branchList([...stars.map(s => s.branch), ...constellations.map(c => c.branch)])
  const asOf = constellations.map(c => c.as_of).filter(Boolean).sort().pop() ?? stars.map(s => s.star_date).sort().pop()!
  const months = [...new Set(metrics.map(m => m.month))].sort()
  const fromMonth = months[0] ?? stars.map(s => s.star_date).sort()[0].substring(0, 7)
  // 기준일(한국 시각) 끝까지 들어온 리뷰만 센다 — 기준일 뒤 파싱된 리뷰는 별 추출 전이다.
  const cutoff = `${addDays(asOf, 1)}T00:00:00+09:00`

  const properties = await paged<PropertyRow>('ota_properties', COLUMNS.properties, ['property_id'], r => r.property_id)
  const propIds = properties.filter(p => branches.includes(p.branch)).map(p => p.property_id)
  const reviewIds = [...new Set(stars.map(s => s.review_id).filter((v): v is string => !!v))]
  const taskIds = [...new Set(constellations.map(c => c.task_id).filter((v): v is string => !!v))]

  const readByIds = async <T>(table: string, columns: string, ids: string[]): Promise<T[]> => {
    const parts = await Promise.all(chunk(ids, ID_CHUNK).map(async part => {
      const { data, error } = await client.from(table).select(columns).in('id', part)
      if (error) throw new DbReadError(table, error)
      return (data ?? []) as unknown as T[]
    }))
    return parts.flat()
  }
  const countReviews = async (withText: boolean): Promise<number> => {
    let q = client.from('reviews').select('id', { count: 'exact', head: true })
      .in('branch', branches).gte('review_month', fromMonth).lte('review_month', asOf.substring(0, 7)).lt('created_at', cutoff)
    if (withText) q = q.not('content', 'is', null).neq('content', '')
    const { count, error } = await q
    if (error) throw new DbReadError('reviews(건수)', error)
    return count ?? 0
  }

  const [reviews, tasks, scores, nReviews, nWithText] = await Promise.all([
    readByIds<ReviewRow>('reviews', COLUMNS.reviews, reviewIds),
    readByIds<TaskRow>('tasks', COLUMNS.tasks, taskIds),
    propIds.length
      ? paged<ScoreRow>('ota_scores', COLUMNS.scores, ['id'], r => r.id, q => q.in('property_id', propIds).lte('recorded_at', asOf))
      : Promise.resolve([] as ScoreRow[]),
    countReviews(false),
    countReviews(true),
  ])

  const { universe, warnings } = assembleUniverse({
    stars, constellations, events, metrics, reviews, tasks, properties, scores,
    reviewCounts: { reviews: nReviews, reviews_with_text: nWithText },
  }, { now: opts.now })
  return { state: 'ready', universe, warnings }
}
