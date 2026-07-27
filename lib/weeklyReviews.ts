// 주간 리포트의 리뷰 원문 드릴다운 — 순수 함수. DB 무관.
//
// 🔴 버킷 매칭은 반드시 파생 배치와 같은 파서·같은 채널명 맵을 쓴다.
//    화면이 자기만의 매칭 규칙을 만들면 "3건 8.0"이라고 써 놓고 다른 3건을 띄운다.
//    weekly_avg_score를 만든 코드가 쓰는 것: parseRawDate · weekLabelOf · OTA_SITE_BY_NAME.
//
// 🔴 OtaScoresClient의 OTA_SITE_ALIAS(NOL: ['NOL','야놀자'])를 쓰지 말 것 — 그건 표기가
//    갈리는 채널을 넓게 잡는 별개 용도라, 이쪽을 쓰면 배치가 세지 않은 행이 화면에만 뜬다.

// 상대 경로로 가져온다 — vitest는 '@/' 별칭을 풀지 않는다.
import type { Granularity } from './otaDetail'
import { parseRawDate, weekLabelOf, OTA_SITE_BY_NAME, eligibleRawRows } from './otaDetail'

export interface RawReviewRow {
  id: string
  branch: string
  ota_site: string
  review_month: string | null
  raw_date: string | null
  rating: number | string | null
  country: string | null
  room_type: string | null
  content: string | null
  // 파생 배치가 버킷을 만들기 전 거는 스크래퍼 UI 행 필터(eligibleRawRows)에 필요하다.
  // raw_reviews.reviewer는 nullable.
  reviewer: string | null
}

// reviews 테이블에서 번역본만 끌어온다. content 원문이 raw_reviews와 동일하게 들어 있어
// 이것이 조인 키가 된다(리뷰 단위 ID를 공유하는 컬럼이 없다).
export interface TranslatedRow {
  branch: string
  ota_site: string
  content: string | null
  content_ko: string | null
}

export interface WeeklyReviewItem {
  id: string
  rating: number | null
  country: string | null
  roomType: string | null
  date: string | null       // 월 입도 채널은 null
  body: string
  translated: boolean       // false = 원문 그대로(번역 없음을 화면이 밝힌다)
}

export interface ChannelReviews {
  propertyId: number
  items: WeeklyReviewItem[]
  expectedCount: number     // 판정이 쓴 reviewCount. items.length보다 클 수 있다
}

const TRANSLATION_KEY_LEN = 60

/** 공백·개행을 지우고 앞 60자. 두 표의 content가 같은 리뷰를 잇는 키다. */
export function translationKey(content: string | null | undefined): string {
  return (content ?? '').replace(/\s+/g, '').substring(0, TRANSLATION_KEY_LEN)
}

const numOrNull = (v: unknown): number | null => {
  // 🔴 Number(null)과 Number('')는 둘 다 0이다. 먼저 걸러내지 않으면 평점 없는 리뷰가
  //    0점으로 둔갑해 정렬 맨 앞 — '가장 나쁜 리뷰' 자리를 차지한다.
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 그 버킷·그 채널의 raw 리뷰만 고른다. */
export function selectBucketReviews(
  rows: RawReviewRow[],
  branch: string,
  otaName: string,
  bucket: string,
  granularity: Granularity,
): RawReviewRow[] {
  const site = OTA_SITE_BY_NAME[otaName]
  if (!site) return []          // 모르는 채널이면 아무것도 고르지 않는다
  const bucketMonth = bucket.substring(0, 7)

  // 지점·채널을 먼저 좁힌 뒤에 배치와 같은 필터(dedupe + 스크래퍼 UI 행 제외)를 태운다.
  // 배치는 raw(그 채널 그 기간 행)에만 dedupe를 건다 — 여기서 순서를 바꾸면 다른 채널의
  // 행이 중복 판정(reviewer|raw_date|rating|content 앞 80자)에 끼어들어 잘못 걸러진다.
  const narrowed = rows.filter(r => r.branch === branch && r.ota_site === site)
  const eligible = eligibleRawRows(narrowed)

  return eligible.filter(r => {
    const { date, month } = parseRawDate(r.raw_date, r.review_month)
    if (granularity === 'month') return month === bucketMonth
    // 주 버킷은 일 단위가 있어야 어느 주인지 정해진다
    return date != null && weekLabelOf(date) === bucket
  })
}

/** 버킷 리뷰를 저평점 순으로 정렬하고 번역본을 붙인다. */
export function buildChannelReviews(
  rows: RawReviewRow[],
  translations: TranslatedRow[],
  target: {
    propertyId: number
    branch: string
    otaName: string
    weekStart: string
    granularity: Granularity
    reviewCount: number
  },
): ChannelReviews {
  const picked = selectBucketReviews(rows, target.branch, target.otaName, target.weekStart, target.granularity)

  const site = OTA_SITE_BY_NAME[target.otaName]
  const koByKey = new Map<string, string>()
  for (const t of translations) {
    if (t.branch !== target.branch || t.ota_site !== site) continue
    const key = translationKey(t.content)
    const ko = (t.content_ko ?? '').trim()
    // 빈 키는 담지 않는다 — 본문 없는 행끼리 매칭돼 엉뚱한 번역이 붙는다.
    if (!key || !ko) continue
    if (!koByKey.has(key)) koByKey.set(key, ko)
  }

  const items: WeeklyReviewItem[] = picked.map(r => {
    const original = (r.content ?? '').trim()
    const ko = koByKey.get(translationKey(original))
    // 원문과 번역본이 같은 문자열이면(한국어 리뷰) 번역했다고 표시하지 않는다.
    const isTranslated = ko != null && ko !== original
    return {
      id: r.id,
      rating: numOrNull(r.rating),
      country: r.country,
      roomType: r.room_type,
      date: parseRawDate(r.raw_date, r.review_month).date,
      body: isTranslated ? ko! : original,
      translated: isTranslated,
    }
  })

  // 저평점 먼저. 평점이 없는 행은 뒤로 보낸다(정렬 기준이 없는 행이 맨 앞을 차지하면
  // 가장 나쁜 리뷰가 밀려난다). 둘 다 없으면 동순위(0)여야 한다 — 여기서 1을 돌려주면
  // compare(a,b)와 compare(b,a)가 모두 1이 되어 비교가 비대칭이 된다.
  items.sort((a, b) => {
    if (a.rating == null && b.rating == null) return 0
    if (a.rating == null) return 1
    if (b.rating == null) return -1
    return a.rating - b.rating
  })

  return { propertyId: target.propertyId, items, expectedCount: target.reviewCount }
}
