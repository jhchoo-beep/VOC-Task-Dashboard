/**
 * 픽스처 — data/universe.json 과 A 의 원천 파일을 운영 표 행(DbSnapshot)으로 바꾼다
 * ────────────────────────────────────────────────────────────────
 * scripts/v2/load-universe.ts 의 적재 대응(별·별자리·이력·월 지표)과 같은 모양으로 만든다.
 * 운영 표가 적재되기 전(A10 전)에 조립 코드(lib/v2/universeFromDb.ts)를 실데이터 규모로 검증·렌더하는 데 쓴다.
 * 적재 뒤에는 compare-db-universe.ts --source db 로 실제 표를 읽는다.
 *
 * 읽는 파일(<data>): universe.json, metrics.json, reviews.resolved.json,
 *                   source/tasks.json, source/ota_properties.json, source/ota_scores.json
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  DbSnapshot, StarRow, ConstellationRow, EventRow, MetricRow, ReviewRow, TaskRow, PropertyRow, ScoreRow,
} from '../../lib/v2/universeFromDb'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowsFromUniverseFiles(dataDir: string): DbSnapshot {
  const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))
  const u = read('universe.json')
  const metrics = read('metrics.json')
  const resolved: any[] = read('reviews.resolved.json')
  const tasks: any[] = read('source/tasks.json')
  const props: any[] = read('source/ota_properties.json')
  const scores: any[] = read('source/ota_scores.json')

  const constellations: ConstellationRow[] = u.constellations.map((c: any) => ({
    id: c.id, branch: c.branch, polarity: c.polarity, galaxy: c.galaxy, name: c.name, owner: c.owner, status: c.status,
    formed_at: c.formed_at ?? null, first_date: c.first_date, last_date: c.last_date, star_count: c.star_ids.length,
    distinct_weeks: c.distinct_weeks, recent_4w: c.recent_4w, monthly: c.monthly, channels: c.channels,
    task_id: c.task ? c.task.id : null, observation_start: c.observation_start ?? null, relapse_count: c.relapse_count ?? 0,
    summary: c.summary, sort_order: c.order ?? null, as_of: u.meta.as_of,
  }))

  const stars: StarRow[] = u.stars.map((s: any) => ({
    id: s.id, review_id: s.review_id, branch: s.branch, channel: s.channel, star_date: s.date, date_source: s.date_source,
    iso_week: s.week, polarity: s.polarity, galaxy: s.galaxy, phenomenon: s.phenomenon, quote: s.quote, owner: s.owner,
    relation_signal: s.relation_signal, constellation_id: s.constellation_id,
  }))

  const events: EventRow[] = []
  for (const c of u.constellations) {
    c.history.forEach((h: any, i: number) => events.push({
      id: `${c.id}#${String(i + 1).padStart(2, '0')}`, constellation_id: c.id, event_type: h.type, event_at: h.at, note: h.note,
    }))
  }

  // 월 지표: load-universe.ts 40-metrics 와 같은 행(지점 '전체' 행 + 체크아웃 있는 채널 행)
  const metricRows: MetricRow[] = []
  for (const b of u.meta.branches) {
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) metricRows.push({ branch: b, month: m, channel: '전체', inputs: {} })
  }
  for (const d of metrics.detail) {
    for (const mm of d.monthly) {
      metricRows.push({
        branch: d.branch, month: mm.month, channel: d.channel,
        inputs: {
          period: mm.period, text_reviews: mm.text_reviews, text_reviews_with_neg_star: mm.text_reviews_with_neg_star,
          neg_ratio: mm.neg_ratio, channel_reviews_delta: mm.channel_reviews_delta, channel_checkouts: mm.channel_checkouts,
          weeks: d.weekly_voice.filter((x: any) => x.week.startsWith(mm.month)),
        },
      })
    }
  }

  const reviewIds = new Set(u.stars.map((s: any) => s.review_id))
  const reviews: ReviewRow[] = resolved.filter(r => reviewIds.has(r.id)).map(r => ({
    id: r.id, branch: r.branch, ota_site: r.ota_site, rating: r.rating10, content: r.content, content_ko: r.content_ko,
  }))
  const taskRows: TaskRow[] = tasks.map(t => ({ id: t.id, title: t.title, status: t.status, task_month: t.task_month }))
  const properties: PropertyRow[] = props.map(p => ({ property_id: p.property_id, branch: p.branch, ota_name: p.ota_name, score_max: p.score_max, active: p.active }))
  const scoreRows: ScoreRow[] = scores.map(s => ({ id: s.id, property_id: s.property_id, overall_score: s.overall_score, review_count: s.review_count, recorded_at: s.recorded_at }))

  return {
    stars, constellations, events, metrics: metricRows, reviews, tasks: taskRows, properties, scores: scoreRows,
    reviewCounts: { reviews: resolved.length, reviews_with_text: resolved.filter(r => r.has_text).length },
  }
}
