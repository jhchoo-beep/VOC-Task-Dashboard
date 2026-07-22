// OTA 상세 탭 파생용 순수 함수.
// raw_reviews.raw_date는 채널마다 형식이 다르다 — 여기서 한 형식으로 모은다.

export type Granularity = 'week' | 'month'

export interface ParsedDate {
  date:  string | null   // 'YYYY-MM-DD' — 일 단위를 알 수 없으면 null
  month: string | null   // 'YYYY-MM'
}

const pad = (n: number) => String(n).padStart(2, '0')

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
