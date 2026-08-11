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
import {
  parseRawDate, weekLabelOf, OTA_SITE_BY_NAME, eligibleRawRows,
  bucketPeriodStart, bucketPeriodEnd,
} from './otaDetail'

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
  items: WeeklyReviewItem[]   // 목표 미달 리뷰만
  expectedCount: number       // 판정이 쓴 reviewCount. 확보한 원문 수보다 클 수 있다
  hiddenCount: number         // 목표 이상이라 목록에서 뺀 건수
  target: number              // 화면이 '기준 9.0'을 출력하기 위한 값
}

/** propertyId → 목표 미달 리뷰 수. 논의 대상 선정(discussionRows)과 점수 보드가 함께 쓴다. */
export function belowReviewCounts(reviews: Record<number, ChannelReviews>): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [id, cr] of Object.entries(reviews)) out[Number(id)] = cr.items.length
  return out
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

/**
 * 드릴다운 대상 버킷들을 덮으려면 raw_reviews.review_month를 어느 달까지 읽어야 하는가.
 *
 * 🔴 `weekStart`는 이름과 달리 구간의 '끝'이다(2026-07-27 라벨 규약). 그래서 이 값의 월과
 *    bucketEnd의 월을 넣으면 둘이 같은 달이라 월을 걸치는 주에서 조회 범위가 한 달로
 *    쪼그라든다 — 라벨 2026-08-03(07-28~08-03)에서 7월분 리뷰가 통째로 빠져 화면이
 *    '수집 커버리지 밖의 리뷰입니다'를 띄웠다(2026-08-04 실발생). 구간의 첫날은 반드시
 *    bucketPeriodStart로 구한다.
 */
export function drilldownMonths(
  targets: { weekStart: string; granularity: Granularity }[],
): string[] {
  const months = targets.flatMap(t => [
    bucketPeriodStart(t.weekStart, t.granularity).substring(0, 7),
    bucketPeriodEnd(t.weekStart, t.granularity).substring(0, 7),
  ])
  return [...new Set(months)].sort()
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

/**
 * 목표 미달 리뷰인가. 판정(judgeWeek)과 같은 부등호·같은 반올림을 쓴다.
 *
 * 척도 환산은 하지 않는다 — raw_reviews.rating은 채널 자기 척도로 저장돼 있고
 * (야놀자·에어비앤비 1~5, 나머지 1~10) target도 같은 척도로 내려온다(9.0 · 4.5).
 * 여기에 10점 환산을 끼우면 5점제 채널의 리뷰가 전부 미달로 뒤집힌다.
 *
 * 평점이 없으면 미만이라고 단정하지 않고 남긴다(true). 판정할 수 없는 것을 통과로
 * 처리하지 않는 이 리포트의 원칙과 같다 — silent 채널을 통과에 합치지 않는 것과 같은 이유다.
 */
function isBelowTarget(rating: number | null, target: number): boolean {
  if (rating == null) return true
  // 9.0 - 9.0 = -1.7e-15 같은 부동소수 잔차가 경계값을 미달로 뒤집는 것을 막는다.
  return Math.round((rating - target) * 100) / 100 < 0
}

/**
 * 버킷 리뷰를 목표 미달만 남겨 저평점 순으로 정렬하고 번역본을 붙인다.
 *
 * 🔴 필터는 여기(순수 함수)에 둔다. 화면에서 걸면 카드의 판정과 펼침의 목록이 기준을
 *    두 벌 유지하게 되고, 한쪽만 고치는 순간 둘이 조용히 갈라진다.
 *
 * 🔴 이 결과의 items.length 가 곧 논의 대상 선정 기준이다(discussionRows) — 주 평균이
 *    목표를 넘긴 채널도 여기서 1건이라도 나오면 논의 카드가 선다. 그래서 미달 채널만이
 *    아니라 그 주 리뷰가 있는 **모든 채널**에 대해 호출해야 한다.
 */
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
    target: number            // 이 채널의 목표 점수(9.0 · 5점제 4.5)
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

  const all: WeeklyReviewItem[] = picked.map(r => {
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

  // 점수를 끌어내린 리뷰만 남긴다. 숨긴 건수는 버리지 않고 화면에 넘긴다 —
  // 조용히 빼면 남은 목록이 '그 주 전부'로 읽힌다.
  const items = all.filter(i => isBelowTarget(i.rating, target.target))
  const hiddenCount = all.length - items.length

  // 저평점 먼저. 평점이 없는 행은 뒤로 보낸다(정렬 기준이 없는 행이 맨 앞을 차지하면
  // 가장 나쁜 리뷰가 밀려난다). 둘 다 없으면 동순위(0)여야 한다 — 여기서 1을 돌려주면
  // compare(a,b)와 compare(b,a)가 모두 1이 되어 비교가 비대칭이 된다.
  items.sort((a, b) => {
    if (a.rating == null && b.rating == null) return 0
    if (a.rating == null) return 1
    if (b.rating == null) return -1
    return a.rating - b.rating
  })

  return {
    propertyId: target.propertyId,
    items,
    expectedCount: target.reviewCount,
    hiddenCount,
    target: target.target,
  }
}
