import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import {
  assembleUniverse, coreFrom,
  type DbSnapshot, type StarRow, type ConstellationRow, type MetricRow, type PropertyRow, type ScoreRow,
} from './universeFromDb'
import { buildMetricsView, otaIntegrated, vocWeekly, northMonthly, ALL } from './metrics'
import { metricsPageForLoad } from './metricsPage'
import { METRICS_TEMPLATE } from './viewer/metricsTemplate'
import { UNIVERSE_TEMPLATE } from './viewer/universeTemplate'
import { rowsFromUniverseFiles } from '../../scripts/v2/universe-fixture-rows'

// ── 합성 행 ──────────────────────────────────────────────────────
const PROPS: PropertyRow[] = [
  { property_id: 1, branch: '신설', ota_name: 'Agoda', score_max: 10, active: true },
  { property_id: 2, branch: '신설', ota_name: 'Airbnb', score_max: 5, active: true },
  { property_id: 10, branch: '동대문', ota_name: 'Agoda', score_max: 10, active: true },
]
const star = (o: Partial<StarRow> & { id: string }): StarRow => ({
  review_id: null, branch: '신설', channel: 'Agoda', star_date: '2026-09-01', date_source: 'raw', iso_week: '2026-W36',
  polarity: 'neg', galaxy: '시설', phenomenon: '욕실 물 고임', quote: '물이 고였다', owner: 'FM',
  relation_signal: null, constellation_id: null, ...o,
})
const con = (o: Partial<ConstellationRow> & { id: string }): ConstellationRow => ({
  branch: '신설', polarity: 'neg', galaxy: '시설', name: '욕실 물 고임', owner: 'FM', status: '열림',
  formed_at: '2026-09-10', first_date: '2026-09-01', last_date: '2026-09-20', star_count: null,
  distinct_weeks: 2, recent_4w: 1, monthly: {}, channels: {}, task_id: null,
  observation_start: null, relapse_count: 0, summary: '', sort_order: 1, as_of: '2026-10-12', ...o,
})
const mrow = (branch: string, month: string, channel: string, texts: number, neg: number, weeks: [string, number, number][]): MetricRow => ({
  branch, month, channel, inputs: {
    period: { from: `${month}-02`, to: weeks[weeks.length - 1][0], weeks: weeks.length },
    text_reviews: texts, text_reviews_with_neg_star: neg,
    channel_reviews_delta: weeks.reduce((s, w) => s + w[1], 0), channel_checkouts: weeks.reduce((s, w) => s + w[2], 0),
    weeks: weeks.map(([week, reviews, checkouts]) => ({ week, reviews, checkouts })),
  },
})
const METRICS: MetricRow[] = [
  { branch: '신설', month: '2026-09', channel: '전체', inputs: {} },
  mrow('신설', '2026-09', 'Agoda', 10, 2, [['2026-09-07', 10, 100], ['2026-09-14', 20, 100]]),
  mrow('신설', '2026-10', 'Agoda', 5, 1, [['2026-10-05', 10, 100]]),
  mrow('동대문', '2026-09', 'Agoda', 10, 5, [['2026-09-07', 30, 100], ['2026-09-14', 10, 100]]),
]
const SCORES: ScoreRow[] = [
  { id: 1, property_id: 1, overall_score: 8.6, review_count: 900, recorded_at: '2026-09-07' },
  { id: 2, property_id: 2, overall_score: 4.7, review_count: 100, recorded_at: '2026-09-07' },
  { id: 3, property_id: 10, overall_score: 9.2, review_count: 1000, recorded_at: '2026-09-07' },
  { id: 4, property_id: 1, overall_score: 8.8, review_count: 910, recorded_at: '2026-09-14' },
]
const snap = (): DbSnapshot => ({
  stars: [
    star({ id: 'S-1', constellation_id: 'C-신설-001' }), star({ id: 'S-2', constellation_id: 'C-신설-001' }),
    star({ id: 'S-3', branch: '동대문', galaxy: '청결', constellation_id: 'C-동대문-001' }),
    star({ id: 'S-4', polarity: 'pos', galaxy: '위치/접근성', constellation_id: 'C-신설-002' }),
    star({ id: 'S-5', branch: '동대문', galaxy: '직원서비스', polarity: 'neg' }),
  ],
  constellations: [
    con({ id: 'C-신설-001', status: '재발', observation_start: '2026-09-01', relapse_count: 1 }),
    con({ id: 'C-신설-002', polarity: 'pos', galaxy: '위치/접근성', status: '유지' }),
    con({ id: 'C-동대문-001', branch: '동대문', galaxy: '청결', status: '관찰', observation_start: '2026-09-20' }),
  ],
  events: [], metrics: METRICS, reviews: [], tasks: [], properties: PROPS, scores: SCORES, channelCheckouts: [],
  reviewCounts: { reviews: 10, reviews_with_text: 9 },
})
const viewOf = (db: DbSnapshot) => buildMetricsView(assembleUniverse(db, { now: new Date('2026-10-13T00:00:00Z') }).universe, db)

