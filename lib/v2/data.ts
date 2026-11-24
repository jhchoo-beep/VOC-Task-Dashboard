// STAY VOC 2.0 — 서버 쪽 조회. 계산은 lib/v2/metrics.ts, 여기서는 읽기만 한다.
// 🔴 PostgREST 는 한 응답에 1000행이 상한이라 1000행씩 이어 받고, PK로 정렬해 페이지가 겹치지 않게 한다.
import { supabase } from '../supabase'
import type { Rev, Star } from './metrics'

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

interface RevRow { review_id: string; branch: string; channel: string | null; review_date: string; week_label: string | null; score10: number | string | null; has_text: boolean | null; neg_count: number | null; pos_count: number | null }
interface StarRow { id: string; review_id: string; branch: string; channel: string | null; star_date: string; galaxy: string | null; phenomenon: string; owner: string | null; quote: string | null }

export interface V2Base {
  revs: Rev[]
  stars: Star[]
  analyzedAt: string | null
  error: string | null
}

export async function getV2Base(): Promise<V2Base> {
  try {
    const [revRows, starRows, last] = await Promise.all([
      pageAll<RevRow>((a, b) => supabase.from('voc_review_analysis')
        .select('review_id,branch,channel,review_date,week_label,score10,has_text,neg_count,pos_count').order('review_id').range(a, b)),
      pageAll<StarRow>((a, b) => supabase.from('voc_stars')
        .select('id,review_id,branch,channel,star_date,galaxy,phenomenon,owner,quote').eq('polarity', 'neg').order('id').range(a, b)),
      supabase.from('voc_review_analysis').select('analyzed_at').order('analyzed_at', { ascending: false }).limit(1)
        .then(r => (r.data?.[0]?.analyzed_at as string | undefined) ?? null),
    ])
    return {
      revs: revRows.map(r => ({
        id: r.review_id, branch: r.branch, channel: r.channel ?? '', date: r.review_date, week: r.week_label ?? undefined,
        score: r.score10 == null ? null : Number(r.score10), hasText: !!r.has_text,
        neg: r.neg_count ?? 0, pos: r.pos_count ?? 0,
      })),
      stars: starRows.map(s => ({
        id: s.id, reviewId: s.review_id, branch: s.branch, channel: s.channel ?? '', date: s.star_date,
        galaxy: s.galaxy ?? '기타', phenomenon: s.phenomenon, owner: s.owner ?? '', quote: s.quote ?? '',
      })),
      analyzedAt: last,
      error: null,
    }
  } catch (e) {
    console.error('v2 조회 실패', (e as Error).message)
    return { revs: [], stars: [], analyzedAt: null, error: 'VOC 2.0 분석 데이터를 읽지 못했습니다.' }
  }
}

export interface ReviewText { id: string; text: string; original: string | null }

/** 리뷰 원문(한국어 번역 우선). id 가 많으면 100개씩 나눠 읽는다(GET 주소 길이) */
export async function getReviewTexts(ids: string[]): Promise<Record<string, ReviewText>> {
  const out: Record<string, ReviewText> = {}
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data, error } = await supabase.from('reviews').select('id,content,content_ko').in('id', chunk)
    if (error) { console.error('리뷰 원문 조회 실패', error.message); continue }
    for (const r of data ?? []) {
      const ko = (r.content_ko as string | null)?.trim()
      const orig = (r.content as string | null)?.trim() ?? ''
      out[r.id as string] = { id: r.id as string, text: ko || orig, original: ko && ko !== orig ? orig : null }
    }
  }
  return out
}

export interface TaskBrief { id: string; branch: string; title: string; status: string; task_month: string | null; due_date: string | null; assignee: string | null }

export async function getTaskBriefs(): Promise<TaskBrief[]> {
  const { data, error } = await supabase.from('tasks')
    .select('id,branch,title,status,task_month,due_date,assignee').order('created_at', { ascending: false })
  if (error) { console.error('수행과제 조회 실패', error.message); return [] }
  return (data ?? []) as TaskBrief[]
}
