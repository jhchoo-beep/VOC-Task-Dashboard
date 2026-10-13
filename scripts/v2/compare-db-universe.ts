/**
 * 대조 — 실제 DB 에서 조립한 우주 vs data/universe.json(A 의 백필 빌드 결과)
 * ────────────────────────────────────────────────────────────────
 * 별·별자리·은하·리뷰의 수와 ID 집합, 별자리 상태 분포, 지표 값, 모든 레코드의 필드 값을 비교하고
 * 다른 점을 전부 목록으로 낸다(표본만이 아니라 전 레코드 전 필드). 표본 몇 건은 양쪽 값을 나란히 적는다.
 *
 *   npx tsx scripts/v2/compare-db-universe.ts [--source db|fixture] [--data <data 폴더>] [--out <보고서.json>]
 *     db      운영 DB(.env.local 의 anon 키, SELECT 만)에서 lib/v2/universeFromDb.ts 로 조립(기본)
 *     fixture universe.json + A 원천 파일을 load-universe 와 같은 대응으로 표 행으로 바꿔 조립(적재 전 검증)
 *
 * 종료 코드: 0 = 다른 점 없음(예상된 차이만), 1 = 다른 점 있음, 2 = 적재 전(조립할 데이터 없음)
 * ────────────────────────────────────────────────────────────────
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { assembleUniverse, loadUniverseFromDb, type Universe } from '../../lib/v2/universeFromDb'
import { rowsFromUniverseFiles } from './universe-fixture-rows'
import { supabaseFromEnvFile } from './supabase-env'

/* eslint-disable @typescript-eslint/no-explicit-any */
const argv = process.argv.slice(2)
const opt = (k: string, d: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d)
const source = opt('--source', 'db')
const dataDir = opt('--data', 'C:/Users/MGRV/.claude/Output/2026-10-12_voc-v2-build/data')
const outPath = opt('--out', `C:/Users/MGRV/.claude/Output/2026-10-12_voc-v2-build/app-shots/compare-${source}.json`)

/** universe.json 에 있으나 DB 조립에 일부러 넣지 않는 칸(화면이 쓰지 않고 DB 에 원천이 없음), 실행마다 다른 칸. */
const EXPECTED: Record<string, string> = {
  'meta.generated_at': '생성 시각 — 조립할 때마다 다름',
  'meta.counts.duplicate_reviews': 'A 의 중복 리뷰 판정 수 — DB 에 원천 없음(화면 안 씀)',
  'meta.counts.merged_duplicate_stars': 'A 의 합침 뒤 중복 별 제거 수 — DB 에 원천 없음(화면 안 씀)',
  'meta.voice_dedup': 'A 의 합침 뒤 중복 별 제거 기록(뺀 별 ID) — DB 에 원천 없음(화면 안 씀)',
  'core.basis': '설명 문구 — DB 에 원천 없음(화면 안 씀)',
  'north_star.not_computed': '설명 문구 — DB 에 원천 없음(화면 안 씀)',
  'guardrails.voice_ratio_not_computed': '설명 문구 — DB 에 원천 없음(화면 안 씀)',
}

