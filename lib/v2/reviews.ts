// STAY VOC 2.0 리뷰 원문 — 서버 쪽 조회(읽기만). 계산은 lib/v2/reviewsView.ts.
// 🔴 PostgREST 는 한 응답에 1000행이 상한이다. .range(0, 9999) 로도 1000행에서 끊기므로(1.0 Raw Data 의 달 목록이
//    raw_reviews 12,898행 중 최근 1000행만 보고 있었다) 1000행씩 이어 받고, id 로 정렬해 페이지가 겹치지 않게 한다.
// 🔴 캐시하지 않는다: raw_reviews 는 수집 스크래퍼, reviews·voc_* 는 파싱·분석 배치가 DB 에 직접 쓴다(revalidate 호출 없음).
import { supabase } from '../supabase'
import { uniqMonths, type Analysis, type LinkedTask, type NegStar, type RawRow, type ReviewRow } from './reviewsView'

const PAGE = 1000
type Res<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function pageAll<T>(build: (from: number, to: number) => Res<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** 한 열만 전부 읽기: 행 수를 먼저 세고 1000행 페이지를 한꺼번에 받는다(raw_reviews 13페이지를 차례로 받으면 느리다) */
async function columnAll(table: 'reviews' | 'raw_reviews', col: string): Promise<string[]> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(error.message)
  const pages = Math.ceil((count ?? 0) / PAGE)
  const res = await Promise.all(Array.from({ length: pages }, (_, i) =>
    supabase.from(table).select(col).order('id').range(i * PAGE, i * PAGE + PAGE - 1)))
  return res.flatMap(r => {
    if (r.error) throw new Error(r.error.message)
    return (r.data ?? []).map(x => (x as unknown as Record<string, string | null>)[col] ?? '')
  })
}

const REVIEW_COLS = 'id,branch,ota_site,rating,review_month,content,content_ko,categories,severity,churn_triggers,customer_segment,status,created_at'
const RAW_COLS = 'id,branch,ota_site,review_month,reviewer,country,travel_type,room_type,rating,content,has_response,raw_date,created_at'

const numOrNull = (x: unknown) => (x == null || x === '' ? null : Number(x))

export interface ReviewsData {
  month: string
  months: string[]          // 리뷰·Raw 어느 쪽이든 있는 달(최신 순)
  reviewMonths: string[]
  rawMonths: string[]
  reviews: ReviewRow[]
  raws: RawRow[]
  analysis: Record<string, Analysis>
  stars: Record<string, NegStar[]>
  tasks: Record<string, LinkedTask[]>
  error: string | null
}

/** 달 하나의 리뷰·Raw 와 그 리뷰의 2.0 분석. month 가 목록에 없으면 리뷰가 있는 마지막 달 */
export async function getReviewsData(want?: string): Promise<ReviewsData> {
  const empty: ReviewsData = { month: '', months: [], reviewMonths: [], rawMonths: [], reviews: [], raws: [], analysis: {}, stars: {}, tasks: {}, error: null }
  try {
    const [revM, rawM] = await Promise.all([columnAll('reviews', 'review_month'), columnAll('raw_reviews', 'review_month')])
    const reviewMonths = uniqMonths(revM), rawMonths = uniqMonths(rawM)
    const months = uniqMonths(reviewMonths, rawMonths)
    const month = want && months.includes(want) ? want : reviewMonths[0] ?? months[0] ?? ''
    if (!month) return { ...empty, error: null }

    const [reviewRows, rawRows, taskRows] = await Promise.all([
      pageAll<ReviewRow>((a, b) => supabase.from('reviews').select(REVIEW_COLS).eq('review_month', month).order('id').range(a, b) as unknown as Res<ReviewRow>),
      pageAll<RawRow>((a, b) => supabase.from('raw_reviews').select(RAW_COLS).eq('review_month', month).order('id').range(a, b) as unknown as Res<RawRow>),
      pageAll<{ id: string; title: string; task_month: string | null; status: string | null; linked_review_ids: string[] | null }>((a, b) =>
        supabase.from('tasks').select('id,title,task_month,status,linked_review_ids').not('linked_review_ids', 'is', null).order('id').range(a, b)),
    ])
    const reviews = reviewRows.map(r => ({ ...r, rating: numOrNull(r.rating) }))
    const raws = rawRows.map(r => ({ ...r, rating: numOrNull(r.rating) }))
    const { analysis, stars } = await getAnalysisOf(reviews.map(r => r.id))

    const ids = new Set(reviews.map(r => r.id))
    const tasks: Record<string, LinkedTask[]> = {}
    for (const t of taskRows) for (const rid of t.linked_review_ids ?? []) {
      if (!ids.has(rid)) continue
      ;(tasks[rid] ??= []).push({ id: t.id, title: t.title, task_month: t.task_month, status: t.status })
    }
    return { month, months, reviewMonths, rawMonths, reviews, raws, analysis, stars, tasks, error: null }
  } catch (e) {
    console.error('v2 리뷰 원문 조회 실패', (e as Error).message)
    return { ...empty, error: '리뷰 데이터를 읽지 못했습니다.' }
  }
}

interface VraRow { review_id: string; branch: string; channel: string | null; review_date: string; score10: number | string | null; neg_count: number | null; pos_count: number | null }
interface StarRow { id: string; review_id: string; branch: string; star_date: string; galaxy: string | null; phenomenon: string; owner: string | null; quote: string | null }

/** 리뷰 id 로 2.0 분석(voc_review_analysis)과 불편 별(voc_stars polarity='neg')을 읽는다. id 는 100개씩(GET 주소 길이) */
export async function getAnalysisOf(ids: string[]): Promise<{ analysis: Record<string, Analysis>; stars: Record<string, NegStar[]> }> {
  const analysis: Record<string, Analysis> = {}
  const stars: Record<string, NegStar[]> = {}
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  await Promise.all(chunks.map(async chunk => {
    const [vra, st] = await Promise.all([
      pageAll<VraRow>((a, b) => supabase.from('voc_review_analysis')
        .select('review_id,branch,channel,review_date,score10,neg_count,pos_count').in('review_id', chunk).order('review_id').range(a, b)),
      pageAll<StarRow>((a, b) => supabase.from('voc_stars')
        .select('id,review_id,branch,star_date,galaxy,phenomenon,owner,quote').eq('polarity', 'neg').in('review_id', chunk).order('id').range(a, b)),
    ])
    for (const r of vra) {
      analysis[r.review_id] = {
        reviewId: r.review_id, branch: r.branch, channel: r.channel ?? '', date: r.review_date,
        score: numOrNull(r.score10), neg: r.neg_count ?? 0, pos: r.pos_count ?? 0,
      }
    }
    for (const s of st) {
      ;(stars[s.review_id] ??= []).push({
        id: s.id, reviewId: s.review_id, branch: s.branch, date: s.star_date,
        galaxy: s.galaxy ?? '기타', phenomenon: s.phenomenon, owner: s.owner ?? '', quote: s.quote ?? '',
      })
    }
  }))
  return { analysis, stars }
}
