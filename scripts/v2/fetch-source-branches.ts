/**
 * V2 백필 — 지점을 지정해 원천(source/*.json)을 DB 에서 읽어 내려받는다 (SELECT 만, anon 키)
 * ────────────────────────────────────────────────────────────────
 * MCP 결과를 옮겨 적지 않고 supabase-js 응답을 그대로 저장한다(한글 옮겨 적기 오류 전례).
 * 신설·동대문 때와 같은 칸·같은 조회 범위(6~10월 리뷰, 짝짓기용 앞뒤 달, raw 전부).
 *
 *   npx tsx scripts/v2/fetch-source-branches.ts <data 폴더> <지점,지점> [--before 2026-10-13]
 * 출력(<data>/source/): reviews.<지점>.json, reviews_pairing_extra.json, raw_reviews.<지점>.json,
 *   ota_properties.json, ota_scores.json, tasks.json, task_logs.json
 * ────────────────────────────────────────────────────────────────
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseFromEnvFile } from './supabase-env'

const argv = process.argv.slice(2)
const dataDir = argv[0]
const branches = (argv[1] ?? '').split(',').filter(Boolean)
if (!dataDir || branches.length === 0) {
  console.error('사용법: fetch-source-branches.ts <data 폴더> <지점,지점> [--before YYYY-MM-DD]')
  process.exit(1)
}
const before = argv.includes('--before') ? argv[argv.indexOf('--before') + 1] : '2026-10-13'   // created_at < 이 날짜 00:00 KST
const SCOPE_MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const EXTRA_MONTHS = ['2026-05', '2026-11']
const client = supabaseFromEnvFile()
const srcDir = join(dataDir, 'source')
mkdirSync(srcDir, { recursive: true })

async function all(table: string, columns: string, apply: (q: any) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await apply(client.from(table).select(columns)).order('id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const save = (name: string, rows: any[]) => {
  const p = join(srcDir, name)
  writeFileSync(`${p}.tmp`, JSON.stringify(rows, null, 1), 'utf8')
  renameSync(`${p}.tmp`, p)
  console.log(`${name}: ${rows.length}`)
}

const REV_COLS = 'id,branch,ota_site,rating,review_month,content,content_ko,categories,severity,churn_triggers,status,created_at'
const kstCut = `${before}T00:00:00+09:00`
async function main() {
  for (const b of branches) {
    save(`reviews.${b}.json`, await all('reviews', REV_COLS, q => q.eq('branch', b).in('review_month', SCOPE_MONTHS).lt('created_at', kstCut)))
    save(`raw_reviews.${b}.json`, await all('raw_reviews', 'id,branch,ota_site,review_month,raw_date,rating,created_at,content', q => q.eq('branch', b)))
  }
  save('reviews_pairing_extra.json', await all('reviews', 'id,branch,ota_site,rating,review_month,content,content_ko,created_at', q => q.in('branch', branches).in('review_month', EXTRA_MONTHS)))
  {
    const { data, error } = await client.from('ota_properties').select('property_id,branch,ota_name,score_max,okr_target,active').order('property_id')
    if (error) throw new Error(`ota_properties: ${error.message}`)
    save('ota_properties.json', data)
  }
  save('ota_scores.json', await all('ota_scores', 'id,property_id,overall_score,review_count,recorded_at,created_at', q => q))
  save('tasks.json', await all('tasks', '*', q => q.in('branch', branches)))
  const taskIds = (await all('tasks', 'id', q => q.in('branch', branches))).map((t: any) => t.id)
  save('task_logs.json', taskIds.length ? await all('task_logs', 'id,task_id,content,created_at', q => q.in('task_id', taskIds)) : [])
}
main().catch(e => { console.error(e.message); process.exit(1) })
