// STAY VOC 2.0 리뷰 원문 — 순수 계산(화면 없음, DB 호출 없음).
// 1.0 「리뷰 데이터」(components/ReviewsClient.tsx)와 「Raw Data」(components/RawDataClient.tsx)의 계산을 그대로 옮겼다.
// 🔴 vitest 가 '@/' 별칭을 못 풀어 이 파일은 상대 경로 import 만 쓴다.
import { ALL, LOW_SCORE, type Scope } from './metrics'

export interface ReviewRow {
  id: string
  branch: string
  ota_site: string | null
  rating: number | null
  review_month: string
  content: string | null
  content_ko: string | null
  categories: string[] | null
  severity: string | null
  churn_triggers: string[] | null
  customer_segment: string | null
  status: string | null
  created_at: string | null
}

export interface RawRow {
  id: string
  branch: string
  ota_site: string | null
  review_month: string
  reviewer: string | null
  country: string | null
  travel_type: string | null
  room_type: string | null
  rating: number | null
  content: string | null
  has_response: boolean | null
  raw_date: string | null
  created_at: string | null
}

/** voc_review_analysis 한 줄(review_id = reviews.id) */
export interface Analysis {
  reviewId: string
  branch: string
  channel: string
  date: string          // YYYY-MM-DD
  score: number | null
  neg: number
  pos: number
}

/** voc_stars 중 불편 별(polarity='neg') */
export interface NegStar {
  id: string
  reviewId: string
  branch: string
  date: string
  galaxy: string
  phenomenon: string
  owner: string
  quote: string
}

export interface LinkedTask { id: string; title: string; task_month: string | null; status: string | null }

// 1.0 과 같은 선택지
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const
export const CATS = ['청결', '소음', '시설', '직원서비스', '체크인/체크아웃', '위치/접근성', '어메니티', '가격', '보안', '기타'] as const
export const TRIGGERS = ['청결 Critical', '복합이슈', '서비스 실패', '가격 불일치'] as const
const SEV_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

/** 이용객 세그먼트 자동 계산(1.0 autoSegment 그대로) */
export function autoSegment(rating: number | string): string {
  const r = parseFloat(String(rating))
  if (isNaN(r)) return ''
  if (r >= 9) return '충성'
  if (r >= 7) return '만족'
  if (r >= 5) return '위험'
  return '이탈'
}

/** Severity 자동 산정(1.0 autoSeverity 그대로) */
export function autoSeverity(rating: number | string, triggers: readonly string[]): string {
  const r = parseFloat(String(rating))
  if (isNaN(r)) return 'Medium'
  if (triggers.includes('청결 Critical')) return 'Critical'
  if (triggers.includes('복합이슈') && r < 6) return 'Critical'
  if (triggers.includes('복합이슈')) return 'High'
  if (r <= 3) return 'Critical'
  if (r <= 5) return 'High'
  if (r <= 7) return 'Medium'
  return 'Low'
}

const trim = (s: string | null | undefined) => (s ?? '').trim()

/** 화면에 먼저 보일 글(한국어 번역 우선)과, 번역과 다른 원어 */
export function reviewText(r: Pick<ReviewRow, 'content' | 'content_ko'>): { text: string; original: string | null } {
  const ko = trim(r.content_ko), orig = trim(r.content)
  return { text: ko || orig, original: ko && orig && ko !== orig ? orig : null }
}
export const hasTranslation = (r: Pick<ReviewRow, 'content_ko'>) => trim(r.content_ko) !== ''

export type ScoreBand = 'all' | 'lt9' | 'ge9'
export type ReviewSort = 'score' | 'severity' | 'branch' | 'channel'
export type RawSort = 'collected' | 'score'
export type Dir = 'asc' | 'desc'

export interface ReviewFilter { branch: Scope; channel: string; severity: string; score: ScoreBand; q: string }
export interface RawFilter { branch: Scope; channel: string; q: string }

const hit = (ql: string, ...parts: (string | null | undefined)[]) => !ql || parts.some(p => (p ?? '').toLowerCase().includes(ql))

/** 리뷰 목록 거르기. phenomena = 리뷰 id → 2.0 불편 현상(검색에 같이 쓴다) */
export function filterReviews(rows: ReviewRow[], f: ReviewFilter, phenomena?: Map<string, string[]>): ReviewRow[] {
  const ql = f.q.trim().toLowerCase()
  return rows.filter(r => {
    if (f.branch !== ALL && r.branch !== f.branch) return false
    if (f.channel && r.ota_site !== f.channel) return false
    if (f.severity && r.severity !== f.severity) return false
    if (f.score === 'lt9' && !(r.rating != null && r.rating < LOW_SCORE)) return false
    if (f.score === 'ge9' && !(r.rating != null && r.rating >= LOW_SCORE)) return false
    return hit(ql, r.content, r.content_ko, r.ota_site, r.branch, (r.categories ?? []).join(' '), (r.churn_triggers ?? []).join(' '), (phenomena?.get(r.id) ?? []).join(' '))
  })
}

