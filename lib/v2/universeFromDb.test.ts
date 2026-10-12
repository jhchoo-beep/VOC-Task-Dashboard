import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assembleUniverse, fetchAllPaged, loadUniverseFromDb, isMissingTableError, DbReadError,
  northStarFromMetrics, voiceRatioFromMetrics, otaRatingFrom,
  COLUMNS, GALAXIES, NEG_STATUSES, POS_STATUSES,
  type DbSnapshot, type StarRow, type ConstellationRow, type MetricRow, type PropertyRow, type ScoreRow, type ReviewRow,
} from './universeFromDb'

// ── 합성 행 ──────────────────────────────────────────────────────
const PROPS: PropertyRow[] = [
  { property_id: 1, branch: '신설', ota_name: 'Agoda', score_max: 10, active: true },
  { property_id: 2, branch: '동대문', ota_name: 'Airbnb', score_max: 5, active: true },
  { property_id: 9, branch: '신설', ota_name: 'Airbnb', score_max: 5, active: true },
  { property_id: 10, branch: '동대문', ota_name: 'Agoda', score_max: 10, active: true },
  { property_id: 11, branch: '고성', ota_name: 'Agoda', score_max: 10, active: true },
]

const star = (o: Partial<StarRow> & { id: string }): StarRow => ({
  review_id: 'r-1', branch: '신설', channel: 'Agoda', star_date: '2026-09-01', date_source: 'raw', iso_week: '2026-W36',
  polarity: 'neg', galaxy: '시설', phenomenon: '욕실 샤워 후 물 고임', quote: '물이 고였다', owner: 'FM',
  relation_signal: null, constellation_id: null, ...o,
})

const con = (o: Partial<ConstellationRow> & { id: string }): ConstellationRow => ({
  branch: '신설', polarity: 'neg', galaxy: '시설', name: '욕실 샤워 후 물 고임', owner: 'FM', status: '열림',
  formed_at: '2026-09-10', first_date: '2026-09-01', last_date: '2026-09-20', star_count: null,
  distinct_weeks: 2, recent_4w: 1, monthly: { '2026-09': 3 }, channels: { Agoda: 3 }, task_id: null,
  observation_start: null, relapse_count: 0, summary: '샤워 뒤 욕실 바닥에 물이 고인다는 목소리', sort_order: 1, as_of: '2026-10-12', ...o,
})

const review = (o: Partial<ReviewRow> & { id: string }): ReviewRow => ({
  branch: '신설', ota_site: '아고다', rating: 6, content: 'water pooled', content_ko: '물이 고였다', ...o,
})

const snapshot = (o: Partial<DbSnapshot>): DbSnapshot => ({
  stars: [], constellations: [], events: [], metrics: [], reviews: [], tasks: [], properties: PROPS, scores: [],
  reviewCounts: { reviews: 723, reviews_with_text: 674 }, ...o,
})

// 북극성·목소리 비율: A 의 load-universe 가 voc_metrics_monthly 에 넣는 모양 그대로(신설 Agoda 6·7월 실수치)
const NS_ROWS: MetricRow[] = [
  { branch: '신설', month: '2026-06', channel: '전체', inputs: {} },
  {
    branch: '신설', month: '2026-06', channel: 'Agoda', inputs: {
      period: { from: '2026-06-02', to: '2026-06-29', weeks: 4, week_labels: ['2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'] },
      text_reviews: 20, text_reviews_with_neg_star: 6, neg_ratio: 0.3, channel_reviews_delta: 99, channel_checkouts: 478,
      weeks: [
        { week: '2026-06-08', reviews: 18, checkouts: 119 }, { week: '2026-06-15', reviews: 33, checkouts: 123 },
        { week: '2026-06-22', reviews: 24, checkouts: 123 }, { week: '2026-06-29', reviews: 24, checkouts: 113 },
      ],
    },
  },
  {
    branch: '신설', month: '2026-07', channel: 'Agoda', inputs: {
      period: { from: '2026-06-30', to: '2026-07-20', weeks: 3, week_labels: ['2026-07-06', '2026-07-13', '2026-07-20'] },
      text_reviews: 16, text_reviews_with_neg_star: 6, neg_ratio: 0.375, channel_reviews_delta: 68, channel_checkouts: 394,
      weeks: [{ week: '2026-07-06', reviews: 23, checkouts: 128 }, { week: '2026-07-13', reviews: 28, checkouts: 119 }, { week: '2026-07-20', reviews: 17, checkouts: 147 }],
    },
  },
]

