// KR4 STAY VOC 2.0 주간 리포트의 서버 쪽 조회. 계산은 lib/kr4v2.ts, 여기서는 읽기만 한다.
// 읽는 곳: voc_review_analysis(분석한 리뷰 = 분모) + voc_stars(polarity='neg' = 분자).
// 🔴 PostgREST 는 한 응답에 1000행이 상한이라 1000행씩 이어 받는다.
import { supabase } from './supabase'
import type { V2NegStar, V2Review } from './kr4v2'

export interface Kr4v2Props {
  reviews: V2Review[]
  stars: V2NegStar[]
  analyzedAt: string | null
  notice: string | null
}

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function getKr4v2Props(): Promise<Kr4v2Props> {
  try {
    const [reviews, stars, last] = await Promise.all([
      pageAll<V2Review>((a, b) => supabase.from('voc_review_analysis')
        .select('review_id,branch,review_date,week_label,score10,neg_count').order('review_id').range(a, b)),
      pageAll<V2NegStar>((a, b) => supabase.from('voc_stars')
        .select('review_id,branch,galaxy,phenomenon,owner').eq('polarity', 'neg').order('id').range(a, b)),
      supabase.from('voc_review_analysis').select('analyzed_at').order('analyzed_at', { ascending: false }).limit(1)
        .then(r => (r.data?.[0]?.analyzed_at as string | undefined) ?? null),
    ])
    return {
      reviews: reviews.map(r => ({ ...r, score10: r.score10 == null ? null : Number(r.score10) })),
      stars, analyzedAt: last, notice: reviews.length ? null : '아직 분석한 리뷰가 없습니다.',
    }
  } catch (e) {
    console.error('kr4v2 조회 실패', (e as Error).message)
    return { reviews: [], stars: [], analyzedAt: null, notice: 'VOC 2.0 분석 데이터를 읽지 못했습니다.' }
  }
}