describe('buildMetricsView — 지점 필터가 6장·은하·보조 줄 전부에 적용된다', () => {
  const v = viewOf(snap())
  it('전체·지점마다 범위가 있다', () => {
    expect(Object.keys(v.scopes)).toEqual([ALL, '신설', '동대문'])
  })
  it('핵심 3개는 지점 별자리만 센다(coreFrom 과 같은 정의)', () => {
    expect(v.scopes[ALL].relapse).toMatchObject({ num: 1, den: 2 })
    expect(v.scopes['신설'].relapse).toMatchObject({ num: 1, den: 1, relapsed_ids: ['C-신설-001'] })
    expect(v.scopes['동대문'].relapse).toMatchObject({ num: 0, den: 1 })
    expect(v.scopes['신설'].keep).toMatchObject({ num: 1, den: 1 })
    expect(v.scopes['동대문'].keep).toMatchObject({ num: 0, den: 0 })
    expect(v.scopes['동대문'].solved).toMatchObject({ value: 0, observing: 1, observing_ids: ['C-동대문-001'] })
    expect(v.scopes['신설'].solved.observing).toBe(0)
  })
  it('북극성은 지점마다 다른 값(우주 화면 북극성이 지점을 안 따르던 버그 방지)', () => {
    // 신설: 9월 2/10·30건 + 10월 1/5·10건 → 채널 합산 15텍스트·3부정 → 0.2×40=8 ÷ 300 → 1−0.02667
    expect(v.scopes['신설'].north.value).toBeCloseTo(1 - (3 / 15 * 40) / 300, 4)
    // 동대문: 5/10 × 40 ÷ 200 = 0.1
    expect(v.scopes['동대문'].north.value).toBeCloseTo(0.9, 4)
    expect(v.scopes[ALL].north.value).not.toBe(v.scopes['신설'].north.value)
    expect(v.scopes['신설'].north.checkouts).toBe(300)
    expect(v.scopes['동대문'].north.est_neg).toBe(20)
  })
  it('VOC 비율 합계와 주별 막대(같은 주는 지점 채널을 더함)', () => {
    expect(v.scopes['신설'].voc).toMatchObject({ ratio: 0.1333, reviews: 40, checkouts: 300 })
    expect(v.scopes[ALL].voc).toMatchObject({ reviews: 80, checkouts: 500, ratio: 0.16 })
    expect(v.scopes[ALL].voc.series.map(b => [b.label, b.reviews, b.checkouts])).toEqual([
      ['2026-09-07', 40, 200], ['2026-09-14', 30, 200], ['2026-10-05', 10, 100],
    ])
    expect(v.scopes['동대문'].voc.series).toHaveLength(2)
  })
  it('북극성 범위: 지점 범위는 그 지점, 전체는 체크아웃 있는 지점만(없는 지점은 제외로 표시)', () => {
    expect(v.scopes['신설'].north).toMatchObject({ included: ['신설'], excluded: [] })
    expect(v.scopes[ALL].north).toMatchObject({ included: ['신설', '동대문'], excluded: [] })
    // 동대문 채널 행이 없는 스냅샷 → 동대문 북극성은 값 없음, 전체에서도 제외
    const db2 = { ...snap(), metrics: METRICS.filter(r => r.branch !== '동대문') }
    const v2 = viewOf(db2)
    expect(v2.scopes['동대문'].north).toMatchObject({ value: null, checkouts: 0, included: [], excluded: ['동대문'] })
    expect(v2.scopes[ALL].north).toMatchObject({ included: ['신설'], excluded: ['동대문'] })
    expect(v2.scopes[ALL].north.value).toBe(v2.scopes['신설'].north.value)
  })
  it('북극성 막대는 월별, 지점 필터를 따른다', () => {
    expect(v.scopes['신설'].north.series.map(b => b.label)).toEqual(['2026-09', '2026-10'])
    expect(v.scopes['동대문'].north.series.map(b => b.value)).toEqual([0.9, null])
    expect(northMonthly(METRICS, PROPS, ['신설', '동대문'], '신설')[1].value).toBeCloseTo(1 - (1 / 5 * 10) / 100, 4)
  })
  it('OTA 평점 = V1 지점 통합 점수(10점 환산·리뷰 수 가중), 9.0 미만 채널 수', () => {
    // 기준일 이전 최신: 신설 Agoda 8.8(910), Airbnb 4.7/5=9.4(100), 동대문 Agoda 9.2(1000)
    expect(v.scopes['신설'].ota.value).toBeCloseTo((8.8 * 910 + 9.4 * 100) / 1010, 4)
    expect(v.scopes['신설'].ota.below).toBe(1)
    expect(v.scopes['동대문'].ota.below).toBe(0)
    expect(v.scopes[ALL].ota.channels).toHaveLength(3)
    expect(v.scopes['신설'].ota.series.map(b => b.label)).toEqual(['2026-09-07', '2026-09-14'])
    expect(v.scopes['신설'].ota.series[0].value).toBeCloseTo((8.6 * 900 + 9.4 * 100) / 1000, 4)
  })
  it('은하 9칸 — 직원서비스는 응대/환대/커뮤니티로, 지점마다 다른 수', () => {
    expect(v.scopes[ALL].galaxies.map(g => g.name)).toHaveLength(9)
    const g = (s: string, n: string) => v.scopes[s].galaxies.find(x => x.name === n)!
    expect(g(ALL, '응대/환대/커뮤니티').neg).toBe(1)
    expect(g('신설', '응대/환대/커뮤니티').neg).toBe(0)
    expect(g('신설', '시설').neg).toBe(2)
    expect(g('동대문', '시설').neg).toBe(0)
    expect(g('신설', '위치/접근성').pos).toBe(1)
  })
  it('마지막 주 라벨 = 월 지표 주 라벨 중 가장 늦은 것', () => {
    expect(v.last_week).toBe('2026-10-05')
  })
})

