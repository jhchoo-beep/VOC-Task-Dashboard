import { describe, it, expect } from 'vitest'
import { translationKey, selectBucketReviews, buildChannelReviews } from './weeklyReviews'
import type { RawReviewRow, TranslatedRow } from './weeklyReviews'

// 실측(2026-07-20 주차). ota_site는 한글명이고 ota_properties.ota_name은 영문이다.
const RAW: RawReviewRow[] = [
  { id: 'a', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 4.0, country: 'South Korea', room_type: 'Single', content: '배수 확인 꼭 해주세요\n샤워하면 물이 차오릅니다' },
  { id: 'b', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 10.0, country: 'Taiwan', room_type: 'single room', content: '整體來說是個很不錯的住宿地方' },
  { id: 'c', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-27', rating: 9.0, country: 'Japan', room_type: 'Twin', content: '다음 주 리뷰' },
  { id: 'd', branch: '신설',   ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-21', rating: 8.0, country: 'Japan', room_type: 'Suite', content: '다른 지점' },
  { id: 'e', branch: '동대문', ota_site: '트립닷컴', review_month: '2026-07', raw_date: '2026-07-21', rating: 9.5, country: 'Korea', room_type: 'Dorm', content: '다른 채널' },
]

describe('selectBucketReviews', () => {
  it('주 버킷: 같은 지점·채널의 그 주 리뷰만 고른다', () => {
    const got = selectBucketReviews(RAW, '동대문', 'Agoda', '2026-07-20', 'week')
    expect(got.map(r => r.id).sort()).toEqual(['a', 'b'])
  })

  it('다음 주 리뷰(07-27)는 07-20 버킷에 들어가지 않는다', () => {
    const got = selectBucketReviews(RAW, '동대문', 'Agoda', '2026-07-20', 'week')
    expect(got.some(r => r.id === 'c')).toBe(false)
  })

  it('월 버킷: 일 단위 날짜가 없어도 그 달이면 포함한다', () => {
    const monthly: RawReviewRow[] = [
      { id: 'm1', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: '2026년 7월', rating: 5, country: null, room_type: null, content: '월 단위' },
      { id: 'm2', branch: '신설', ota_site: '에어비앤비', review_month: '2026-06', raw_date: '2026년 6월', rating: 4, country: null, room_type: null, content: '지난달' },
    ]
    const got = selectBucketReviews(monthly, '신설', 'Airbnb', '2026-07-01', 'month')
    expect(got.map(r => r.id)).toEqual(['m1'])
  })

  it('raw_date가 비면 review_month로 폴백해 월 버킷에는 잡힌다', () => {
    const rows: RawReviewRow[] = [
      { id: 'x', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: null, rating: 5, country: null, room_type: null, content: '날짜 없음' },
    ]
    expect(selectBucketReviews(rows, '신설', 'Airbnb', '2026-07-01', 'month').map(r => r.id)).toEqual(['x'])
    // 주 버킷은 일 단위가 없으면 어느 주인지 알 수 없으므로 넣지 않는다
    expect(selectBucketReviews(rows, '신설', 'Airbnb', '2026-07-20', 'week')).toEqual([])
  })

  it('알 수 없는 채널명이면 빈 배열 — 잘못된 매핑으로 남의 리뷰를 끌어오지 않는다', () => {
    expect(selectBucketReviews(RAW, '동대문', '없는채널', '2026-07-20', 'week')).toEqual([])
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
  const TRANS: TranslatedRow[] = [
    { branch: '동대문', ota_site: '아고다', content: '整體來說是個很不錯的住宿地方', content_ko: '전반적으로 아주 괜찮은 숙소였어요' },
  ]
  const target = { propertyId: 3, branch: '동대문', otaName: 'Agoda', weekStart: '2026-07-20', granularity: 'week' as const, reviewCount: 3 }

  it('저평점 순으로 정렬한다', () => {
    const got = buildChannelReviews(RAW, TRANS, target)
    expect(got.items.map(i => i.rating)).toEqual([4, 10])
  })

  it('번역본이 있으면 그것을 쓰고 translated=true', () => {
    const got = buildChannelReviews(RAW, TRANS, target)
    const zh = got.items.find(i => i.id === 'b')!
    expect(zh.body).toBe('전반적으로 아주 괜찮은 숙소였어요')
    expect(zh.translated).toBe(true)
  })

  it('번역본이 없으면 원문 그대로, translated=false', () => {
    const got = buildChannelReviews(RAW, TRANS, target)
    const ko = got.items.find(i => i.id === 'a')!
    expect(ko.body.startsWith('배수 확인 꼭 해주세요')).toBe(true)
    expect(ko.translated).toBe(false)
  })

  it('expectedCount는 판정이 쓴 건수 그대로 — 커버리지 미달을 화면이 고지할 수 있어야 한다', () => {
    // 아고다는 raw 커버리지가 31% 수준이라 '3건 8.0'인데 원문이 2건만 잡힌다.
    const got = buildChannelReviews(RAW, TRANS, target)
    expect(got.expectedCount).toBe(3)
    expect(got.items.length).toBe(2)
  })

  it('빈 본문끼리는 번역 매칭되지 않는다', () => {
    const rows: RawReviewRow[] = [
      { id: 'n', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 5, country: null, room_type: null, content: null },
    ]
    const trans: TranslatedRow[] = [{ branch: '동대문', ota_site: '아고다', content: null, content_ko: '엉뚱한 번역' }]
    const got = buildChannelReviews(rows, trans, { ...target, reviewCount: 1 })
    expect(got.items[0].translated).toBe(false)
    expect(got.items[0].body).toBe('')
  })

  it('평점 없는(null) 리뷰는 0점으로 둔갑하지 않고 뒤로 밀린다', () => {
    // Number(null) === 0 이라 가드를 통과하는 함정 — 평점 미상이 '가장 나쁜 리뷰'로 보이면 안 된다.
    const rows: RawReviewRow[] = [
      { id: 'p1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 7, country: null, room_type: null, content: '평점 있음' },
      { id: 'p2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: null, country: null, room_type: null, content: '평점 없음' },
    ]
    const got = buildChannelReviews(rows, [], { ...target, reviewCount: 2 })
    expect(got.items.map(i => i.id)).toEqual(['p1', 'p2'])
    expect(got.items.find(i => i.id === 'p2')!.rating).toBe(null)
  })

  it('평점이 빈 문자열인 리뷰도 null과 같게 다룬다', () => {
    const rows: RawReviewRow[] = [
      { id: 'q1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 6, country: null, room_type: null, content: '평점 있음' },
      { id: 'q2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: '', country: null, room_type: null, content: '평점 빈 문자열' },
    ]
    const got = buildChannelReviews(rows, [], { ...target, reviewCount: 2 })
    expect(got.items.map(i => i.id)).toEqual(['q1', 'q2'])
    expect(got.items.find(i => i.id === 'q2')!.rating).toBe(null)
  })

  it('평점 없는 리뷰가 둘이어도 항목이 유실·중복되지 않는다', () => {
    const rows: RawReviewRow[] = [
      { id: 'r1', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: null, country: null, room_type: null, content: '평점 없음 1' },
      { id: 'r2', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: null, country: null, room_type: null, content: '평점 없음 2' },
    ]
    const got = buildChannelReviews(rows, [], { ...target, reviewCount: 2 })
    expect(got.items.map(i => i.id).sort()).toEqual(['r1', 'r2'])
  })
})
