/**
 * KR4 2.0 — LLM 추출 결과 검증 + 적재 SQL 만들기 (DB에 쓰지 않음)
 * ────────────────────────────────────────────────────────────────
 * prepare.ts 가 만든 폴더(targets.json, batch-NN.json, phenomena.json)에
 * LLM 이 쓴 out-NN.json 을 더해 docs/kr4v2/star-extraction-prompt.md 5절 검증을 하고,
 * 통과하면 적재 SQL 을 만든다. SQL 실행은 Supabase MCP execute_sql 로 한다
 * (voc_review_analysis·voc_stars 는 RLS 가 켜져 있어 anon 키로는 쓸 수 없다).
 *
 *   npx tsx scripts/kr4v2/build-sql.ts <폴더> [--tag llm-kr4v2-YYYY-MM-DD]
 *
 * 출력: <폴더>/analysis.sql (voc_review_analysis, on conflict do nothing)
 *       <폴더>/stars-N.sql  (voc_stars 불편 별만, 6만 자 단위)
 * 검증 오류가 1건이라도 있으면 SQL 을 만들지 않고 종료 코드 1 로 끝난다.
 * 🔴 칭찬 별은 적재하지 않는다(pos_count 만 기록) — 환대 지수 재설계 전까지 보류.
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const dir = argv[0]
if (!dir) { console.error('사용법: build-sql.ts <폴더> [--tag 태그]'); process.exit(1) }
const TAG = argv.includes('--tag') ? argv[argv.indexOf('--tag') + 1] : `llm-kr4v2-${new Date().toISOString().slice(0, 10)}`

const G: Record<string, string> = { 청: '청결', 소: '소음', 시: '시설', 응: '응대/환대/커뮤니티', 체: '체크인/체크아웃', 위: '위치/접근성', 어: '어메니티', 가: '가격', 기: '기타' }
const OWNERS = new Set(['CM', 'FM', 'CR', 'X'])
const SIGNALS = new Set([null, 'E', 'R', 'C', 'P'])

type Target = { id: string; branch: string; channel: string; date: string; date_source: string; score10: number | null; has_text: boolean; dup: boolean; ko: string }
type Star = { rid: string; p: 'p' | 'n'; g: string; ph: string; q: string; o: string; rs: string | null }

const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const targets: Target[] = read('targets.json')
const dict = new Map<string, string>()   // "p|현상" → "은하코드|받는쪽"
if (existsSync(join(dir, 'phenomena.json'))) for (const [p, g, ph, o] of read('phenomena.json')) dict.set(`${p}|${ph}`, `${g}|${o}`)

const errs: string[] = []
const conflicts: string[] = []
const newNames = new Map<string, number>()
const stars: Star[] = []
const ws = (s: string) => s.replace(/\s+/g, '')

const batches = readdirSync(dir).filter(f => /^batch-\d+\.json$/.test(f)).sort()
for (const b of batches) {
  const n = b.slice(6, 8)
  const outFile = `out-${n}.json`
  if (!existsSync(join(dir, outFile))) { errs.push(`${n} ${outFile} 없음`); continue }
  const inp: { id: string; ko: string }[] = read(b)
  const out: { reviews: string[]; stars: [string, string, string, string, string, string, string | null][] } = read(outFile)
  const ids = new Map(inp.map(x => [x.id.slice(0, 8), x]))
  const a = [...ids.keys()].sort().join(','), c = [...(out.reviews ?? [])].sort().join(',')
  if (a !== c) errs.push(`${n} reviews 목록이 입력과 다름`)
  const seen = new Set<string>()
  for (const s of out.stars ?? []) {
    const [rid, p, g, ph, q, o, rs] = s
    const src = ids.get(rid)
    if (!src) { errs.push(`${n} 배치 밖 리뷰 ${rid}`); continue }
    if ((p !== 'p' && p !== 'n') || !G[g] || !OWNERS.has(o) || !SIGNALS.has(rs ?? null)) errs.push(`${n} 코드 오류 ${JSON.stringify(s)}`)
    if (/[()（）]/.test(ph)) errs.push(`${n} 현상 이름에 괄호 ${ph}`)
    if (rs && p !== 'n') errs.push(`${n} 칭찬 별에 관계 신호 ${rid} ${ph}`)
    if (!src.ko.includes(q) && !ws(src.ko).includes(ws(q))) errs.push(`${n} 발췌가 본문에 없음 ${rid} 「${q}」`)
    const k = `${rid}|${p}|${ph}`
    if (seen.has(k)) { errs.push(`${n} 같은 리뷰·극성·현상 중복 ${k}`); continue }
    seen.add(k)
    const d = dict.get(`${p}|${ph}`)
    if (d) { if (d !== `${g}|${o}`) conflicts.push(`${p} ${ph}: ${g}|${o} ≠ 사전 ${d}`) }
    else newNames.set(`${p} ${g} ${ph} ${o}`, (newNames.get(`${p} ${g} ${ph} ${o}`) ?? 0) + 1)
    stars.push({ rid: src.id, p: p as 'p' | 'n', g, ph, q, o, rs: rs ?? null })
  }
}

console.log(`배치 ${batches.length}개 / 대상 ${targets.length}건 / 별 ${stars.length}개 (불편 ${stars.filter(s => s.p === 'n').length} · 칭찬 ${stars.filter(s => s.p === 'p').length})`)
console.log(`검증 오류 ${errs.length}건`); errs.slice(0, 40).forEach(e => console.log('  ' + e))
console.log(`사전과 은하·받는 쪽이 다른 현상 ${conflicts.length}건`); conflicts.slice(0, 40).forEach(e => console.log('  ' + e))
console.log(`새 현상 이름 ${newNames.size}개`); [...newNames].forEach(([k, v]) => console.log(`  ${k} (${v})`))
if (errs.length || conflicts.length) { console.error('검증 미통과 — SQL 을 만들지 않았다. 해당 배치를 다시 뽑는다.'); process.exit(1) }

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const cnt = new Map<string, number>()
for (const s of stars) cnt.set(`${s.rid}|${s.p}`, (cnt.get(`${s.rid}|${s.p}`) ?? 0) + 1)
const rows = targets.map(t => `(${q(t.id)},${q(t.branch)},${q(t.channel)},${q(t.date)},${q(t.date_source)},${t.score10 == null ? 'null' : t.score10},${t.has_text},${cnt.get(`${t.id}|n`) ?? 0},${cnt.get(`${t.id}|p`) ?? 0})`)
writeFileSync(join(dir, 'analysis.sql'), `insert into voc_review_analysis (review_id,branch,channel,review_date,date_source,week_label,score10,has_text,neg_count,pos_count,extracted_by)
select id::uuid,br,ch,d::date,src,d::date+((8-extract(dow from d::date)::int)%7),sc,t,n,p,${q(TAG)} from (values ${rows.join(',')}) v(id,br,ch,d,src,sc,t,n,p) on conflict (review_id) do nothing;`)

const vals = stars.filter(s => s.p === 'n').map(s => `(${q(s.rid)},'n',${q(s.g)},${q(s.ph)},${q(s.q)},${q(s.o)},${s.rs ? q(s.rs) : 'null'})`)
const chunks: string[][] = []
let cur: string[] = [], len = 0
for (const v of vals) { cur.push(v); len += v.length; if (len > 60000) { chunks.push(cur); cur = []; len = 0 } }
if (cur.length) chunks.push(cur)
chunks.forEach((c, i) => writeFileSync(join(dir, `stars-${i}.sql`), `with v(rid,p,g,ph,qt,o,rs) as (values ${c.join(',')}),
base as (select coalesce(max(substr(id,3)::int),0) m from voc_stars)
insert into voc_stars (id,source,source_ref,review_id,branch,channel,star_date,date_source,iso_week,week_label,polarity,galaxy,phenomenon,quote,owner,relation_signal,extracted_by)
select 'S-'||lpad((base.m+row_number() over (order by a.review_date,v.rid,v.p,v.ph))::text,5,'0'),'ota_review',v.rid,v.rid::uuid,a.branch,a.channel,a.review_date,a.date_source,
 to_char(a.review_date,'IYYY')||'-W'||to_char(a.review_date,'IW'),a.week_label,'neg',
 case v.g when '청' then '청결' when '소' then '소음' when '시' then '시설' when '응' then '응대/환대/커뮤니티' when '체' then '체크인/체크아웃' when '위' then '위치/접근성' when '어' then '어메니티' when '가' then '가격' else '기타' end,
 v.ph,v.qt,case v.o when 'X' then '운영 밖' else v.o end,case v.rs when 'E' then '감정 고조' when 'R' then '재문의' when 'C' then '보상 요구' when 'P' then '평판 리스크' end,${q(TAG)}
from v join voc_review_analysis a on a.review_id=v.rid::uuid cross join base;`))
console.log(`SQL 작성: analysis.sql (${rows.length}행) + stars-0..${chunks.length - 1}.sql (불편 별 ${vals.length}개). 태그 ${TAG}`)