// ── 행 → 계약 ────────────────────────────────────────────────────
describe('assembleUniverse — 행을 계약으로', () => {
  it('별자리의 star_ids 는 그 별자리를 가리키는 별을 날짜→ID 순으로 모으고, 단발 별은 constellation_id null 로 남는다', () => {
    const { universe: u } = assembleUniverse(snapshot({
      stars: [
        star({ id: 'S-00003', star_date: '2026-09-20', iso_week: '2026-W38', constellation_id: 'C-신설-001' }),
        star({ id: 'S-00004', star_date: '2026-09-21', phenomenon: '엘리베이터 대기', galaxy: '시설' }),
        star({ id: 'S-00002', star_date: '2026-09-01', constellation_id: 'C-신설-001' }),
        star({ id: 'S-00001', star_date: '2026-09-01', constellation_id: 'C-신설-001' }),
      ],
      constellations: [con({ id: 'C-신설-001', star_count: 3 })],
    }))
    expect(u.stars.map(s => s.id)).toEqual(['S-00001', 'S-00002', 'S-00003', 'S-00004'])
    expect(u.constellations[0].star_ids).toEqual(['S-00001', 'S-00002', 'S-00003'])
    expect(u.stars.find(s => s.id === 'S-00004')!.constellation_id).toBeNull()
    expect(u.stars.find(s => s.id === 'S-00003')).toMatchObject({ date: '2026-09-20', week: '2026-W38' })
    expect(u.meta.counts).toMatchObject({ stars: 4, singles: 1, constellations: 1, seeds: 0 })
  })

  it('없는 별자리를 가리키는 별은 단발로 두고 경고한다(숫자가 별자리 수와 어긋나지 않게)', () => {
    const { universe: u, warnings } = assembleUniverse(snapshot({ stars: [star({ id: 'S-00001', constellation_id: 'C-신설-999' })] }))
    expect(u.stars[0].constellation_id).toBeNull()
    expect(u.meta.counts.singles).toBe(1)
    expect(warnings.join('\n')).toContain('C-신설-999')
  })

  it('이력은 이벤트 ID 의 순번(#NN) 순서 — 두 자리를 넘어도(#100) 순서가 유지된다', () => {
    const { universe: u } = assembleUniverse(snapshot({
      stars: [star({ id: 'S-00001', constellation_id: 'C-신설-001' })],
      constellations: [con({ id: 'C-신설-001' })],
      events: [
        { id: 'C-신설-001#100', constellation_id: 'C-신설-001', event_type: 'relapse', event_at: '2026-10-01', note: '셋째' },
        { id: 'C-신설-001#02', constellation_id: 'C-신설-001', event_type: 'task_linked', event_at: '2026-09-15', note: '둘째' },
        { id: 'C-신설-001#01', constellation_id: 'C-신설-001', event_type: 'formed', event_at: '2026-09-10', note: null },
      ],
    }))
    expect(u.constellations[0].history).toEqual([
      { type: 'formed', at: '2026-09-10', note: '' },
      { type: 'task_linked', at: '2026-09-15', note: '둘째' },
      { type: 'relapse', at: '2026-10-01', note: '셋째' },
    ])
  })

  it('연결 과제는 tasks 의 제목·상태를 붙이고 「[지점] 수행과제 — 」 머리말을 뗀다. tasks 에 없으면 과제 없이 두고 경고', () => {
    const { universe: u, warnings } = assembleUniverse(snapshot({
      stars: [star({ id: 'S-00001', constellation_id: 'C-신설-001' }), star({ id: 'S-00002', constellation_id: 'C-신설-002' })],
      constellations: [
        con({ id: 'C-신설-001', status: '수행과제 진행', task_id: 't-1' }),
        con({ id: 'C-신설-002', name: '조식 메뉴 단조로움', status: '열림', task_id: 't-gone' }),
      ],
      tasks: [{ id: 't-1', title: '[신설] 수행과제 — 샤워부스 배수 점검', status: '진행중', task_month: '2026-09' }],
    }))
    const c1 = u.constellations.find(c => c.id === 'C-신설-001')!
    const c2 = u.constellations.find(c => c.id === 'C-신설-002')!
    expect(c1.task).toEqual({ id: 't-1', title: '샤워부스 배수 점검', status: '진행중', task_month: '2026-09' })
    expect(c2.task).toBeNull()
    expect(warnings.join('\n')).toContain('t-gone')
  })

  it('리뷰: 별이 가리키는 리뷰만, 계약 칸만 옮긴다 — 리뷰어·국적 칸이 행에 섞여 와도 옮기지 않는다', () => {
    const leaky = { ...review({ id: 'r-1' }), reviewer: 'Kim Minsu', country: 'KR', room_type: '1203' } as unknown as ReviewRow
    const { universe: u } = assembleUniverse(snapshot({
      stars: [star({ id: 'S-00001', review_id: 'r-1' })],
      reviews: [leaky, review({ id: 'r-no-star', content: 'unrelated' })],
    }))
    expect(Object.keys(u.reviews)).toEqual(['r-1'])
    expect(Object.keys(u.reviews['r-1']).sort()).toEqual(['branch', 'channel', 'date', 'date_source', 'rating', 'scale', 'text_ko', 'text_orig'])
    const json = JSON.stringify(u)
    expect(json).not.toContain('Kim Minsu')
    expect(json).not.toContain('1203')
  })

  it('리뷰 조회 칸에 개인 식별 칸이 없다(계약에 필요한 칸만)', () => {
    const cols = COLUMNS.reviews.split(',').map(s => s.trim())
    expect(cols.sort()).toEqual(['branch', 'content', 'content_ko', 'id', 'ota_site', 'rating'])
    for (const all of Object.values(COLUMNS)) {
      expect(all).not.toMatch(/reviewer|guest|author|nickname|country|room_type|travel_type|\*/)
    }
  })

  it('리뷰: 채널 코드로 바꾸고 점수는 채널 척도(5점제는 10점 저장값을 반으로), 날짜·날짜 출처는 그 리뷰의 별 값', () => {
    const { universe: u, warnings } = assembleUniverse(snapshot({
      stars: [
        star({ id: 'S-00001', review_id: 'r-air', branch: '동대문', channel: 'Airbnb', star_date: '2026-08-15', date_source: 'month' }),
        star({ id: 'S-00002', review_id: 'r-ago', channel: 'Agoda', star_date: '2026-09-03', date_source: 'collected' }),
        star({ id: 'S-00003', review_id: 'r-gone' }),
      ],
      reviews: [
        review({ id: 'r-air', branch: '동대문', ota_site: '에어비앤비', rating: 9.6 }),
        review({ id: 'r-ago', ota_site: '아고다', rating: '7.0' }),
      ],
    }))
    expect(u.reviews['r-air']).toMatchObject({ channel: 'Airbnb', scale: 5, rating: 4.8, date: '2026-08-15', date_source: 'month' })
    expect(u.reviews['r-ago']).toMatchObject({ channel: 'Agoda', scale: 10, rating: 7, date: '2026-09-03', date_source: 'collected' })
    expect(u.reviews['r-gone']).toBeUndefined()
    expect(u.meta.counts.reviews_with_stars).toBe(2)
    expect(warnings.join('\n')).toContain('r-gone')
  })

  it('은하는 확정 9개·확정 순서. 기존 표 이름 「직원서비스」는 「응대/환대/커뮤니티」로 부르고, 별·별자리·씨앗·성운을 은하별로 센다', () => {
    const { universe: u } = assembleUniverse(snapshot({
      stars: [
        star({ id: 'S-00001', galaxy: '직원서비스', polarity: 'pos', owner: 'CM', constellation_id: 'C-신설-001' }),
        star({ id: 'S-00002', galaxy: '직원서비스', polarity: 'pos', owner: 'CM', constellation_id: 'C-신설-001' }),
        star({ id: 'S-00003', galaxy: '시설', constellation_id: 'C-신설-002' }),
        star({ id: 'S-00004', galaxy: '시설', constellation_id: 'C-신설-003' }),
        star({ id: 'S-00005', galaxy: '청결' }),
      ],
      constellations: [
        con({ id: 'C-신설-001', galaxy: '직원서비스', polarity: 'pos', status: '유지', name: '직원 친절' }),
        con({ id: 'C-신설-002', galaxy: '시설', status: '성운', name: '객실 난방 약함' }),
        con({ id: 'C-신설-003', galaxy: '시설', status: '씨앗', name: '엘리베이터 대기', formed_at: null }),
      ],
    }))
    expect(u.galaxies.map(g => g.name)).toEqual([...GALAXIES])
    expect(u.galaxies.map(g => g.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    const hosp = u.galaxies.find(g => g.id === '응대/환대/커뮤니티')!
    expect(hosp).toMatchObject({ stars: 2, pos: 2, neg: 0, constellations: 1, seeds: 0 })
    expect(u.galaxies.find(g => g.id === '시설')).toMatchObject({ stars: 2, constellations: 1, nebulae: 1, seeds: 1 })
    expect(u.galaxies.find(g => g.id === '청결')).toMatchObject({ stars: 1, constellations: 0 })
    expect(JSON.stringify(u)).not.toContain('직원서비스')
    expect(u.constellations.find(c => c.id === 'C-신설-001')!.galaxy).toBe('응대/환대/커뮤니티')
  })

  it('상태 값은 계약 집합만 — 부정에 긍정 상태, 긍정에 부정 상태, 모르는 값이면 그리지 않고 멈춘다', () => {
    const base = { stars: [star({ id: 'S-00001', constellation_id: 'C-신설-001' })] }
    for (const s of NEG_STATUSES) expect(() => assembleUniverse(snapshot({ ...base, constellations: [con({ id: 'C-신설-001', status: s })] }))).not.toThrow()
    for (const s of POS_STATUSES) expect(() => assembleUniverse(snapshot({ ...base, constellations: [con({ id: 'C-신설-001', polarity: 'pos', status: s })] }))).not.toThrow()
    expect(() => assembleUniverse(snapshot({ ...base, constellations: [con({ id: 'C-신설-001', status: '유지' })] }))).toThrow(/상태 값이 계약 밖/)
    expect(() => assembleUniverse(snapshot({ ...base, constellations: [con({ id: 'C-신설-001', polarity: 'pos', status: '열림' })] }))).toThrow(/상태 값이 계약 밖/)
    expect(() => assembleUniverse(snapshot({ ...base, constellations: [con({ id: 'C-신설-001', status: '완료' })] }))).toThrow(/상태 값이 계약 밖/)
  })

  it('핵심 지표는 상태로 센다 — 성운=구조 해결, 관찰 진입 중 재발한 것=재발률, 긍정 유지/긍정 별자리=성과 유지율, 씨앗은 빼고', () => {
    const stars = Array.from({ length: 7 }, (_, i) => star({ id: `S-0000${i + 1}`, constellation_id: `C-신설-00${i + 1}` }))
    const { universe: u } = assembleUniverse(snapshot({
      stars,
      constellations: [
        con({ id: 'C-신설-001', status: '성운', observation_start: '2026-06-01' }),
        con({ id: 'C-신설-002', status: '재발', observation_start: '2026-07-01', relapse_count: 1 }),
        con({ id: 'C-신설-003', status: '관찰', observation_start: '2026-09-01' }),
        con({ id: 'C-신설-004', status: '씨앗', observation_start: null, formed_at: null }),
        con({ id: 'C-신설-005', polarity: 'pos', status: '유지' }),
        con({ id: 'C-신설-006', polarity: 'pos', status: '흐려짐' }),
        con({ id: 'C-신설-007', polarity: 'pos', status: '씨앗', formed_at: null }),
      ],
    }))
    expect(u.core).toEqual({ structural_solved: 1, relapse_rate: { num: 1, den: 3 }, keep_rate: { num: 1, den: 2 } })
    expect(u.meta.counts).toMatchObject({ constellations: 5, constellations_neg: 3, constellations_pos: 2, seeds: 2 })
  })

  it('순서: 지점(신설·동대문) → 극성 → 최근 4주 별 수 → 최근 순. 불편 크기(별 수)로 가중하지 않는다', () => {
    const stars = [
      star({ id: 'S-00001', constellation_id: 'C-신설-001' }), star({ id: 'S-00002', constellation_id: 'C-신설-001' }),
      star({ id: 'S-00003', constellation_id: 'C-신설-001' }), star({ id: 'S-00004', constellation_id: 'C-신설-002' }),
      star({ id: 'S-00005', constellation_id: 'C-신설-003' }),
      star({ id: 'S-00006', branch: '동대문', constellation_id: 'C-동대문-001' }),
    ]
    const { universe: u } = assembleUniverse(snapshot({
      stars,
      constellations: [
        con({ id: 'C-동대문-001', branch: '동대문', recent_4w: 9 }),
        con({ id: 'C-신설-001', name: '가', recent_4w: 1, last_date: '2026-10-01' }),
        con({ id: 'C-신설-002', name: '나', recent_4w: 2, last_date: '2026-09-01' }),
        con({ id: 'C-신설-003', name: '다', recent_4w: 1, last_date: '2026-10-05' }),
      ],
    }))
    expect(u.meta.branches).toEqual(['신설', '동대문'])
    // localeCompare 기준 지점 순(build-universe 와 같음) — 지점 안에서는 최근 4주 → 최근 순
    const sinseol = u.constellations.filter(c => c.branch === '신설').map(c => c.id)
    expect(sinseol).toEqual(['C-신설-002', 'C-신설-003', 'C-신설-001'])
  })

  it('기준일 = 별자리 as_of 의 가장 늦은 날, 기간 첫날 = 월 지표 첫 달 1일, 묶는 창 = 기준일 포함 90일', () => {
    const { universe: u, warnings } = assembleUniverse(snapshot({
      stars: [star({ id: 'S-00001', star_date: '2026-06-03', constellation_id: 'C-신설-001' }), star({ id: 'S-00002', constellation_id: 'C-신설-002' })],
      constellations: [con({ id: 'C-신설-001', as_of: '2026-10-12' }), con({ id: 'C-신설-002', as_of: '2026-10-05' })],
      metrics: NS_ROWS,
    }))
    expect(u.meta.as_of).toBe('2026-10-12')
    expect(u.meta.period).toEqual({ from: '2026-06-01', to: '2026-10-12' })
    expect(u.meta.window).toEqual({ from: '2026-07-15', to: '2026-10-12' })
    expect(u.meta.rules).toEqual({ seed: 2, constellation_min: 3, distinct_weeks: 2, window_days: 90 })
    expect(warnings.join('\n')).toContain('기준일이 여러 개')
  })

  it('별 0행이면 조립하지 않는다(적재 전은 빈 우주가 아니라 empty 상태)', () => {
    expect(() => assembleUniverse(snapshot({}))).toThrow(/별 0행/)
  })
})

// ── 지표 ─────────────────────────────────────────────────────────
describe('지표 — 월 행을 더해 universe.json 과 같은 뜻으로', () => {
  it('북극성 = 1 − (원문 리뷰 중 부정 비율 × 채널 리뷰 증가분) ÷ 채널 체크아웃. 신설 Agoda 6·7월 실수치 → 0.9362', () => {
    const ns = northStarFromMetrics(NS_ROWS, PROPS)
    expect(ns).toEqual({
      label: '불편 없이 끝난 체류 비율',
      value: 0.9362,
      scope: '신설 Agoda만(체크아웃 데이터가 있는 유일한 채널) · 2026-06-02~2026-07-20 7주 · 리뷰 1건=체류 1건 추정',
      is_estimate: true,
      inputs: { text_reviews: 36, text_reviews_with_neg_star: 12, neg_ratio: 0.3333, channel_reviews_delta: 167, channel_checkouts: 872, est_neg_stays: 55.7 },
    })
  })

  it('체크아웃이 있는 채널이 없으면 북극성은 숫자 없이(null) 범위 문구만', () => {
    const ns = northStarFromMetrics(NS_ROWS.filter(r => r.channel === '전체'), PROPS)
    expect(ns.value).toBeNull()
    expect(ns.inputs).toBeNull()
    expect(ns.scope).toBe('체크아웃 데이터가 있는 채널 없음')
  })

  it('목소리 비율 = 주별 리뷰 증가분 합 ÷ 체크아웃 합(V1 작성률 계산), 주 수와 기간', () => {
    expect(voiceRatioFromMetrics(NS_ROWS, PROPS)).toEqual([
      { branch: '신설', channel: 'Agoda', ratio: 0.1915, weeks: 7, reviews: 167, checkouts: 872, period: { from: '2026-06-02', to: '2026-07-20' } },
    ])
  })

  it('OTA 평점: 지점 채널마다 기준일 이전 최신 스냅샷(기준일 뒤 스냅샷은 쓰지 않음), property_id 순, 다른 지점 제외', () => {
    const scores: ScoreRow[] = [
      { id: 5, property_id: 10, overall_score: 8.9, review_count: 7772, recorded_at: '2026-10-05' },
      { id: 1, property_id: 1, overall_score: '8.5', review_count: 9000, recorded_at: '2026-09-28' },
      { id: 2, property_id: 1, overall_score: '8.6', review_count: 9018, recorded_at: '2026-10-05' },
      { id: 3, property_id: 1, overall_score: '9.9', review_count: 9100, recorded_at: '2026-10-19' },
      { id: 4, property_id: 11, overall_score: 9.0, review_count: 10, recorded_at: '2026-10-05' },
      { id: 6, property_id: 2, overall_score: 4.83, review_count: 957, recorded_at: '2026-10-05' },
    ]
    expect(otaRatingFrom(PROPS, scores, ['신설', '동대문'], '2026-10-12')).toEqual([
      { branch: '신설', channel: 'Agoda', score: 8.6, scale: 10, recorded_at: '2026-10-05', review_count: 9018 },
      { branch: '동대문', channel: 'Airbnb', score: 4.83, scale: 5, recorded_at: '2026-10-05', review_count: 957 },
      { branch: '동대문', channel: 'Agoda', score: 8.9, scale: 10, recorded_at: '2026-10-05', review_count: 7772 },
    ])
  })
})

// ── 1000행 상한 ──────────────────────────────────────────────────
/** PostgREST 흉내: PK 정렬 후 요청 범위를 주되 한 응답은 cap 행까지만(에러·경고 없이). */
function cappedServer(ids: string[], cap: number, opts: { shiftAfterFirst?: number } = {}) {
  const sorted = [...ids].sort()
  let calls = 0
  const fetchPage = async (from: number, to: number) => {
    calls++
    const shift = calls > 1 ? (opts.shiftAfterFirst ?? 0) : 0   // 동시 기록으로 행이 밀린 경우
    const start = Math.max(0, from - shift)
    const end = Math.min(to + 1, start + cap)
    return { data: sorted.slice(start, end).map(id => ({ id })), error: null, count: sorted.length }
  }
  return { fetchPage, calls: () => calls }
}
const shuffledIds = (n: number) => {
  const ids = Array.from({ length: n }, (_, i) => `S-${String(i + 1).padStart(5, '0')}`)
  for (let i = ids.length - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]] }
  return ids
}