export function filterRaw(rows: RawRow[], f: RawFilter): RawRow[] {
  const ql = f.q.trim().toLowerCase()
  return rows.filter(r => {
    if (f.branch !== ALL && r.branch !== f.branch) return false
    if (f.channel && r.ota_site !== f.channel) return false
    return hit(ql, r.content, r.reviewer, r.country, r.travel_type, r.room_type, r.ota_site, r.branch)
  })
}

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)

/** 1.0 과 같은 정렬 축(지점, OTA, 평점, Severity). 같은 값이면 등록 순으로 고정 */
export function sortReviews(rows: ReviewRow[], by: ReviewSort, dir: Dir): ReviewRow[] {
  const key = (r: ReviewRow): string | number =>
    by === 'score' ? r.rating ?? 0
      : by === 'severity' ? SEV_ORDER[r.severity ?? ''] ?? 99
        : by === 'branch' ? r.branch ?? '' : r.ota_site ?? ''
  const s = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => s * cmp(key(a), key(b)) || cmp(a.created_at ?? '', b.created_at ?? '') || cmp(a.id, b.id))
}

/** 1.0 Raw Data 정렬 = 수집일(created_at). 점수 정렬도 둔다 */
export function sortRaw(rows: RawRow[], by: RawSort, dir: Dir): RawRow[] {
  const t = (r: RawRow) => (r.created_at ? new Date(r.created_at).getTime() : 0)
  const s = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => s * (by === 'score' ? cmp(a.rating ?? 0, b.rating ?? 0) : t(a) - t(b)) || cmp(a.id, b.id))
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 100) / 100 : null)

export function reviewKpis(rows: ReviewRow[], analyzed: Set<string>) {
  const scored = rows.filter(r => r.rating != null).map(r => r.rating as number)
  return {
    n: rows.length,
    analyzed: rows.filter(r => analyzed.has(r.id)).length,
    avg: avg(scored),
    scored: scored.length,
    low: rows.filter(r => r.rating != null && r.rating < LOW_SCORE).length,
    noKo: rows.filter(r => !hasTranslation(r)).length,
    foreign: rows.filter(r => reviewText(r).original != null).length,
  }
}

/** 수집 시각(UTC) → 한국 날짜 YYYY-MM-DD. 서버·브라우저가 같은 값을 내도록 시간대를 직접 더한다 */
export function kstDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? '' : new Date(t + 9 * 3600_000).toISOString().slice(0, 10)
}

export function rawKpis(rows: RawRow[]) {
  const scored = rows.filter(r => r.rating != null).map(r => Number(r.rating))
  const days = rows.map(r => kstDay(r.created_at)).filter(Boolean).sort()
  const last = days[days.length - 1] ?? null
  return {
    n: rows.length,
    avg: avg(scored),
    scored: scored.length,
    answered: rows.filter(r => r.has_response).length,
    lastDay: last,
    lastDayN: last ? days.filter(d => d === last).length : 0,
  }
}

/** 1.0 CSV 내려받기와 같은 열·형식(BOM 붙은 UTF-8, 모든 칸 따옴표) */
export function reviewsCsv(rows: ReviewRow[]): string {
  const headers = ['지점', 'OTA', '평점', 'Severity', '세그먼트', '리뷰월', '카테고리', '변심트리거', '내용(한국어)', '내용(원문)']
  const body = rows.map(r => [
    r.branch ?? '', r.ota_site ?? '', r.rating ?? '', r.severity ?? '', r.customer_segment ?? '', r.review_month ?? '',
    (r.categories ?? []).join('|'), (r.churn_triggers ?? []).join('|'), r.content_ko ?? '', r.content ?? '',
  ])
  return [headers, ...body].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}

/** 1.0 Raw CSV 업로드 파서 그대로(첫 줄 = 머리, 머리는 소문자로) */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) ?? []
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  }).filter(r => Object.values(r).some(v => v))
}

/** CSV 한 행 → /api/rawdata POST 본문(한글·영문 머리 모두, 1.0 과 같은 대응) */
export function csvRowToRaw(row: Record<string, string>, common: { branch: string; ota_site: string; review_month: string }) {
  return {
    ...common,
    content: row['content'] || row['리뷰 내용'] || row['review'] || row['review_text'] || Object.values(row).join(' '),
    rating: parseFloat(row['rating'] || row['점수'] || row['score'] || '') || null,
    reviewer: row['reviewer'] || row['리뷰어'] || row['name'] || null,
    country: row['country'] || row['국가'] || null,
    raw_date: row['date'] || row['날짜'] || row['raw_date'] || null,
    travel_type: row['travel_type'] || row['여행유형'] || null,
    room_type: row['room_type'] || row['객실'] || null,
  }
}

/** 불편 지수 화면에서 그 현상을 고른 채로 여는 주소 */
export function discomfortHref(prefix: string, branch: string, month: string, phenomenon?: string) {
  const qs = new URLSearchParams()
  if (branch) qs.set('branch', branch)
  qs.set('month', month)
  if (phenomenon) qs.set('p', phenomenon)
  return `${prefix}/v2/discomfort?${qs.toString()}`
}

/** 달 목록(최신 순, 중복 없이) */
export const uniqMonths = (...lists: (string | null | undefined)[][]) =>
  [...new Set(lists.flat().filter((m): m is string => !!m && /^\d{4}-\d{2}$/.test(m)))].sort().reverse()
