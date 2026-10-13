/**
 * /v2/metrics 가 돌려줄 문서를 로그인 없이 파일로 만든다(캡처·확인용). 라우트와 같은 함수를 그대로 부른다.
 *   npx tsx scripts/v2/render-metrics-page.ts --out <파일.html>      (.env.local 의 anon 키로 SELECT 만)
 */
import { writeFileSync } from 'node:fs'
import { loadMetricsFromDb, metricsPageForLoad } from '../../lib/v2/metricsPage'
import { METRICS_TEMPLATE } from '../../lib/v2/viewer/metricsTemplate'
import { supabaseFromEnvFile } from './supabase-env'

const argv = process.argv.slice(2)
const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null
if (!out) { console.error('사용법: render-metrics-page.ts --out <파일.html>'); process.exit(1) }

async function main() {
  const load = await loadMetricsFromDb(supabaseFromEnvFile())
  const page = metricsPageForLoad(load, METRICS_TEMPLATE)
  writeFileSync(out!, page.html, 'utf8')
  console.log(JSON.stringify({ out, state: page.state, bytes: Buffer.byteLength(page.html, 'utf8'), warnings: load.state === 'ready' ? load.warnings.length : 0 }))
}
main().catch(e => { console.error(e); process.exit(1) })
