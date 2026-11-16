// KR4 STAY VOC 주간 점수 화면의 서버 쪽 조회. 계산은 lib/kr4.ts, 여기서는 읽기만 한다.
// 읽는 곳: kr4_runs(가장 최근 회차) → kr4_reviews(그 회차의 행) + 기존 ota_properties, ota_scores(OTA 표시 평점).
// 🔴 PostgREST 는 한 응답에 1000행이 상한이라 1000행씩 이어 받는다(정제 리뷰가 곧 1000건을 넘는다).
// 🔴 KR4_MOCK_FILE 이 있으면 DB 대신 그 파일을 읽는다(표가 생기기 전 로컬 개발용. 파일은 저장소 밖에 둘 것 — 리뷰 본문이 들어 있다).
import { readFileSync } from 'node:fs'
import { supabase } from './supabase'
import type { Kr4Row, OtaProperty, OtaScore } from './kr4'

export interface Kr4Props {
  rows: Kr4Row[]
  collectedThrough: string | null
  updatedAt: string | null
  ota: { props: OtaProperty[]; scores: OtaScore[] }
  source: 'db' | 'mock' | 'empty'
  /** 사람이 읽을 안내(표가 없거나 건수가 안 맞을 때) */
  notice: string | null
}

const COLS = 'review_id,branch,channel,review_date,date_unit,assigned_month,collected_date,scale,score10,cause_tags,hi_checked,content,content_ko,ko_source,is_foreign,gist'

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

export async function getKr4Props(): Promise<Kr4Props> {
  const mockFile = process.env.KR4_MOCK_FILE
  if (mockFile) {
    const m = JSON.parse(readFileSync(mockFile, 'utf8'))
    return {
      rows: m.rows, collectedThrough: m.run.collected_through, updatedAt: m.run.created_at,
      ota: { props: m.ota.properties, scores: m.ota.scores }, source: 'mock', notice: '목 데이터로 표시 중입니다(KR4_MOCK_FILE).',
    }
  }
  const empty = (notice: string): Kr4Props => ({ rows: [], collectedThrough: null, updatedAt: null, ota: { props: [], scores: [] }, source: 'empty', notice })
  try {
    const { data: runs, error } = await supabase
      .from('kr4_runs').select('id,created_at,collected_through,row_count')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    const run = runs?.[0]
    if (!run) return empty('아직 게시된 KR4 주간 데이터가 없습니다.')
    const [rows, props, scores] = await Promise.all([
      pageAll<Kr4Row>((a, b) => supabase.from('kr4_reviews').select(COLS).eq('run_id', run.id).order('review_id').range(a, b)),
      pageAll<OtaProperty>((a, b) => supabase.from('ota_properties').select('property_id,branch,ota_name,score_max,active').order('property_id').range(a, b)),
      supabase.from('ota_scores').select('property_id,overall_score,review_count,recorded_at').order('recorded_at', { ascending: false }).limit(200)
        .then(r => { if (r.error) throw new Error(r.error.message); return (r.data ?? []) as OtaScore[] }),
    ])
    const notice = rows.length !== run.row_count ? `회차 건수(${run.row_count})와 읽은 건수(${rows.length})가 다릅니다. 업로드가 끝나지 않았을 수 있습니다.` : null
    return { rows, collectedThrough: run.collected_through, updatedAt: run.created_at, ota: { props, scores }, source: 'db', notice }
  } catch (e) {
    console.error('kr4 조회 실패', (e as Error).message)
    return empty('KR4 주간 데이터를 읽지 못했습니다. 표가 아직 만들어지지 않았을 수 있습니다.')
  }
}
