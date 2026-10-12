/**
 * Supabase MCP(execute_sql) 결과 파일 → JSON 원천 파일 (V2 백필 전용, 읽기 전용)
 * ────────────────────────────────────────────────────────────────
 * MCP 결과가 길면 Claude Code가 `{"result": "...<untrusted-data-…>[행 배열]</untrusted-data-…>..."}`
 * 형태의 파일로 저장한다. 본문을 사람이 옮겨 적으면 한글이 바뀐다(2026-09-30 백필 161건 중 1건
 * 2글자) — 그래서 저장된 파일을 그대로 파싱한다.
 *
 * md5_* 열이 있으면(쿼리에서 md5(coalesce(col,'')) AS md5_<col> 로 함께 뽑았을 때) 로컬에서
 * 같은 값을 다시 계산해 한 글자라도 다르면 실패한다. 대조가 끝난 md5_* 열은 결과에서 뺀다.
 *
 *   npx tsx scripts/v2/mcp-result-to-json.ts <MCP 결과 파일> <출력 json> [--md5 content=md5_c,content_ko=md5_ko]
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

const [inPath, outPath, ...rest] = process.argv.slice(2)
if (!inPath || !outPath) die('사용법: mcp-result-to-json.ts <입력> <출력> [--md5 col=md5col,...]')

const md5Arg = rest[rest.indexOf('--md5') + 1]
const md5Pairs: [string, string][] = rest.includes('--md5') && md5Arg
  ? md5Arg.split(',').map(p => p.split('=') as [string, string])
  : []

const raw = readFileSync(inPath, 'utf8')
let text: string
try {
  text = JSON.parse(raw).result
} catch {
  text = raw
}
// 머리말 문장에도 같은 여는 태그가 한 번 나온다 — 닫는 태그 직전의 마지막 여는 태그부터 읽는다.
const close = text.search(/<\/untrusted-data-[0-9a-f-]+>/)
if (close < 0) die('untrusted-data 닫는 태그를 찾지 못했습니다')
const head = text.substring(0, close)
const openRe = /<untrusted-data-[0-9a-f-]+>/g
let lastOpenEnd = -1
for (let mm = openRe.exec(head); mm; mm = openRe.exec(head)) lastOpenEnd = mm.index + mm[0].length
if (lastOpenEnd < 0) die('untrusted-data 여는 태그를 찾지 못했습니다')
const rows = JSON.parse(head.substring(lastOpenEnd).trim())
if (!Array.isArray(rows)) die('결과가 배열이 아닙니다')

const md5 = (s: string) => createHash('md5').update(Buffer.from(s, 'utf8')).digest('hex')
let checked = 0
for (const row of rows) {
  for (const [col, hashCol] of md5Pairs) {
    const local = md5(row[col] ?? '')
    if (local !== row[hashCol]) die(`md5 불일치: id=${row.id} ${col}`)
    delete row[hashCol]
    checked++
  }
}

const tmp = `${outPath}.tmp`
writeFileSync(tmp, JSON.stringify(rows, null, 1), 'utf8')
renameSync(tmp, outPath)
console.log(JSON.stringify({ rows: rows.length, md5_checked: checked, out: outPath }))
