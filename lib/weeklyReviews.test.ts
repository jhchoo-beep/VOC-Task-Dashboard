import { describe, it, expect } from 'vitest'
import {
  translationKey, selectBucketReviews, datedReviewsFor, buildChannelReviews,
  drilldownMonths, belowReviewCounts,
} from './weeklyReviews'
import type { RawReviewRow, ReviewRow } from './weeklyReviews'

// 실측(2026-07-20 주차). ota_site는 한글명이고 ota_properties.ota_name은 영문이다.
// 🔴 모집단은 reviews 다. raw 는 날짜·국가·객실타입만 빌려 준다.
const RAW: RawReviewRow[] = [
  { id: 'a', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 4.0, country: 'South Korea', room_type: 'Single', content: '배수 확인 꼭 해주세요\n샤워하면 물이 차오릅니다', reviewer: null },
  { id: 'b', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 10.0, country: 'Taiwan', room_type: 'single room', content: '整體來說是個很不錯的住宿地方', reviewer: null },
  { id: 'c', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-27', rating: 9.0, country: 'Japan', room_type: 'Twin', content: '다음 주 리뷰', reviewer: null },
  { id: 'd', branch: '신설',   ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-21', rating: 8.0, country: 'Japan', room_type: 'Suite', content: '다른 지점', reviewer: null },
  { id: 'e', branch: '동대문', ota_site: '트립닷컴', review_month: '2026-07', raw_date: '2026-07-21', rating: 9.5, country: 'Korea', room_type: 'Dorm', content: '다른 채널', reviewer: null },
]

// reviews.rating 은 10점 환산 저장이다. 아고다는 10점제라 그대로.
const REV: ReviewRow[] = [
  { id: 'RA', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 4.0, content: '배수 확인 꼭 해주세요\n샤워하면 물이 차오릅니다', content_ko: null },
  { id: 'RB', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 10.0, content: '整體來說是個很不錯的住宿地方', content_ko: '전반적으로 아주 괜찮은 숙소였어요' },
  { id: 'RC', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 9.0, content: '다음 주 리뷰', content_ko: null },
  { id: 'RD', branch: '신설',   ota_site: '아고다', review_month: '2026-07', rating: 8.0, content: '다른 지점', content_ko: null },
  { id: 'RE', branch: '동대문', ota_site: '트립닷컴', review_month: '2026-07', rating: 9.5, content: '다른 채널', content_ko: null },
]

const DDM_AGODA = { propertyId: 3, branch: '동대문', otaName: 'Agoda', scoreMax: 10, weekStart: '2026-07-20', granularity: 'week' as const, reviewCount: 3 }

describe('selectBucketReviews', () => {
  it('주 버킷: 같은 지점·채널의 그 주 리뷰만 고른다', () => {
    const got = selectBucketReviews(REV, RAW, '동대문', 'Agoda', '2026-07-20', 'week')
    expect(got.map(d => d.review.id).sort()).toEqual(['RA', 'RB'])
  })

  it('다음 주 리뷰(07-27)는 07-20 버킷에 들어가지 않는다', () => {
    const got = selectBucketReviews(REV, RAW, '동대문', 'Agoda', '2026-07-20', 'week')
    expect(got.some(d => d.review.id === 'RC')).toBe(false)
  })

  it('월 버킷: 일 단위 날짜가 없어도 그 달이면 포함한다', () => {
    const raw: RawReviewRow[] = [
      { id: 'm1', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: '2026년 7월', rating: 5, country: null, room_type: null, content: '월 단위', reviewer: null },
      { id: 'm2', branch: '신설', ota_site: '에어비앤비', review_month: '2026-06', raw_date: '2026년 6월', rating: 4, country: null, room_type: null, content: '지난달', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'M1', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', rating: 10, content: '월 단위', content_ko: null },
      { id: 'M2', branch: '신설', ota_site: '에어비앤비', review_month: '2026-06', rating: 8, content: '지난달', content_ko: null },
    ]
    const got = selectBucketReviews(rev, raw, '신설', 'Airbnb', '2026-07-01', 'month')
    expect(got.map(d => d.review.id)).toEqual(['M1'])
  })

  it('raw 짝이 없으면 review_month로 폴백해 월 버킷에는 잡힌다', () => {
    const rev: ReviewRow[] = [
      { id: 'X', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', rating: 10, content: '짝 없음', content_ko: null },
    ]
    expect(selectBucketReviews(rev, [], '신설', 'Airbnb', '2026-07-01', 'month').map(d => d.review.id)).toEqual(['X'])
    // 주 버킷은 일 단위가 없으면 어느 주인지 알 수 없으므로 넣지 않는다
    expect(selectBucketReviews(rev, [], '신설', 'Airbnb', '2026-07-20', 'week')).toEqual([])
  })

  it('알 수 없는 채널명이면 빈 배열 — 잘못된 매핑으로 남의 리뷰를 끌어오지 않는다', () => {
    expect(selectBucketReviews(REV, RAW, '동대문', '없는채널', '2026-07-20', 'week')).toEqual([])
  })
})

// ── 중복 제거 — 이 전환의 본체 ──────────────────────────────────────
// 🔴 raw 는 같은 리뷰를 여러 행으로 갖는다. reviews 가 정본이므로 raw 사본이 몇 벌이든
//    결과는 reviews 건수를 넘지 않는다. 실측: 2026-08 동대문 에어비앤비 raw 9행 = 실제 4건.
describe('datedReviewsFor — raw 중복이 결과를 부풀리지 않는다', () => {
  it('리뷰어만 다른 사본 3벌이 있어도 reviews 1건이면 1건이다', () => {
    // 실측 형태: 같은 본문이 '경미' / '459개 후기에서 별 5개 만점에 4.87개' / '호스팅 하기' 로 3벌
    const body = '위치도 매우좋고 깔끔한 숙소였습니다 요즘 대부분 모바일로 작동하는건 알고 있습니다만'
    const raw: RawReviewRow[] = [
      { id: 'r1', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', raw_date: '2026년 8월', rating: 4.0, country: 'KR', room_type: null, content: body, reviewer: '경미' },
      { id: 'r2', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', raw_date: '2026년 8월', rating: 4.0, country: null, room_type: null, content: body + ' 추가', reviewer: '459개 후기에서 별 5개 만점에 4.87개' },
      { id: 'r3', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', raw_date: '2026년 8월', rating: 4.0, country: null, room_type: null, content: body + ' 더 추가', reviewer: '호스팅 하기' },
    ]
    const rev: ReviewRow[] = [
      { id: 'V1', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', rating: 8, content: body, content_ko: null },
    ]
    const got = datedReviewsFor(rev, raw, '동대문', 'Airbnb')
    expect(got).toHaveLength(1)
    expect(got[0].raw?.id).toBe('r1')      // 먼저 온 행이 날짜를 준다
    expect(got[0].date).toBe(null)          // '2026년 8월' 은 일자가 없다
    expect(got[0].month).toBe('2026-08')
  })

  it('원문과 번역본이 각각 raw 한 행이어도 reviews 1건이면 1건이다', () => {
    const zh = '非常適合獨旅人的住宿。交通位置方便，對街就可搭機場巴士。'
    const ko = '혼자 여행하는 사람에게 훌륭한 숙소. 교통이 편리한 위치에 있으며'
    const raw: RawReviewRow[] = [
      { id: 'zh', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', raw_date: '2026년 8월', rating: 5.0, country: 'TW', room_type: null, content: zh, reviewer: 'Huai-Chih' },
      { id: 'ko', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', raw_date: '2026년 8월', rating: 5.0, country: null, room_type: null, content: ko, reviewer: 'Huai-Chih' },
    ]
    const rev: ReviewRow[] = [
      { id: 'V2', branch: '동대문', ota_site: '에어비앤비', review_month: '2026-08', rating: 10, content: zh, content_ko: ko },
    ]
    expect(datedReviewsFor(rev, raw, '동대문', 'Airbnb')).toHaveLength(1)
  })

  it('서로 다른 리뷰 두 건은 각각 자기 raw 행을 가져간다 — 하나가 둘을 삼키지 않는다', () => {
    const raw: RawReviewRow[] = [
      { id: 'p1', branch: '신설', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-15', rating: 8, country: 'A', room_type: null, content: '첫째 리뷰', reviewer: null },
      { id: 'p2', branch: '신설', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-16', rating: 9, country: 'B', room_type: null, content: '둘째 리뷰', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'W1', branch: '신설', ota_site: '아고다', review_month: '2026-07', rating: 8, content: '첫째 리뷰', content_ko: null },
      { id: 'W2', branch: '신설', ota_site: '아고다', review_month: '2026-07', rating: 9, content: '둘째 리뷰', content_ko: null },
    ]
    const got = datedReviewsFor(rev, raw, '신설', 'Agoda')
    expect(got.map(d => [d.review.id, d.raw?.id, d.date])).toEqual([
      ['W1', 'p1', '2026-07-15'],
      ['W2', 'p2', '2026-07-16'],
    ])
  })

  it('본문 없는(별점만) 리뷰는 월+평점으로 짝을 짓는다', () => {
    // 부킹닷컴에 실재한다 — 본문 키를 만들 수 없어 본문 매칭으로는 전부 한 덩어리가 된다.
    const raw: RawReviewRow[] = [
      { id: 'b1', branch: '신설', ota_site: '부킹닷컴', review_month: '2026-07', raw_date: '2026-07-15', rating: 7, country: null, room_type: null, content: '', reviewer: null },
      { id: 'b2', branch: '신설', ota_site: '부킹닷컴', review_month: '2026-07', raw_date: '2026-07-16', rating: 9, country: null, room_type: null, content: null, reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'B1', branch: '신설', ota_site: '부킹닷컴', review_month: '2026-07', rating: 7, content: '', content_ko: null },
      { id: 'B2', branch: '신설', ota_site: '부킹닷컴', review_month: '2026-07', rating: 9, content: null, content_ko: null },
    ]
    const got = datedReviewsFor(rev, raw, '신설', 'Booking')
    expect(got.map(d => [d.review.id, d.date])).toEqual([['B1', '2026-07-15'], ['B2', '2026-07-16']])
  })

  // 🔴 실발생: 신설 에어비앤비 'Strategic location…' 이 raw 의 2026-07·2026-08 양쪽에 있어,
  //    8월 리뷰가 7월 raw 의 날짜를 얻는 바람에 8월 버킷에서 통째로 빠졌다(2건 → 1건,
  //    4.0점 미달 리뷰 소실). 짝짓기는 같은 달을 먼저 집어야 한다.
  it('같은 본문이 raw 에 두 달로 적재돼 있으면 같은 달 행을 집는다', () => {
    const body = 'Strategic location , clean and comfy space for long stays'
    const raw: RawReviewRow[] = [
      { id: 'jul', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: '2026년 7월', rating: 4.0, country: null, room_type: null, content: body, reviewer: 'Felysia' },
      { id: 'aug', branch: '신설', ota_site: '에어비앤비', review_month: '2026-08', raw_date: '2026년 8월', rating: 4.0, country: null, room_type: null, content: body, reviewer: 'Felysia' },
    ]
    const rev: ReviewRow[] = [
      { id: 'AUG', branch: '신설', ota_site: '에어비앤비', review_month: '2026-08', rating: 8, content: body, content_ko: null },
    ]
    const got = datedReviewsFor(rev, raw, '신설', 'Airbnb')
    expect(got[0].raw?.id).toBe('aug')
    expect(got[0].month).toBe('2026-08')
  })

  it('같은 달 raw 가 없으면 다른 달 행이라도 집어 날짜를 얻는다', () => {
    const raw: RawReviewRow[] = [
      { id: 'jul', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: '2026년 7월', rating: 5, country: null, room_type: null, content: '한 달 전 적재', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'AUG2', branch: '신설', ota_site: '에어비앤비', review_month: '2026-08', rating: 10, content: '한 달 전 적재', content_ko: null },
    ]
    expect(datedReviewsFor(rev, raw, '신설', 'Airbnb')[0].raw?.id).toBe('jul')
  })

  it('다른 채널의 같은 본문이 짝을 가로채지 않는다', () => {
    // 짧은 칭찬 리뷰는 채널을 넘어 실제로 겹친다. 지점·채널로 좁힌 뒤 짝을 지어야 한다.
    const raw: RawReviewRow[] = [
      { id: 't1', branch: '동대문', ota_site: '트립닷컴', review_month: '2026-07', raw_date: '2026-07-15', rating: 10, country: null, room_type: null, content: '좋아요', reviewer: null },
      { id: 'g1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-16', rating: 10, country: null, room_type: null, content: '좋아요', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'T1', branch: '동대문', ota_site: '트립닷컴', review_month: '2026-07', rating: 10, content: '좋아요', content_ko: null },
      { id: 'G1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 10, content: '좋아요', content_ko: null },
    ]
    expect(datedReviewsFor(rev, raw, '동대문', 'Agoda')[0].date).toBe('2026-07-16')
    expect(datedReviewsFor(rev, raw, '동대문', 'Trip.com')[0].date).toBe('2026-07-15')
  })
})

describe('translationKey', () => {
  it('공백·개행을 지우고 앞 60자로 키를 만든다', () => {
    expect(translationKey('배수 확인 꼭 해주세요\n샤워하면 물이 차오릅니다'))
      .toBe(translationKey('배수 확인 꼭 해주세요 샤워하면 물이 차오릅니다'))
  })

  it('빈 본문은 빈 키 — 빈 키끼리 매칭되면 안 되므로 소비자가 걸러야 한다', () => {
    expect(translationKey(null)).toBe('')
    expect(translationKey('   ')).toBe('')
  })
})

describe('buildChannelReviews', () => {
  // target: 11 = 척도 위로 올려 필터를 사실상 끈 값. 정렬·번역·건수는 필터와 독립이어야
  // 하므로 이 블록은 필터를 끄고 검증하고, 필터 자체는 아래 별도 describe에서 다룬다.
  // (운영에서는 targetScoreOf가 척도를 벗어난 값을 걸러 9.0·4.5만 내려온다.)
  const openTarget = { ...DDM_AGODA, target: 11 }

  it('저평점 순으로 정렬한다', () => {
    expect(buildChannelReviews(REV, RAW, openTarget).items.map(i => i.rating)).toEqual([4, 10])
  })

  it('번역본이 있으면 그것을 쓰고 translated=true', () => {
    const zh = buildChannelReviews(REV, RAW, openTarget).items.find(i => i.id === 'RB')!
    expect(zh.body).toBe('전반적으로 아주 괜찮은 숙소였어요')
    expect(zh.translated).toBe(true)
  })

  it('번역본이 없으면 원문 그대로, translated=false', () => {
    const ko = buildChannelReviews(REV, RAW, openTarget).items.find(i => i.id === 'RA')!
    expect(ko.body.startsWith('배수 확인 꼭 해주세요')).toBe(true)
    expect(ko.translated).toBe(false)
  })

  it('국가·객실타입은 짝지은 raw 행에서 가져온다 — reviews 에는 없는 값이다', () => {
    const ko = buildChannelReviews(REV, RAW, openTarget).items.find(i => i.id === 'RA')!
    expect(ko.country).toBe('South Korea')
    expect(ko.roomType).toBe('Single')
    expect(ko.date).toBe('2026-07-20')
  })

  it('expectedCount는 판정이 쓴 건수 그대로 — 커버리지 미달을 화면이 고지할 수 있어야 한다', () => {
    const got = buildChannelReviews(REV, RAW, openTarget)
    expect(got.expectedCount).toBe(3)
    expect(got.items.length).toBe(2)
  })

  // 🔴 reviews.rating 은 10점 환산 저장이다. 되돌리지 않으면 5점제 채널 리뷰가 전부
  //    목표(4.5) 위로 올라붙어 미달이 0건이 된다.
  it('5점제 채널은 평점을 채널 척도로 되돌린다', () => {
    const raw: RawReviewRow[] = [
      { id: 'n1', branch: '신설', ota_site: '야놀자', review_month: '2026-07', raw_date: '2026-07-20', rating: 3, country: null, room_type: null, content: '불만', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'N1', branch: '신설', ota_site: '야놀자', review_month: '2026-07', rating: 6, content: '불만', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, {
      propertyId: 22, branch: '신설', otaName: 'NOL', scoreMax: 5,
      weekStart: '2026-07-20', granularity: 'week', reviewCount: 1, target: 4.5,
    })
    expect(got.items[0].rating).toBe(3)   // 6 ÷ 2 — raw 값과 일치한다
    expect(got.items[0].id).toBe('N1')
  })

  it('평점 없는(null) 리뷰는 0점으로 둔갑하지 않고 뒤로 밀린다', () => {
    // Number(null) === 0 이라 가드를 통과하는 함정 — 평점 미상이 '가장 나쁜 리뷰'로 보이면 안 된다.
    const raw: RawReviewRow[] = [
      { id: 'p1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 7, country: null, room_type: null, content: '평점 있음', reviewer: null },
      { id: 'p2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: null, country: null, room_type: null, content: '평점 없음', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'P1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 7, content: '평점 있음', content_ko: null },
      { id: 'P2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: null, content: '평점 없음', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, { ...DDM_AGODA, reviewCount: 2, target: 11 })
    expect(got.items.map(i => i.id)).toEqual(['P1', 'P2'])
    expect(got.items.find(i => i.id === 'P2')!.rating).toBe(null)
  })

  it('평점이 빈 문자열인 리뷰도 null과 같게 다룬다', () => {
    const raw: RawReviewRow[] = [
      { id: 'q1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 6, country: null, room_type: null, content: '평점 있음', reviewer: null },
      { id: 'q2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: '', country: null, room_type: null, content: '평점 빈 문자열', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'Q1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 6, content: '평점 있음', content_ko: null },
      { id: 'Q2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: '', content: '평점 빈 문자열', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, { ...DDM_AGODA, reviewCount: 2, target: 11 })
    expect(got.items.map(i => i.id)).toEqual(['Q1', 'Q2'])
    expect(got.items.find(i => i.id === 'Q2')!.rating).toBe(null)
  })
})

// ── 목표 미달 필터 ──────────────────────────────────────────────────
// 카드가 '미달 1건'이라 써 놓고 펼치면 10.0짜리 호평이 함께 뜨던 문제.
// 🔴 여기서 나오는 items.length 가 곧 논의 대상 선정 기준이다(discussionRows) —
//    주 평균이 목표를 넘긴 채널도 여기서 1건이 나오면 논의 카드가 선다.
// 설계 정본: docs/superpowers/specs/2026-07-27-weekly-report-baseline-filter-design.md
describe('buildChannelReviews — 목표 미달 필터', () => {
  it('목표 미만만 남기고, 이상은 hiddenCount로 센다', () => {
    // 실측: 동대문 Agoda 2026-07-20 — 그 주 4.0/10.0(→ 평균 8.0)
    const got = buildChannelReviews(REV, RAW, { ...DDM_AGODA, target: 9.0 })
    expect(got.items.map(i => i.id)).toEqual(['RA'])
    expect(got.hiddenCount).toBe(1)
    expect(got.target).toBe(9.0)
  })

  it('목표와 정확히 같은 점수는 남기지 않는다 — judgeWeek과 같은 부등호', () => {
    const raw: RawReviewRow[] = [
      { id: 'eq', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 9.0, country: null, room_type: null, content: '경계값', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'EQ', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 9.0, content: '경계값', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, { ...DDM_AGODA, reviewCount: 1, target: 9.0 })
    expect(got.items).toEqual([])
    expect(got.hiddenCount).toBe(1)
  })

  it('5점제 채널은 환산한 목표(4.5)로 자기 척도에서 걸러진다', () => {
    const raw: RawReviewRow[] = [
      { id: 'n1', branch: '신설', ota_site: '야놀자', review_month: '2026-07', raw_date: '2026-07-20', rating: 4, country: null, room_type: null, content: '불만', reviewer: null },
      { id: 'n2', branch: '신설', ota_site: '야놀자', review_month: '2026-07', raw_date: '2026-07-20', rating: 5, country: null, room_type: null, content: '만족', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'N1', branch: '신설', ota_site: '야놀자', review_month: '2026-07', rating: 8, content: '불만', content_ko: null },
      { id: 'N2', branch: '신설', ota_site: '야놀자', review_month: '2026-07', rating: 10, content: '만족', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, {
      propertyId: 22, branch: '신설', otaName: 'NOL', scoreMax: 5,
      weekStart: '2026-07-20', granularity: 'week', reviewCount: 2, target: 4.5,
    })
    expect(got.items.map(i => i.id)).toEqual(['N1'])
    expect(got.hiddenCount).toBe(1)
  })

  it('평점 없는 리뷰는 남긴다 — 판정 불가를 통과로 처리하지 않는다', () => {
    const raw: RawReviewRow[] = [
      { id: 'good', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 10, country: null, room_type: null, content: '호평', reviewer: null },
      { id: 'none', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: null, country: null, room_type: null, content: '평점 없음', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'GOOD', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 10, content: '호평', content_ko: null },
      { id: 'NONE', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: null, content: '평점 없음', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, { ...DDM_AGODA, reviewCount: 2, target: 9.0 })
    expect(got.items.map(i => i.id)).toEqual(['NONE'])
    expect(got.hiddenCount).toBe(1)
  })

  it('전부 목표 이상이면 items는 비고 hiddenCount가 전부다 — 이 상태가 곧 논의 제외 신호다', () => {
    const raw: RawReviewRow[] = [
      { id: 'h1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 9.2, country: null, room_type: null, content: '호평1', reviewer: null },
      { id: 'h2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 9.6, country: null, room_type: null, content: '호평2', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'H1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 9.2, content: '호평1', content_ko: null },
      { id: 'H2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 9.6, content: '호평2', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, { ...DDM_AGODA, reviewCount: 2, target: 9.0 })
    expect(got.items).toEqual([])
    expect(got.hiddenCount).toBe(2)
  })

  it('필터가 걸려도 expectedCount는 판정이 준 값 그대로다', () => {
    // 화면의 커버리지 경고 분자는 items.length가 아니라 items.length + hiddenCount다.
    const got = buildChannelReviews(REV, RAW, { ...DDM_AGODA, target: 9.0 })
    expect(got.expectedCount).toBe(3)
    expect(got.items.length + got.hiddenCount).toBe(2)   // 확보한 원문 2건 / 판정 3건
  })

  it('부동소수 잔차로 판정이 뒤집히지 않는다', () => {
    // 8.9 - 8.9 = -1.7e-15 같은 잔차. judgeWeek이 round2로 막는 것과 같은 함정이고
    // 목표 값이 얼마든 성립해야 한다.
    const raw: RawReviewRow[] = [
      { id: 'f', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 8.9, country: null, room_type: null, content: '8.9 근사', reviewer: null },
    ]
    const rev: ReviewRow[] = [
      { id: 'F', branch: '동대문', ota_site: '아고다', review_month: '2026-07', rating: 0.1 + 0.2 + 8.6, content: '8.9 근사', content_ko: null },
    ]
    const got = buildChannelReviews(rev, raw, { ...DDM_AGODA, reviewCount: 1, target: 8.9 })
    expect(got.items).toEqual([])
    expect(got.hiddenCount).toBe(1)
  })
})

describe('belowReviewCounts', () => {
  it('propertyId → 미달 리뷰 수로 접는다 — 논의 선정과 점수 보드가 이 값을 공유한다', () => {
    const got = buildChannelReviews(REV, RAW, { ...DDM_AGODA, target: 9.0 })
    expect(belowReviewCounts({ 3: got })).toEqual({ 3: 1 })
  })

  it('미달 0건 채널도 0으로 남긴다 — 키가 빠지면 화면이 undefined를 다뤄야 한다', () => {
    const empty = buildChannelReviews([], [], { ...DDM_AGODA, reviewCount: 0, target: 9.0 })
    expect(belowReviewCounts({ 3: empty })).toEqual({ 3: 0 })
  })
})

describe('drilldownMonths', () => {
  it('주 버킷이 월을 걸치면 두 달을 모두 조회한다', () => {
    // 라벨 2026-08-03이 덮는 구간은 07-28(화)~08-03(월)이다. 07-28~07-31에 쓰인 리뷰는
    // review_month='2026-07'로 저장되므로 8월만 조회하면 화면이 원문을 못 찾는다
    // ('수집 커버리지 밖의 리뷰입니다' 오표시 — 2026-08-04 실발생).
    expect(drilldownMonths([{ weekStart: '2026-08-03', granularity: 'week' }]))
      .toEqual(['2026-07', '2026-08'])
  })

  it('월을 걸치지 않는 주는 한 달만 조회한다', () => {
    expect(drilldownMonths([{ weekStart: '2026-07-27', granularity: 'week' }]))
      .toEqual(['2026-07'])
  })

  it('월 버킷은 그 달 하나다', () => {
    expect(drilldownMonths([{ weekStart: '2026-07-01', granularity: 'month' }]))
      .toEqual(['2026-07'])
  })

  it('여러 채널의 달을 중복 없이 합친다', () => {
    expect(drilldownMonths([
      { weekStart: '2026-08-03', granularity: 'week' },
      { weekStart: '2026-08-03', granularity: 'week' },
      { weekStart: '2026-07-01', granularity: 'month' },
    ])).toEqual(['2026-07', '2026-08'])
  })
})
