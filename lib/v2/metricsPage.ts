/**
 * V2 지표 화면 — 문서 조립과 DB 읽기(라우트 두 곳과 렌더 스크립트가 같이 쓴다)
 * ────────────────────────────────────────────────────────────────
 * 템플릿 = lib/v2/viewer/metricsTemplate.ts(생성 파일, 원본 lib/v2/viewer/metrics/). 데이터 자리에 지표 JSON 을 넣는다.
 * 끼워 넣기·이스케이프는 우주 화면과 같은 renderUniversePage(정확히 1곳, `<` 탈출)를 쓴다.
 * 🔴 캐시 없음. 요청마다 DB 에서 읽는다(readDbSnapshot → assembleUniverse → buildMetricsView).
 * ────────────────────────────────────────────────────────────────
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleUniverse, readDbSnapshot } from './universeFromDb'
import { buildMetricsView, type MetricsView } from './metrics'
import { renderStatusPage, renderUniversePage, type PageOut } from './universePage'

export type MetricsLoad =
  | { state: 'ready'; view: MetricsView; warnings: string[] }
  | { state: 'empty'; reason: 'no_rows' | 'tables_missing'; tables: Record<string, number | null> }

export async function loadMetricsFromDb(client: SupabaseClient): Promise<MetricsLoad> {
  const read = await readDbSnapshot(client)
  if (read.state === 'empty') return read
  const { universe, warnings } = assembleUniverse(read.db)
  return { state: 'ready', view: buildMetricsView(universe, read.db), warnings }
}

export function metricsPageForLoad(load: MetricsLoad, template: string): PageOut {
  if (load.state === 'empty') {
    const t = load.tables
    const line = load.reason === 'tables_missing' ? 'V2 표 없음' : `별 ${t.voc_stars ?? 0} · 별자리 ${t.voc_constellations ?? 0}`
    return { status: 200, state: 'empty', html: renderStatusPage({ heading: '데이터 적재 전', lines: [line] }).replace('<title>VOC 우주</title>', '<title>VOC 지표</title>') }
  }
  return { status: 200, state: 'ready', html: renderUniversePage(template, load.view) }
}

export function metricsErrorPage(): PageOut {
  return {
    status: 500, state: 'error',
    html: renderStatusPage({ heading: '데이터를 읽지 못했습니다', lines: ['잠시 뒤 새로고침'] }).replace('<title>VOC 우주</title>', '<title>VOC 지표</title>'),
  }
}