interface Diff { path: string; file: unknown; db: unknown; note?: string }
const diffs: Diff[] = []
const expected: Diff[] = []

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(',')}}`
  return JSON.stringify(v === undefined ? null : v)
}
const same = (a: unknown, b: unknown) => canon(a) === canon(b)
const short = (v: unknown) => { const s = JSON.stringify(v); return s && s.length > 300 ? `${s.slice(0, 300)}…(${s.length}자)` : v }

function record(path: string, file: unknown, db: unknown, note?: string) {
  const d = { path, file: short(file), db: short(db), ...(note ? { note } : {}) }
  if (EXPECTED[path]) expected.push({ ...d, note: EXPECTED[path] })
  else diffs.push(d)
}

/** 객체의 모든 키를 비교(한쪽에만 있는 키도). nested 는 deep 비교. */
function compareObject(path: string, a: any, b: any, opts: { recurse?: string[] } = {}) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])
  for (const k of keys) {
    const p = `${path}.${k}`
    if (opts.recurse?.includes(k) && a?.[k] && b?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
      compareObject(p, a[k], b[k])
      continue
    }
    if (!(k in (b ?? {}))) record(p, a[k], undefined, 'DB 조립에 없음')
    else if (!(k in (a ?? {}))) record(p, undefined, b[k], 'DB 조립에만 있음')
    else if (!same(a[k], b[k])) record(p, a[k], b[k])
  }
}

/** 키로 묶어 레코드 집합과 필드 비교. */
function compareKeyed(label: string, fileArr: any[], dbArr: any[], keyOf: (x: any) => string) {
  const fm = new Map(fileArr.map(x => [keyOf(x), x]))
  const dm = new Map(dbArr.map(x => [keyOf(x), x]))
  if (fileArr.length !== dbArr.length) record(`${label}.length`, fileArr.length, dbArr.length)
  const onlyFile = [...fm.keys()].filter(k => !dm.has(k))
  const onlyDb = [...dm.keys()].filter(k => !fm.has(k))
  if (onlyFile.length) record(`${label}[ID 집합]`, onlyFile.slice(0, 50), [], `universe.json 에만 ${onlyFile.length}개`)
  if (onlyDb.length) record(`${label}[ID 집합]`, [], onlyDb.slice(0, 50), `DB 조립에만 ${onlyDb.length}개`)
  for (const [k, f] of fm) {
    const d = dm.get(k)
    if (d) compareObject(`${label}[${k}]`, f, d)
  }
  const fo = fileArr.map(keyOf).join('|'), dor = dbArr.map(keyOf).join('|')
  if (fo !== dor && onlyFile.length === 0 && onlyDb.length === 0) record(`${label}[순서]`, fileArr.slice(0, 8).map(keyOf), dbArr.slice(0, 8).map(keyOf), '같은 집합, 배열 순서만 다름')
}

function statusDist(u: any): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of u.constellations) out[`${c.polarity}|${c.status}`] = (out[`${c.polarity}|${c.status}`] ?? 0) + 1
  return out
}

async function main() {
  const file = JSON.parse(readFileSync(join(dataDir, 'universe.json'), 'utf8'))
  let db: Universe
  let warnings: string[] = []
  if (source === 'fixture') {
    const r = assembleUniverse(rowsFromUniverseFiles(dataDir))
    db = r.universe
    warnings = r.warnings
  } else {
    const load = await loadUniverseFromDb(supabaseFromEnvFile())
    if (load.state !== 'ready') {
      console.log(JSON.stringify({ state: load.state, reason: load.reason, tables: load.tables }, null, 1))
      process.exit(2)
    }
    db = load.universe
    warnings = load.warnings
  }
  const d: any = db

  // 1. meta·지표
  compareObject('meta', file.meta, d.meta, { recurse: ['counts', 'period', 'rules', 'window'] })
  compareObject('north_star', file.north_star, d.north_star, { recurse: ['inputs'] })
  compareObject('core', file.core, d.core)
  compareKeyed('guardrails.ota_rating', file.guardrails.ota_rating, d.guardrails.ota_rating, x => `${x.branch}|${x.channel}`)
  compareKeyed('guardrails.voice_ratio', file.guardrails.voice_ratio, d.guardrails.voice_ratio, x => `${x.branch}|${x.channel}`)
  for (const k of Object.keys(file.guardrails)) if (!(k in d.guardrails)) record(`guardrails.${k}`, file.guardrails[k], undefined, 'DB 조립에 없음')

  // 2. 은하·별자리·별·리뷰(전 레코드 전 필드)
  compareKeyed('galaxies', file.galaxies, d.galaxies, x => x.id)
  compareKeyed('constellations', file.constellations, d.constellations, x => x.id)
  compareKeyed('stars', file.stars, d.stars, x => x.id)
  const fr = Object.entries(file.reviews).map(([id, r]: any) => ({ id, ...r }))
  const dr = Object.entries(d.reviews).map(([id, r]: any) => ({ id, ...r }))
  compareKeyed('reviews', fr, dr, x => x.id)

  // 3. 상태 분포
  const sf = statusDist(file), sd = statusDist(d)
  if (!same(sf, sd)) record('constellations[상태 분포]', sf, sd)

  // 4. 표본(양쪽 값 나란히)
  const pickStars = [file.stars[0], file.stars[Math.floor(file.stars.length / 2)], file.stars[file.stars.length - 1]].map((s: any) => s.id)
  const withTask = file.constellations.find((c: any) => c.task)?.id
  const seed = file.constellations.find((c: any) => c.status === '씨앗')?.id
  const five = Object.entries(file.reviews).find(([, r]: any) => r.scale === 5)?.[0]
  const orig = Object.entries(file.reviews).find(([, r]: any) => r.text_orig && r.text_ko && r.text_orig !== r.text_ko)?.[0]
  const trim = (o: any) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.length > 60 ? `${v.slice(0, 60)}…` : Array.isArray(v) && v.length > 6 ? [...v.slice(0, 6), `…(${v.length})`] : v]))
  const samples = {
    stars: pickStars.map(id => ({ id, file: file.stars.find((s: any) => s.id === id), db: d.stars.find((s: any) => s.id === id) })),
    constellations: [withTask, seed].filter(Boolean).map(id => ({ id, file: trim(file.constellations.find((c: any) => c.id === id)), db: trim(d.constellations.find((c: any) => c.id === id)) })),
    reviews: [five, orig].filter(Boolean).map(id => ({ id, file: trim(file.reviews[id as string]), db: trim(d.reviews[id as string]) })),
    metrics: { file: { north_star: file.north_star.value, core: file.core }, db: { north_star: d.north_star.value, core: d.core } },
  }

  const summary = {
    source, universe_file: join(dataDir, 'universe.json'), universe_generated_at: file.meta.generated_at,
    as_of: { file: file.meta.as_of, db: d.meta.as_of },
    counts: {
      stars: [file.stars.length, d.stars.length], constellations_and_seeds: [file.constellations.length, d.constellations.length],
      galaxies: [file.galaxies.length, d.galaxies.length], reviews: [Object.keys(file.reviews).length, Object.keys(d.reviews).length],
    },
    status: { file: sf, db: sd },
    north_star: [file.north_star.value, d.north_star.value],
    differences: diffs.length, expected_differences: expected.length, warnings: warnings.length,
  }
  const report = { generated_at: new Date().toISOString(), summary, differences: diffs, expected_differences: expected, warnings, samples }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 1), 'utf8')

  console.log(JSON.stringify(summary, null, 1))
  if (diffs.length) {
    console.log(`\n다른 점 ${diffs.length}건(전부 ${outPath}):`)
    for (const x of diffs.slice(0, 80)) console.log(`- ${x.path}: file=${JSON.stringify(x.file)} db=${JSON.stringify(x.db)}${x.note ? ` (${x.note})` : ''}`)
    if (diffs.length > 80) console.log(`  … 외 ${diffs.length - 80}건`)
  } else {
    console.log('\n다른 점 0건')
  }
  console.log(`예상된 차이 ${expected.length}건: ${expected.map(x => x.path).join(', ')}`)
  if (warnings.length) console.log(`조립 경고 ${warnings.length}건: ${warnings.slice(0, 10).join(' / ')}`)
  process.exit(diffs.length ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
