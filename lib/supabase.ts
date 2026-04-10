import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase 환경변수가 설정되지 않았습니다')
    _client = createClient(url, key)
  }
  return _client
}

// 편의용 - 실제 호출 시점에 초기화
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  },
})

// ─── 타입 ──────────────────────────────────────────────────

export interface Review {
  id: string
  branch: string
  ota_site: string
  rating: number
  review_month: string
  content: string
  categories: string[]
  severity: string
  churn_triggers: string[]
  customer_segment: string
  priority_score: number
  crs_score: number
  status: string
  created_at: string
}

export interface Task {
  id: string
  branch: string
  task_month: string
  title: string
  churn_trigger: string[]
  problem_definition: string
  solution: string
  category: string[]
  severity: string
  priority_score: number
  assignee: string
  due_date: string
  status: string
  linked_review_ids: string[]
  done_memo: string
  created_at: string
  logs?: TaskLog[]
}

export interface TaskLog {
  id: string
  task_id: string
  author: string
  content: string
  created_at: string
}

// ─── 유틸 ──────────────────────────────────────────────────

export function calcCLX(loyal: number, satisfied: number, atRisk: number, churned: number) {
  return (loyal * 2) + (satisfied * 1) - (atRisk * 1) - (churned * 2)
}

export function getSegment(rating: number): string {
  if (rating >= 9) return '충성'
  if (rating >= 7) return '만족'
  if (rating >= 5) return '위험'
  return '이탈'
}