describe('도구 함수', () => {
  it('otaIntegrated 는 점수 없는 채널을 뺀다, 전부 없으면 null', () => {
    expect(otaIntegrated([])).toBeNull()
    expect(otaIntegrated([{ branch: 'a', channel: 'x', score: null, scale: 10, recorded_at: '2026-01-01', review_count: 1 }])).toBeNull()
  })
  it('vocWeekly 는 체크아웃 0 주를 null 로 둔다(값을 만들지 않음)', () => {
    const rows = [mrow('신설', '2026-09', 'Agoda', 1, 0, [['2026-09-07', 3, 0]])]
    expect(vocWeekly(rows, null)[0].value).toBeNull()
  })
  it('coreFrom 은 씨앗을 세지 않는다', () => {
    expect(coreFrom([{ polarity: 'neg', status: '씨앗', observation_start: '2026-01-01', relapse_count: 1 }]).relapse_rate).toEqual({ num: 0, den: 0 })
  })
})

describe('문서', () => {
  it('지표 템플릿: 데이터 자리 1곳, 외부 주소 없음, Pretendard 자체 호스팅, 화면 탭 두 개', () => {
    expect(METRICS_TEMPLATE.split('/*@@DATA@@*/').length).toBe(2)
    expect(METRICS_TEMPLATE).not.toMatch(/https?:\/\/(?!www\.w3\.org)/)
    expect(METRICS_TEMPLATE).toContain("url('/fonts/Pretendard-Regular.woff2')")
    expect(METRICS_TEMPLATE).toContain('>우주</a>')
    expect(METRICS_TEMPLATE).toContain('>지표</a>')
  })
  it('문구 규칙: 「고객」「목소리」 없음', () => {
    expect(METRICS_TEMPLATE).not.toMatch(/고객|목소리/)
  })
  it('우주 템플릿에도 화면 탭(우주 ↔ 지표)과 임베드 키 유지', () => {
    expect(UNIVERSE_TEMPLATE).toContain('id="v2tab-metrics" href="/v2/metrics"')
    expect(UNIVERSE_TEMPLATE).toContain("'/embed/v2-metrics'+q")
  })
  it('metricsPageForLoad: 적재 전이면 상태 화면, 아니면 데이터를 넣은 문서', () => {
    const empty = metricsPageForLoad({ state: 'empty', reason: 'no_rows', tables: { voc_stars: 0, voc_constellations: 0 } }, METRICS_TEMPLATE)
    expect(empty.state).toBe('empty')
    expect(empty.html).toContain('<title>VOC 지표</title>')
    const v = viewOf(snap())
    const ready = metricsPageForLoad({ state: 'ready', view: v, warnings: [] }, METRICS_TEMPLATE)
    expect(ready.html).not.toContain('/*@@DATA@@*/')
    expect(ready.html).toContain('"last_week":"2026-10-05"')
  })
})

