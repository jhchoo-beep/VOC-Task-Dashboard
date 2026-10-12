/**
 * /v2/universe 가 돌려줄 문서를 로그인 없이 파일로 만든다(캡처·크기 확인용)
 * ────────────────────────────────────────────────────────────────
 * 라우트와 같은 함수(loadUniverseFromDb·assembleUniverse → pageForLoad + UNIVERSE_TEMPLATE)를 그대로 부른다.
 *
 *   npx tsx scripts/v2/render-universe-page.ts --out <파일.html> [--source db|fixture|json] [--data <data 폴더>]
 *     db      운영 DB 에서 읽어 조립(기본). .env.local 의 NEXT_PUBLIC_SUPABASE_URL·ANON_KEY 를 쓴다(SELECT 만).
 *     fixture universe.json + A 원천 파일 → 표 행(load-universe 와 같은 대응) → 조립(A10 적재 전 검증용)
 *     json    universe.json 을 조립 없이 그대로 넣는다(템플릿만 확인)
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assembleUniverse, loadUniverseFromDb, type UniverseLoad } from '../../lib/v2/universeFromDb'
import { pageForLoad, renderUniversePage } from '../../lib/v2/universePage'
import { UNIVERSE_TEMPLATE } from '../../lib/v2/viewer/universeTemplate'
import { rowsFromUniverseFiles } from './universe-fixture-rows'
import { supabaseFromEnvFile } from './supabase-env'

const argv = process.argv.slice(2)
const opt = (k: string, d?: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const out = opt('--out')
const source = opt('--source', 'db')!
const dataDir = opt('--data', 'C:/Users/MGRV/.claude/Output/2026-10-12_voc-v2-build/data')!
if (!out) {
  console.error('사용법: render-universe-page.ts --out <파일.html> [--source db|fixture|json] [--data <폴더>]')
  process.exit(1)
}

async function main() {
  const t0 = Date.now()
  let html: string
  let state: string
  let warnings: string[] = []
  if (source === 'json') {
    html = renderUniversePage(UNIVERSE_TEMPLATE, JSON.parse(readFileSync(join(dataDir, 'universe.json'), 'utf8')))
    state = 'ready'
  } else {
    let load: UniverseLoad
    if (source === 'fixture') {
      const r = assembleUniverse(rowsFromUniverseFiles(dataDir))
      load = { state: 'ready', universe: r.universe, warnings: r.warnings }
    } else {
      load = await loadUniverseFromDb(supabaseFromEnvFile())
    }
    if (load.state === 'ready') warnings = load.warnings
    const page = pageForLoad(load, UNIVERSE_TEMPLATE)
    html = page.html
    state = load.state === 'empty' ? `empty(${load.reason})` : 'ready'
  }
  writeFileSync(out!, html, 'utf8')
  const bytes = Buffer.byteLength(html, 'utf8')
  console.log(JSON.stringify({
    source, state, out, bytes, mb: Math.round((bytes / 1024 / 1024) * 100) / 100, under_3mb: bytes < 3 * 1024 * 1024,
    ms: Date.now() - t0, warnings: warnings.length, warning_samples: warnings.slice(0, 10),
  }, null, 1))
}

main().catch(e => { console.error(e); process.exit(1) })