describe('fetchAllPaged — PostgREST 1000행 상한을 넘어 끝까지', () => {
  it('서버가 한 번에 1000행만 줘도 2,108행을 끝까지 이어 받고 PK 순으로 돌려준다', async () => {
    const srv = cappedServer(shuffledIds(2108), 1000)
    const rows = await fetchAllPaged(srv.fetchPage, r => r.id)
    expect(rows).toHaveLength(2108)
    expect(new Set(rows.map(r => r.id)).size).toBe(2108)
    expect(rows.map(r => r.id)).toEqual([...rows.map(r => r.id)].sort())
    expect(rows[0].id).toBe('S-00001')
    expect(rows[2107].id).toBe('S-02108')
    expect(srv.calls()).toBe(3)
  })

  it('서버 상한이 페이지 크기보다 작아도(500) 잘리지 않는다 — 「1000행 미만이면 끝」 판정에 걸리지 않음', async () => {
    const srv = cappedServer(shuffledIds(2108), 500)
    const rows = await fetchAllPaged(srv.fetchPage, r => r.id, { pageSize: 1000 })
    expect(rows).toHaveLength(2108)
  })

  it('페이지 경계에서 같은 행이 다시 와도 PK 로 하나만 남긴다', async () => {
    const srv = cappedServer(shuffledIds(2108), 1000, { shiftAfterFirst: 5 })
    const rows = await fetchAllPaged(srv.fetchPage, r => r.id)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    expect(rows).toHaveLength(2108)
  })

  it('숫자 PK 는 숫자 순으로 정렬한다(문자 순이면 10 이 9 앞에 온다)', async () => {
    const data = [{ id: 10 }, { id: 9 }, { id: 100 }, { id: 2 }]
    const rows = await fetchAllPaged(async () => ({ data, error: null, count: 4 }), r => r.id)
    expect(rows.map(r => r.id)).toEqual([2, 9, 10, 100])
  })

  it('읽기 오류는 표 이름과 함께 올린다. 「표 없음」만 적재 전으로 판정하고 칸 이름 오류 등은 그대로 오류', async () => {
    const missing = fetchAllPaged(async () => ({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.voc_stars' in the schema cache" } }), () => 1, { label: 'voc_stars' })
    await expect(missing).rejects.toThrow(/voc_stars 조회 실패/)
    const err = await missing.catch(e => e)
    expect(isMissingTableError(err)).toBe(true)
    expect(isMissingTableError(new DbReadError('voc_stars', { code: '42703', message: 'column voc_stars.quote does not exist' }))).toBe(false)
  })
})

// ── 실제 로더(가짜 Supabase 클라이언트) ───────────────────────────
interface FakeTable { rows?: Record<string, unknown>[]; error?: { code: string; message: string } }
/** supabase-js 질의 사슬을 흉내 낸다. 한 응답 cap 행(PostgREST db-max-rows). 각 표에 넘어온 select 칸을 기록한다. */
function fakeClient(tables: Record<string, FakeTable>, cap = 1000) {
  const selected: Record<string, string[]> = {}
  const client = {
    from(table: string) {
      const t = tables[table] ?? { rows: [] }
      const preds: ((r: Record<string, unknown>) => boolean)[] = []
      let head = false
      let orderBy: string | null = null
      const result = (from = 0, to = Number.MAX_SAFE_INTEGER) => {
        if (t.error) return { data: null, error: t.error, count: null }
        let rows = (t.rows ?? []).filter(r => preds.every(p => p(r)))
        if (orderBy) { const k = orderBy; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0)) }
        const count = rows.length
        if (head) return { data: null, error: null, count }
        return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null, count }
      }
      const q = {
        select(cols: string, o?: { head?: boolean }) { (selected[table] ??= []).push(cols); head = !!o?.head; return q },
        order(c: string) { orderBy ??= c; return q },
        in(c: string, vs: unknown[]) { const s = new Set(vs); preds.push(r => s.has(r[c])); return q },
        lte(c: string, v: string) { preds.push(r => String(r[c]) <= v); return q },
        gte(c: string, v: string) { preds.push(r => String(r[c]) >= v); return q },
        lt(c: string, v: string) { preds.push(r => new Date(String(r[c])).getTime() < new Date(v).getTime()); return q },
        not(c: string, _op: string, _v: null) { preds.push(r => r[c] != null); return q },
        neq(c: string, v: unknown) { preds.push(r => r[c] !== v); return q },
        range(from: number, to: number) { return Promise.resolve(result(from, to)) },
        then<A, B>(ok: (v: ReturnType<typeof result>) => A, bad?: (e: unknown) => B) { return Promise.resolve(result()).then(ok, bad) },
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, selected }
}

describe('loadUniverseFromDb — 적재 전·적재 후', () => {
  it('새 표가 아직 없으면(마이그레이션 전) 빈 우주 대신 「적재 전(tables_missing)」', async () => {
    const err = { code: 'PGRST205', message: "Could not find the table 'public.voc_stars' in the schema cache" }
    const { client } = fakeClient({ voc_stars: { error: err }, voc_constellations: { error: err }, voc_constellation_events: { error: err }, voc_metrics_monthly: { error: err } })
    const r = await loadUniverseFromDb(client)
    expect(r).toMatchObject({ state: 'empty', reason: 'tables_missing' })
  })

  it('표는 있는데 별이 0행이면 「적재 전(no_rows)」과 표별 행 수', async () => {
    const { client } = fakeClient({ voc_stars: { rows: [] }, voc_constellations: { rows: [] }, voc_constellation_events: { rows: [] }, voc_metrics_monthly: { rows: [] } })
    const r = await loadUniverseFromDb(client)
    expect(r).toEqual({ state: 'empty', reason: 'no_rows', tables: { voc_stars: 0, voc_constellations: 0, voc_constellation_events: 0, voc_metrics_monthly: 0 } })
  })

  it('표 없음이 아닌 읽기 오류는 「적재 전」으로 숨기지 않고 올린다', async () => {
    const { client } = fakeClient({ voc_stars: { error: { code: '42703', message: 'column voc_stars.quote does not exist' } } })
    await expect(loadUniverseFromDb(client)).rejects.toThrow(/voc_stars 조회 실패/)
  })

  it('별 2,108행(상한 1000)을 실제 로더로 모두 읽어 조립하고, 리뷰는 별이 가리키는 것만 계약 칸으로 읽는다', async () => {
    const N = 2108
    const starRows = shuffledIds(N).map((id, i) => ({
      ...star({ id, review_id: `r-${i % 700}`, constellation_id: i % 3 === 0 ? 'C-신설-001' : null }),
    }))
    const reviewRows = Array.from({ length: 800 }, (_, i) => ({
      ...review({ id: `r-${i}` }), reviewer: `작성자${i}`, review_month: '2026-09', created_at: '2026-10-01T00:00:00Z',
    }))
    const { client, selected } = fakeClient({
      voc_stars: { rows: starRows },
      voc_constellations: { rows: [{ ...con({ id: 'C-신설-001', star_count: Math.ceil(N / 3) }) }] },
      voc_constellation_events: { rows: [] },
      voc_metrics_monthly: { rows: NS_ROWS as unknown as Record<string, unknown>[] },
      ota_properties: { rows: PROPS as unknown as Record<string, unknown>[] },
      ota_scores: { rows: [] },
      tasks: { rows: [] },
      reviews: { rows: reviewRows },
    })
    const r = await loadUniverseFromDb(client)
    if (r.state !== 'ready') throw new Error('ready 여야 함')
    expect(r.universe.stars).toHaveLength(N)
    expect(r.universe.constellations[0].star_ids).toHaveLength(Math.ceil(N / 3))
    expect(Object.keys(r.universe.reviews)).toHaveLength(700)
    expect(r.universe.meta.counts.reviews).toBe(800)
    expect(r.warnings).toEqual([])
    expect(selected.reviews.every(c => !/reviewer/.test(c))).toBe(true)
    expect(JSON.stringify(r.universe)).not.toContain('작성자')
  })
})