// ── 실데이터(백필 파일) — 재헌 확정 값(2026-10-13)과 같은지 ──────────────
const DATA = 'C:/Users/MGRV/.claude/Output/2026-10-12_voc-v2-build/data'
describe.skipIf(!existsSync(`${DATA}/universe.json`))('백필 데이터 — 지점별 6값', () => {
  const v = viewOf(rowsFromUniverseFiles(DATA))
  const pct = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10)
  it('북극성 95.1 / 95.6 / 94.5', () => {
    expect([ALL, '신설', '동대문'].map(s => pct(v.scopes[s].north.value))).toEqual([95.1, 95.6, 94.5])
  })
  it('VOC 비율 11.3 / 10.3 / 12.7', () => {
    expect([ALL, '신설', '동대문'].map(s => pct(v.scopes[s].voc.ratio))).toEqual([11.3, 10.3, 12.7])
  })
  it('구조 해결 0, 재발 4/5(신설 4/4, 동대문 0/1), 성과 유지 70/74(신설 31/33, 동대문 39/41)', () => {
    expect([ALL, '신설', '동대문'].map(s => v.scopes[s].solved.value)).toEqual([0, 0, 0])
    expect([ALL, '신설', '동대문'].map(s => `${v.scopes[s].relapse.num}/${v.scopes[s].relapse.den}`)).toEqual(['4/5', '4/4', '0/1'])
    expect([ALL, '신설', '동대문'].map(s => `${v.scopes[s].keep.num}/${v.scopes[s].keep.den}`)).toEqual(['70/74', '31/33', '39/41'])
  })
  it('지점을 바꾸면 OTA 평점·은하 값도 바뀐다', () => {
    expect(v.scopes['신설'].ota.value).not.toBe(v.scopes['동대문'].ota.value)
    expect(v.scopes['신설'].galaxies[0].neg).not.toBe(v.scopes['동대문'].galaxies[0].neg)
    expect(v.scopes['신설'].galaxies[0].neg + v.scopes['동대문'].galaxies[0].neg).toBe(v.scopes[ALL].galaxies[0].neg)
  })
})
