/**
 * V2 적재 SQL 생성 — universe.json → 운영 Supabase 새 표 4개(voc_*) upsert SQL 조각 + 검증 SQL
 * ────────────────────────────────────────────────────────────────
 * 이 스크립트는 DB에 접속하지 않는다. <out> 폴더에 SQL 파일을 만들 뿐이고, 실행은 사람이 승인한 뒤
 * Supabase SQL 편집기·MCP execute_sql·psql 로 순서대로 돌린다(파일 이름 순).
 *
 *   00-preflight.sql   표가 있는지·비어 있는지 확인(SELECT)
 *   10-constellations-*.sql, 20-stars-*.sql, 30-events-*.sql, 40-metrics.sql  — INSERT … ON CONFLICT DO UPDATE
 *   90-verify.sql      건수·체크섬이 universe.json 과 같은지 check/ok 로 돌려준다(전부 true 여야 함)
 *
 * 🔴 기존 표는 SELECT 만 한다. 별 발췌(quote)는 옮겨 적지 않고 reviews.content_ko 에서 서버가 잘라 넣는다
 *    (substr(content_ko, 시작+1, 길이), 위치는 코드포인트 — build-stars.ts 가 원문 대조로 확인한 값).
 *    리뷰 전문은 새 표에 복사하지 않는다(review_id 로 reviews 참조).
 * 🔴 같은 파일을 다시 돌려도 결과가 같다(upsert). 별 ID·별자리 ID·이력 ID 는 universe.json 그대로.
 *
 *   npx tsx scripts/v2/load-universe.ts <data 폴더> <out 폴더> [--stars-per-file 450]
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { weekLabelOf } from '../../lib/otaDetail'
import { daysBetween } from '../../lib/v2/constellationRules'

const argv = process.argv.slice(2)
const [dataDir, outDir] = argv
if (!dataDir || !outDir) {
  console.error('사용법: load-universe.ts <data 폴더> <out 폴더> [--stars-per-file N]')
  process.exit(1)
}
const perFile = argv.includes('--stars-per-file') ? Number(argv[argv.indexOf('--stars-per-file') + 1]) : 450
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))
const u = read('universe.json')
const ext = read('stars.extracted.json')
const metrics = read('metrics.json')
mkdirSync(outDir, { recursive: true })

const md5 = (s: string) => createHash('md5').update(Buffer.from(s, 'utf8')).digest('hex')
const q = (v: string | null | undefined) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const qd = (v: string | null | undefined) => (v == null ? 'null' : `'${v}'::date`)
const qj = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
const BY_C = (a: string, b: string) => (Buffer.from(a, 'utf8') < Buffer.from(b, 'utf8') ? -1 : a === b ? 0 : 1) // COLLATE "C" 와 같은 순서
const ACTOR = 'llm-backfill-2026-10-13'
const files: string[] = []
const write = (name: string, sql: string) => { writeFileSync(join(outDir, name), sql, 'utf8'); files.push(name) }

// ── 00 사전 확인 ──
write('00-preflight.sql', `-- 표 존재·행 수 확인(SELECT)
select 'voc_constellations' as t, count(*) from public.voc_constellations
union all select 'voc_stars', count(*) from public.voc_stars
union all select 'voc_constellation_events', count(*) from public.voc_constellation_events
union all select 'voc_metrics_monthly', count(*) from public.voc_metrics_monthly;
`)

// ── 10 별자리 ──
const cCols = 'id, branch, polarity, galaxy, name, owner, status, formed_at, first_date, last_date, star_count, distinct_weeks, recent_4w, monthly, channels, task_id, observation_start, nebula_at, relapse_count, summary, sort_order, as_of, updated_at'
const cUpd = cCols.split(', ').filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')
const nebulaAt = (c: any) => c.history.find((h: any) => h.type === 'nebula')?.at ?? null
const cRows = u.constellations.map((c: any) => `(${[
  q(c.id), q(c.branch), q(c.polarity), q(c.galaxy), q(c.name), q(c.owner), q(c.status), qd(c.formed_at), qd(c.first_date), qd(c.last_date),
  c.star_ids.length, c.distinct_weeks, c.recent_4w, qj(c.monthly), qj(c.channels), c.task ? `'${c.task.id}'::uuid` : 'null',
  qd(c.observation_start), qd(nebulaAt(c)), c.relapse_count ?? 0, q(c.summary), c.order ?? 'null', qd(u.meta.as_of), 'now()',
].join(', ')})`)
for (let i = 0; i < cRows.length; i += 80) {
  write(`10-constellations-${String(i / 80 + 1).padStart(2, '0')}.sql`,
    `insert into public.voc_constellations (${cCols}) values\n${cRows.slice(i, i + 80).join(',\n')}\non conflict (id) do update set ${cUpd};\n`)
}

// ── 20 별(현상 사전 + 압축 행, 발췌는 서버에서 substr) ──
const extById = new Map<string, any>()
ext.stars.forEach((s: any, i: number) => extById.set(`S-${String(i + 1).padStart(5, '0')}`, s))
const dictKey = (s: any) => `${s.polarity}|${s.galaxy}|${s.phenomenon}|${s.owner}`
const dict = [...new Set<string>(u.stars.map(dictKey))].sort(BY_C)   // Set<string> 명시(타입만, 동작 같음)
const dictIdx = new Map(dict.map((k, i) => [k, i + 1]))
const dictSql = dict.map((k, i) => { const [p, g, ph, o] = k.split('|'); return `(${i + 1}, ${q(p)}, ${q(g)}, ${q(ph)}, ${q(o)})` }).join(',\n  ')
const DAY0 = '2026-05-01'   // 별 날짜 = DAY0 + 정수(행 길이를 줄이려고)
const SIG: Record<string, string> = { '감정 고조': 'E', '재문의': 'R', '보상 요구': 'C', '평판 리스크': 'P' }
const DS: Record<string, string> = { raw: 'r', collected: 'c', month: 'm' }
const sRows = u.stars.map((s: any) => {
  const e = extById.get(s.id)
  if (!e || e.review_id !== s.review_id || e.quote_start == null) throw new Error(`별 ${s.id} 발췌 위치 없음`)
  const n = Number(s.id.substring(2))
  const wlOff = daysBetween(s.date, weekLabelOf(s.date))
  const cnum = s.constellation_id ? Number(s.constellation_id.split('-').pop()) : null
  return `(${n},'${s.review_id.substring(0, 8)}',${daysBetween(DAY0, s.date)},'${DS[s.date_source]}',${wlOff},${dictIdx.get(dictKey(s))},${e.quote_start},${e.quote_len},'${s.relation_signal ? SIG[s.relation_signal] : ''}',${cnum ?? 0})`
})
const sCols = 'id, source, source_ref, review_id, branch, channel, star_date, date_source, iso_week, week_label, polarity, galaxy, phenomenon, quote, owner, relation_signal, constellation_id, extracted_by, updated_at'
const sUpd = sCols.split(', ').filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')
for (let i = 0; i < sRows.length; i += perFile) {
  write(`20-stars-${String(i / perFile + 1).padStart(2, '0')}.sql`, `-- 별 ${i + 1}~${Math.min(i + perFile, sRows.length)}. 리뷰는 두 지점·범위(2026-06~10)·id 앞 8자로 찾는다(범위 723건 안에서 유일, 겹치면 upsert 가 같은 행 두 번 오류로 멈춤). 날짜 = ${DAY0} + d
with ph(i, polarity, galaxy, phenomenon, owner) as (values
  ${dictSql}
), v(n, id8, d, ds, wl, i, qs, ql, sig, cnum) as (values
${sRows.slice(i, i + perFile).join(',\n')}
)
insert into public.voc_stars (${sCols})
select 'S-' || lpad(v.n::text, 5, '0'), 'ota_review', r.id::text, r.id, r.branch,
  case r.ota_site when '아고다' then 'Agoda' when '부킹닷컴' then 'Booking' when '트립닷컴' then 'Trip.com' when '익스피디아' then 'Expedia' when '에어비앤비' then 'Airbnb' when '야놀자' then 'NOL' else r.ota_site end,
  '${DAY0}'::date + v.d, case v.ds when 'r' then 'raw' when 'c' then 'collected' else 'month' end,
  to_char('${DAY0}'::date + v.d, 'IYYY-"W"IW'), '${DAY0}'::date + v.d + v.wl, ph.polarity, ph.galaxy, ph.phenomenon,
  substr(r.content_ko, v.qs + 1, v.ql), ph.owner,
  case v.sig when 'E' then '감정 고조' when 'R' then '재문의' when 'C' then '보상 요구' when 'P' then '평판 리스크' end,
  case when v.cnum = 0 then null else 'C-' || r.branch || '-' || lpad(v.cnum::text, 3, '0') end,
  '${ACTOR}', now()
from v
join ph on ph.i = v.i
join public.reviews r on r.branch in ('신설', '동대문')
  and left(r.id::text, 8) = v.id8 and r.review_month between '2026-06' and '2026-10'
on conflict (id) do update set ${sUpd};
`)
}

// ── 30 이력 ──
const eRows: string[] = []
const events: { id: string; cid: string; type: string; at: string; note: string }[] = []
for (const c of u.constellations) {
  c.history.forEach((h: any, i: number) => {
    const id = `${c.id}#${String(i + 1).padStart(2, '0')}`
    events.push({ id, cid: c.id, type: h.type, at: h.at, note: h.note })
    eRows.push(`(${q(id)}, ${q(c.id)}, ${q(h.type)}, ${qd(h.at)}, ${q(h.note)}, '${ACTOR}')`)
  })
}
for (let i = 0; i < eRows.length; i += 110) {
  write(`30-events-${String(i / 110 + 1).padStart(2, '0')}.sql`,
    `insert into public.voc_constellation_events (id, constellation_id, event_type, event_at, note, actor) values\n${eRows.slice(i, i + 110).join(',\n')}\non conflict (id) do update set constellation_id = excluded.constellation_id, event_type = excluded.event_type, event_at = excluded.event_at, note = excluded.note, actor = excluded.actor;\n`)
}

// ── 40 월 지표 ──
const GAL = ['청결', '소음', '시설', '응대/환대/커뮤니티', '체크인/체크아웃', '위치/접근성', '어메니티', '가격', '기타']
const mRows: string[] = []
const metricRows: any[] = []
for (const b of u.meta.branches) {
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    const st = u.stars.filter((s: any) => s.branch === b && s.date.startsWith(m))
    const neg = st.filter((s: any) => s.polarity === 'neg'), pos = st.filter((s: any) => s.polarity === 'pos')
    const by = (arr: any[]) => Object.fromEntries(GAL.map(g => [g, arr.filter(s => s.galaxy === g).length]))
    const row = { branch: b, month: m, channel: '전체', stars: st.length, neg: neg.length, pos: pos.length, negBy: by(neg), posBy: by(pos), north: null, voice: null, inputs: {}, scope: `별 날짜 기준 ${m}${m === '2026-10' ? '(10/12까지)' : ''}`, est: false }
    metricRows.push(row)
  }
}
for (const d of metrics.detail) {
  for (const mm of d.monthly) {
    const w = d.weekly_voice.filter((x: any) => x.week.startsWith(mm.month))
    const reviews = w.reduce((a: number, x: any) => a + x.reviews, 0), checkouts = w.reduce((a: number, x: any) => a + x.checkouts, 0)
    metricRows.push({
      branch: d.branch, month: mm.month, channel: d.channel, stars: 0, neg: 0, pos: 0, negBy: {}, posBy: {},
      north: mm.value == null ? null : Math.round(mm.value * 10000) / 10000,
      voice: checkouts ? Math.round((reviews / checkouts) * 10000) / 10000 : null,
      inputs: { period: mm.period, text_reviews: mm.text_reviews, text_reviews_with_neg_star: mm.text_reviews_with_neg_star, neg_ratio: mm.neg_ratio, channel_reviews_delta: mm.channel_reviews_delta, channel_checkouts: mm.channel_checkouts, weeks: w },
      scope: `${d.branch} ${d.channel} 주 라벨 ${w.map((x: any) => x.week).join('·')} · 리뷰 1건=체류 1건 추정`, est: true,
    })
  }
}
for (const r of metricRows) {
  mRows.push(`(${q(r.branch)}, ${q(r.month)}, ${q(r.channel)}, ${r.stars}, ${r.neg}, ${r.pos}, ${qj(r.negBy)}, ${qj(r.posBy)}, ${r.north ?? 'null'}, ${r.voice ?? 'null'}, ${qj(r.inputs)}, ${q(r.scope)}, ${r.est}, now())`)
}
write('40-metrics.sql', `insert into public.voc_metrics_monthly (branch, month, channel, stars, neg_stars, pos_stars, neg_by_galaxy, pos_by_galaxy, north_star, voice_ratio, inputs, scope, is_estimate, computed_at) values
${mRows.join(',\n')}
on conflict (branch, month, channel) do update set stars = excluded.stars, neg_stars = excluded.neg_stars, pos_stars = excluded.pos_stars, neg_by_galaxy = excluded.neg_by_galaxy, pos_by_galaxy = excluded.pos_by_galaxy, north_star = excluded.north_star, voice_ratio = excluded.voice_ratio, inputs = excluded.inputs, scope = excluded.scope, is_estimate = excluded.is_estimate, computed_at = excluded.computed_at;
`)

// ── 90 검증(전부 ok=true 여야 함) ──
const sortedStars = [...u.stars].sort((a: any, b: any) => BY_C(a.id, b.id))
const aggStars = md5(sortedStars.map((s: any) => `${s.id}:${md5(s.quote)}`).join(','))
const aggStarMeta = md5(sortedStars.map((s: any) => [s.id, s.review_id, s.branch, s.channel, s.date, s.date_source, s.week, weekLabelOf(s.date), s.polarity, s.galaxy, s.phenomenon, s.owner, s.relation_signal ?? '', s.constellation_id ?? ''].join('|')).join(','))
const sortedC = [...u.constellations].sort((a: any, b: any) => BY_C(a.id, b.id))
const aggC = md5(sortedC.map((c: any) => [c.id, c.branch, c.polarity, c.galaxy, c.name, c.owner, c.status, c.star_ids.length, c.summary, c.task ? c.task.id : ''].join('|')).join(','))
const sortedE = [...events].sort((a, b) => BY_C(a.id, b.id))
const aggE = md5(sortedE.map(e => [e.id, e.cid, e.type, e.at, e.note].join('|')).join(','))
const manifest = {
  stars: u.stars.length, constellations: u.constellations.length, events: events.length, metrics: metricRows.length,
  stars_quote_md5: aggStars, stars_meta_md5: aggStarMeta, constellations_md5: aggC, events_md5: aggE,
}
write('90-verify.sql', `-- universe.json(${u.meta.generated_at}) 과 운영 표 대조. 모든 행의 ok 가 true 여야 한다
select 'stars_count' as check, count(*)::text as actual, '${manifest.stars}' as expected, count(*) = ${manifest.stars} as ok from public.voc_stars
union all select 'constellations_count', count(*)::text, '${manifest.constellations}', count(*) = ${manifest.constellations} from public.voc_constellations
union all select 'events_count', count(*)::text, '${manifest.events}', count(*) = ${manifest.events} from public.voc_constellation_events
union all select 'metrics_count', count(*)::text, '${manifest.metrics}', count(*) = ${manifest.metrics} from public.voc_metrics_monthly
union all select 'stars_quote_md5', md5(string_agg(id || ':' || md5(quote), ',' order by id collate "C")), '${aggStars}', md5(string_agg(id || ':' || md5(quote), ',' order by id collate "C")) = '${aggStars}' from public.voc_stars
union all select 'stars_meta_md5', x, '${aggStarMeta}', x = '${aggStarMeta}' from (select md5(string_agg(concat_ws('|', id, review_id::text, branch, channel, star_date::text, date_source, iso_week, week_label::text, polarity, galaxy, phenomenon, owner, coalesce(relation_signal, ''), coalesce(constellation_id, '')), ',' order by id collate "C")) as x from public.voc_stars) t
union all select 'constellations_md5', x, '${aggC}', x = '${aggC}' from (select md5(string_agg(concat_ws('|', id, branch, polarity, galaxy, name, owner, status, star_count::text, summary, coalesce(task_id::text, '')), ',' order by id collate "C")) as x from public.voc_constellations) t
union all select 'events_md5', x, '${aggE}', x = '${aggE}' from (select md5(string_agg(concat_ws('|', id, constellation_id, event_type, event_at::text, note), ',' order by id collate "C")) as x from public.voc_constellation_events) t
union all select 'stars_without_review', count(*)::text, '0', count(*) = 0 from public.voc_stars s where not exists (select 1 from public.reviews r where r.id = s.review_id)
union all select 'stars_constellation_star_count', count(*)::text, '0', count(*) = 0 from public.voc_constellations c where c.star_count <> (select count(*) from public.voc_stars s where s.constellation_id = c.id)
union all select 'rls_enabled', count(*)::text, '4', count(*) = 4 from pg_class where relname in ('voc_stars','voc_constellations','voc_constellation_events','voc_metrics_monthly') and relrowsecurity
union all select 'select_policies', count(*)::text, '4', count(*) = 4 from pg_policies where schemaname = 'public' and tablename like 'voc\\_%' and cmd = 'SELECT' and roles @> array['anon','authenticated']::name[]
union all select 'write_policies', count(*)::text, '0', count(*) = 0 from pg_policies where schemaname = 'public' and tablename like 'voc\\_%' and cmd <> 'SELECT';
`)
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ ...manifest, files }, null, 1), 'utf8')
console.log(JSON.stringify({ ...manifest, files: files.length, dict: dict.length }))
