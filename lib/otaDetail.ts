// OTA 상세 탭 파생용 순수 함수.
// raw_reviews.raw_date는 채널마다 형식이 다르다 — 여기서 한 형식으로 모은다.

export type Granularity = 'week' | 'month'

export interface ParsedDate {
  date:  string | null   // 'YYYY-MM-DD' — 일 단위를 알 수 없으면 null
  month: string | null   // 'YYYY-MM'
}

const pad = (n: number) => String(n).padStart(2, '0')

// 영문 월 이름 → 월 번호. 아고다 raw에 'March 2026' 형태가 실재한다(127건).
// 폴백(review_month)으로 흘려보내도 date는 어차피 null이라 입도는 같다 —
// 명시적으로 해석하는 이득은 '월'이 맞게 나온다는 것이다.
// review_month가 비어 있거나 raw_date와 어긋난 행에서도 원문 표기의 월을 그대로 살린다.
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

export function parseRawDate(
  rawDate: string | null | undefined,
  reviewMonth?: string | null,
): ParsedDate {
  const s = (rawDate ?? '').trim()
  const fallbackMonth = reviewMonth?.trim() || null

  // 2026-07-21 (아고다·익스피디아)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, month: `${iso[1]}-${iso[2]}` }

  // 2026년 7월 22일 (부킹·트립닷컴)
  const kFull = s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (kFull) {
    const [, y, m, d] = kFull
    return { date: `${y}-${pad(+m)}-${pad(+d)}`, month: `${y}-${pad(+m)}` }
  }

  // 2026.07.04 (야놀자)
  const dot = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (dot) {
    const [, y, m, d] = dot
    return { date: `${y}-${pad(+m)}-${pad(+d)}`, month: `${y}-${pad(+m)}` }
  }

  // 2026년 6월 (에어비앤비) — 일 단위 없음
  const kMonth = s.match(/^(\d{4})년\s*(\d{1,2})월\s*$/)
  if (kMonth) {
    const [, y, m] = kMonth
    return { date: null, month: `${y}-${pad(+m)}` }
  }

  // March 2026 / june 2026 (아고다 영문 표기) — 일 단위 없음.
  // 대소문자 무시, 앞뒤 공백 허용(위에서 trim 완료). 월 이름이 아니면 폴백으로 넘긴다.
  const enMonth = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (enMonth) {
    const m = EN_MONTHS[enMonth[1].toLowerCase()]
    if (m) return { date: null, month: `${enMonth[2]}-${pad(m)}` }
  }

  // '2개월 전' 등 상대 표현(여기어때) — 절대값 복원 불가, review_month로 대체
  return { date: null, month: fallbackMonth }
}

export function weekStartOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = d.getUTCDay()            // 0=일 … 6=토
  const back = dow === 0 ? 6 : dow - 1 // 월요일까지 되돌릴 일수
  d.setUTCDate(d.getUTCDate() - back)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function monthStartOf(month: string): string {
  return `${month}-01`
}

// 'YYYY-MM-DD'에 일수를 더한다. 전부 UTC 기준 — 로컬 시간대가 끼어들 여지를 두지 않는다.
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// 기준일(오늘)이 속한 주부터 거슬러 n개 주의 월요일 목록(오름차순).
// 기준일을 인자로 받는 이유: new Date()(로컬)와 toISOString()(UTC)을 섞으면
// KST 09시 이전 실행에서 '오늘'이 전날로 밀려 월요일 오전 실행 시 이번 주가 통째로 빠진다.
// 호출자가 로컬 달력으로 'YYYY-MM-DD'를 정해 넘기고, 이후 계산은 전부 UTC로만 한다.
export function recentWeekStarts(todayIso: string, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(weekStartOf(addDaysIso(todayIso, -i * 7)))
  }
  return [...new Set(out)].sort()
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

// 주 목록이 실제로 걸치는 모든 달('YYYY-MM', 오름차순).
// 주 시작일의 달만 모으면, 최신 주의 월요일이 전월이면 그 주의 이번 달 날짜가
// review_month 필터에서 통째로 빠진다 — 경고도 에러도 없이 조용히 잘린다.
// 각 주는 월~일 7일이므로 마지막 주는 시작일 +6일까지 포함해 범위를 잡는다.
export function monthsCovering(weekStarts: string[]): string[] {
  if (weekStarts.length === 0) return []
  const sorted = [...weekStarts].sort()
  const firstMonth = sorted[0].substring(0, 7)
  const lastMonth  = addDaysIso(sorted[sorted.length - 1], 6).substring(0, 7)

  const out: string[] = []
  for (let m = firstMonth; m <= lastMonth; m = nextMonth(m)) out.push(m)
  return out
}

// 이 버킷이 '아직 끝나지 않은 달'인가 — --fill-empty의 보호 대상에서 뺄지 결정한다.
//
// 월 입도 채널(에어비앤비·여기어때)은 한 달을 한 행으로 접는다. 배치는 한 달 안에서
// 여러 번 돌기 때문에, 달 중간에 쓴 행은 그 달의 일부만 담은 미완성 값이다.
// --fill-empty가 '행이 있으면 건너뛴다'로만 동작하면 그 미완성 값이 영구히 굳어
// 다음 주 실행도 건너뛰고, 그 달은 끝내 완성되지 않는다(매달 반복된다).
// 그래서 '기준일이 속한 달'의 월 버킷만 보호에서 제외하고 매 실행 다시 쓴다.
// 이미 끝난 달은 확정값이므로 그대로 보호한다.
//
// 주 입도는 대상이 아니다 — 주간 루틴은 완료된 주를 상대로 고정 주기로 돌기 때문에
// 구조가 다르다. 미래 달(기준일보다 뒤)도 대상이 아니다 — 정상 데이터가 아니며
// 여기서 임의로 되살릴 근거가 없다.
export function isInProgressMonthBucket(
  weekStart: string,
  granularity: Granularity,
  todayIso: string,
): boolean {
  if (granularity !== 'month') return false
  return weekStart.substring(0, 7) === todayIso.substring(0, 7)
}

// ota_properties.ota_name → raw_reviews.ota_site (같은 채널의 두 표기)
export const OTA_SITE_BY_NAME: Record<string, string> = {
  'Agoda':    '아고다',
  'Booking':  '부킹닷컴',
  'Trip.com': '트립닷컴',
  'Expedia':  '익스피디아',
  'Airbnb':   '에어비앤비',
  'NOL':      '야놀자',
  '여기어때':  '여기어때',
}

export function bandsFor(scoreMax: number): string[] {
  if (scoreMax === 5) return ['1점', '2점', '3점', '4점', '5점']
  return ['1점대','2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점']
}

export function distColumnsFor(scoreMax: number): string[] {
  const n = scoreMax === 5 ? 5 : 10
  return Array.from({ length: n }, (_, i) => `score_${i + 1}`)
}

export interface ScoreDist {
  counts: Record<string, number>
  avg:    number
  total:  number
}

export function distFromRatings(ratings: number[], scoreMax: number): ScoreDist {
  const cols   = distColumnsFor(scoreMax)
  const counts: Record<string, number> = {}
  cols.forEach(c => { counts[c] = 0 })

  let sum = 0
  ratings.forEach(r => {
    const clamped = Math.min(Math.max(r, 1), scoreMax)
    const idx     = Math.min(Math.floor(clamped) - 1, cols.length - 1)
    counts[cols[idx]] += 1
    sum += r
  })

  const total = ratings.length
  return {
    counts,
    total,
    avg: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
  }
}
