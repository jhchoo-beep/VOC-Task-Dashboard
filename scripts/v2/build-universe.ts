/**
 * V2 백필 A4·A5·A8 — 별 → 별자리·씨앗·단발 → 상태 → data/universe.json (DB 접속 없음)
 * ────────────────────────────────────────────────────────────────
 * 입력(<data>): reviews.resolved.json, stars.extracted.json, a4-curation.json(현상 합침),
 *              task-links.json(과제↔현상 연결 근거), source/tasks.json, source/task_logs.json,
 *              summaries.json(별자리 사실 요약, 선택), metrics.json(지표, 선택 — compute-metrics.ts)
 * 출력: <data>/universe.json (임시 파일에 쓰고 이름 바꾸기 — 쓰다 만 파일을 남기지 않는다)
 *
 * 규칙 판정은 lib/v2/constellationRules.ts 만 쓴다. 이 스크립트는 데이터를 모으고 모양을 맞출 뿐이다.
 *
 *   npx tsx scripts/v2/build-universe.ts <data 폴더> [--as-of 2026-10-12]
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  RULES, groupPhenomenon, deriveNegativeStatus, derivePositiveStatus, recentCount,
  compareConstellations, distinctWeekCount, windowStart, type LinkedTask, type StatusEvent,
} from '../../lib/v2/constellationRules'

const argv = process.argv.slice(2)
const dataDir = argv[0]
if (!dataDir) {
  console.error('사용법: build-universe.ts <data 폴더> [--as-of YYYY-MM-DD]')
  process.exit(1)
}
const asOf = argv.includes('--as-of') ? argv[argv.indexOf('--as-of') + 1] : '2026-10-12'
const read = (f: string) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'))

export const GALAXIES = ['청결', '소음', '시설', '응대/환대/커뮤니티', '체크인/체크아웃', '위치/접근성', '어메니티', '가격', '기타']
const BRANCHES = ['신설', '동대문']
const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

const resolved: any[] = read('reviews.resolved.json')
const extracted = read('stars.extracted.json')
const curation = read('a4-curation.json')
const links = read('task-links.json').links as { task: string; branch: string; phenomenon: string; basis: string }[]
const tasks: any[] = read('source/tasks.json')
const taskLogs: any[] = read('source/task_logs.json')
const summaries: Record<string, string> = existsSync(join(dataDir, 'summaries.json')) ? read('summaries.json') : {}
const metrics = existsSync(join(dataDir, 'metrics.json')) ? read('metrics.json') : null

// ── 1. 현상 합침(A4) ───────────────────────────────────────────────
const mergeMap = new Map<string, { to: string; reason: string }>()
for (const m of curation.merges) mergeMap.set(`${m.polarity}|${m.from}`, { to: m.to, reason: m.reason })
const mergedFrom = new Map<string, { from: string; reason: string }[]>()   // `${polarity}|${to}` → 합쳐진 이름
for (const m of curation.merges) {
  const k = `${m.polarity}|${m.to}`
  if (!mergedFrom.has(k)) mergedFrom.set(k, [])
  mergedFrom.get(k)!.push({ from: m.from, reason: m.reason })
}

const stars: any[] = extracted.stars.map((s: any, i: number) => {
  const m = mergeMap.get(`${s.polarity}|${s.phenomenon}`)
  return { ...s, phenomenon_raw: s.phenomenon, phenomenon: m ? m.to : s.phenomenon }
})
// 별 ID: 지점 → 날짜 → 리뷰 → 발췌 위치 순(stars.extracted 정렬 그대로)
stars.forEach((s, i) => { s.id = `S-${String(i + 1).padStart(5, '0')}` })

// 한 리뷰·한 극성·한 현상 = 별 하나(정의 「별 = 리뷰 속 목소리 1개」, DB 고유 키 voc_stars_one_voice).
// A4 합침으로 같은 리뷰에 같은 현상 별이 둘 생기면 하나만 남긴다(2026-10-13, C-신설-033 3쌍).
// 남길 별 = 합침 전 이름이 별자리 이름과 같은 별(발췌가 이름과 맞음). 관계 신호는 남기는 별로 옮긴다.
// ID 를 매긴 뒤에 빼므로 나머지 별의 ID 는 바뀌지 않는다(운영 표 upsert 키 유지).
const byVoice = new Map<string, any[]>()
for (const s of stars) {
  const k = `${s.review_id}|${s.polarity}|${s.phenomenon}`
  if (!byVoice.has(k)) byVoice.set(k, [])
  byVoice.get(k)!.push(s)
}
const voiceDedup: { dropped: string; kept: string; phenomenon: string }[] = []
for (const list of byVoice.values()) {
  if (list.length < 2) continue
  const kept = list.find(s => s.phenomenon_raw === s.phenomenon) ?? list[0]
  for (const s of list) {
    if (s === kept) continue
    if (!kept.relation_signal && s.relation_signal) kept.relation_signal = s.relation_signal
    voiceDedup.push({ dropped: s.id, kept: kept.id, phenomenon: s.phenomenon })
  }
}
const droppedIds = new Set(voiceDedup.map(d => d.dropped))
for (let i = stars.length - 1; i >= 0; i--) if (droppedIds.has(stars[i].id)) stars.splice(i, 1)

// ── 2. 과제(완료일 근사) ─────────────────────────────────────────
const day = (ts: string) => ts.substring(0, 10)
const lastLog = new Map<string, string>()
for (const l of taskLogs) {
  const d = day(l.created_at)
  if (!lastLog.has(l.task_id) || lastLog.get(l.task_id)! < d) lastLog.set(l.task_id, d)
}
const taskById8 = new Map(tasks.map(t => [t.id.substring(0, 8), t]))
function linkedTask(id8: string): (LinkedTask & { title: string; task_month: string; fullId: string; completedBasis: string | null }) {
  const t = taskById8.get(id8)
  if (!t) throw new Error(`task-links.json 의 과제 ${id8} 를 tasks 에서 찾지 못함`)
  const created = day(t.created_at)
  let completedAt: string | null = null
  let completedBasis: string | null = null
  if (t.status === '완료') {
    // tasks 에는 완료일 칸이 없다 — 마지막 진행 로그 날짜, 로그가 없으면 등록일로 근사한다.
    completedAt = lastLog.get(t.id) ?? created
    completedBasis = lastLog.has(t.id) ? '마지막 진행 로그 날짜' : '진행 로그 없음 — 등록일'
  }
  return {
    id: t.id, fullId: t.id, status: t.status, createdAt: created, completedAt, completedBasis,
    title: t.title.replace(/^\[(신설|동대문)\] 수행과제 — /, ''), task_month: t.task_month,
  }
}

// ── 3. 묶기 ──────────────────────────────────────────────────────
interface Group { branch: string; polarity: 'neg' | 'pos'; phenomenon: string; galaxy: string; owner: string; stars: any[] }
const groups = new Map<string, Group>()
for (const s of stars) {
  const k = `${s.branch}|${s.polarity}|${s.phenomenon}`
  if (!groups.has(k)) groups.set(k, { branch: s.branch, polarity: s.polarity, phenomenon: s.phenomenon, galaxy: s.galaxy, owner: s.owner, stars: [] })
  groups.get(k)!.stars.push(s)
}

const constellations: any[] = []
const missingSummary: string[] = []
const starById = new Map(stars.map(s => [s.id, s]))

for (const g of groups.values()) {
  const res = groupPhenomenon(g.stars, asOf)
  if (res.kind === 'singles') continue
  const members = g.stars.filter(s => res.memberIds.includes(s.id)).sort((a, b) => a.date.localeCompare(b.date))
  const dates = members.map(s => s.date)
  const monthly: Record<string, number> = Object.fromEntries(MONTHS.map(m => [m, 0]))
  const channels: Record<string, number> = {}
  for (const s of members) {
    const m = s.date.substring(0, 7)
    monthly[m] = (monthly[m] ?? 0) + 1
    channels[s.channel] = (channels[s.channel] ?? 0) + 1
  }
  const history: any[] = []   // merge·seed·task_linked 등 StatusEvent 밖 이력도 담는다(타입만 넓힘, 동작 같음)
  for (const mf of mergedFrom.get(`${g.polarity}|${g.phenomenon}`) ?? []) {
    if (g.stars.some(s => s.phenomenon_raw === mf.from)) {
      history.push({ type: 'merge', at: curation.at, note: `「${mf.from}」을 합침 — ${mf.reason}` })
    }
  }

  const key = `${g.branch}|${g.polarity}|${g.phenomenon}`
  const summary = summaries[key]
  if (!summary) missingSummary.push(key)

  const base = {
    id: '', branch: g.branch, galaxy: g.galaxy, name: g.phenomenon, polarity: g.polarity,
    status: '', star_ids: members.map(s => s.id),
    first_date: dates[0], last_date: dates[dates.length - 1],
    distinct_weeks: distinctWeekCount(members), recent_4w: recentCount(members, asOf),
    monthly, channels, owner: g.owner, task: null as any,
    summary: summary ?? '',
    history: history as any[],
    formed_at: null as string | null, relapse_count: 0, observation_start: null as string | null,
  }

  const myLinks = links.filter(l => l.branch === g.branch && l.phenomenon === g.phenomenon)
  const lt = g.polarity === 'neg' ? myLinks.map(l => ({ ...linkedTask(l.task), basis: l.basis })) : []

  if (res.kind === 'seed') {
    base.status = '씨앗'
    base.history.push({ type: 'seed', at: dates[dates.length - 1], note: `최근 90일 같은 현상 별 ${members.length}개 — 별자리 조건(3개·서로 다른 2주) 미충족, 관찰만` })
    for (const t of lt) base.history.push({ type: 'task_linked', at: t.createdAt, note: `기존 수행과제 「${t.title}」(${t.status}) — ${t.basis}` })
    if (lt.length) {
      const pick = [...lt].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      base.task = { id: pick.fullId, title: pick.title, status: pick.status, task_month: pick.task_month }
    }
  } else {
    base.formed_at = res.formation.formedAt
    if (g.polarity === 'neg') {
      const st = deriveNegativeStatus(dates, res.formation.formedAt!, lt, asOf)
      base.status = st.status
      base.relapse_count = st.relapseCount
      base.observation_start = st.observationStart
      for (const e of st.events) {
        if (e.type === 'task_linked') continue
        base.history.push(e)
      }
      for (const t of lt) {
        base.history.push({
          type: 'task_linked', at: t.createdAt,
          note: `기존 수행과제 「${t.title}」(${t.status}${t.completedAt ? `, 완료일 근사 ${t.completedAt}·${t.completedBasis}` : ''}) — ${t.basis}`,
        })
      }
      const pickId = st.activeTaskId
      const pick = lt.find(t => t.id === pickId) ?? [...lt].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (pick) base.task = { id: pick.fullId, title: pick.title, status: pick.status, task_month: pick.task_month }
    } else {
      base.status = derivePositiveStatus(members, asOf)
      base.history.push({ type: 'formed', at: res.formation.formedAt, note: '별자리 조건 충족(별 3개 이상, 서로 다른 2주 이상, 90일 안)' })
      if (base.status === '흐려짐') {
        base.history.push({ type: 'fading', at: asOf, note: `최근 90일(${windowStart(asOf)}~${asOf}) 별자리 조건 미충족` })
      }
    }
  }
  base.history.sort((a: any, b: any) => a.at.localeCompare(b.at))
  constellations.push(base)
}

// ID: 지점별 — 별자리(생성일 순) 다음 씨앗(첫 별 순), 같으면 이름. 운영에서는 생성 시 부여하고 바꾸지 않는다.
for (const b of BRANCHES) {
  const mine = constellations.filter(c => c.branch === b)
  const formed = mine.filter(c => c.status !== '씨앗').sort((x, y) => x.formed_at.localeCompare(y.formed_at) || x.name.localeCompare(y.name))
  const seeds = mine.filter(c => c.status === '씨앗').sort((x, y) => x.first_date.localeCompare(y.first_date) || x.name.localeCompare(y.name))
  ;[...formed, ...seeds].forEach((c, i) => { c.id = `C-${b}-${String(i + 1).padStart(3, '0')}` })
}
// 화면 순서: 지점·극성별 최근 4주 별 수 → 최근 순
constellations.sort((a, b) =>
  a.branch.localeCompare(b.branch) || a.polarity.localeCompare(b.polarity) ||
  compareConstellations({ recent4w: a.recent_4w, lastDate: a.last_date, name: a.name }, { recent4w: b.recent_4w, lastDate: b.last_date, name: b.name }))
const rankCounter: Record<string, number> = {}
for (const c of constellations) {
  const k = `${c.branch}|${c.polarity}`
  rankCounter[k] = (rankCounter[k] ?? 0) + 1
  c.order = rankCounter[k]
}

const cidByStar = new Map<string, string>()
for (const c of constellations) for (const id of c.star_ids) cidByStar.set(id, c.id)

// ── 4. 은하 ──────────────────────────────────────────────────────
const galaxies = GALAXIES.map((name, order) => {
  const gs = stars.filter(s => s.galaxy === name)
  const gc = constellations.filter(c => c.galaxy === name && c.status !== '씨앗')
  return {
    id: name, name, order,
    stars: gs.length, neg: gs.filter(s => s.polarity === 'neg').length, pos: gs.filter(s => s.polarity === 'pos').length,
    constellations: gc.length, nebulae: gc.filter(c => c.status === '성운').length,
    seeds: constellations.filter(c => c.galaxy === name && c.status === '씨앗').length,
  }
})

// ── 5. 리뷰(별이 있는 리뷰만, 리뷰어 이름 없음) ───────────────────
const reviewIds = new Set(stars.map(s => s.review_id))
const reviews: Record<string, any> = {}
for (const r of resolved) {
  if (!reviewIds.has(r.id)) continue
  reviews[r.id] = {
    branch: r.branch, channel: r.channel, date: r.date, date_source: r.date_source,
    rating: r.rating, scale: r.score_max, text_ko: r.content_ko, text_orig: r.content,
  }
}

// ── 6. 핵심 지표(백필 기준) ──────────────────────────────────────
const negC = constellations.filter(c => c.polarity === 'neg' && c.status !== '씨앗')
const posC = constellations.filter(c => c.polarity === 'pos' && c.status !== '씨앗')
const observed = negC.filter(c => c.observation_start)
const core = {
  structural_solved: negC.filter(c => c.status === '성운').length,
  relapse_rate: { num: observed.filter(c => c.relapse_count > 0).length, den: observed.length },
  keep_rate: { num: posC.filter(c => c.status === '유지').length, den: posC.length },
  basis: '백필(2026-06~10-12) 기준. 완료 과제에 이어진 별자리만 관찰 진입으로 센다. 완료일은 마지막 진행 로그 날짜(없으면 등록일) 근사',
}

// ── 7. 별(계약 필드) ─────────────────────────────────────────────
const starsOut = stars.map(s => ({
  id: s.id, review_id: s.review_id, branch: s.branch, channel: s.channel, date: s.date,
  date_source: s.date_source, week: s.week, polarity: s.polarity, galaxy: s.galaxy,
  phenomenon: s.phenomenon, quote: s.quote_exact ?? s.quote, owner: s.owner, relation_signal: s.relation_signal,
  constellation_id: cidByStar.get(s.id) ?? null,
}))

const universe = {
  meta: {
    as_of: asOf,
    generated_at: new Date().toISOString(),
    branches: BRANCHES,
    period: { from: '2026-06-01', to: asOf },
    rules: { seed: RULES.seed, constellation_min: RULES.constellationMin, distinct_weeks: RULES.distinctWeeks, window_days: RULES.windowDays },
    voice_dedup: voiceDedup,
    counts: {
      reviews: resolved.length,
      reviews_with_text: resolved.filter(r => r.has_text).length,
      reviews_with_stars: Object.keys(reviews).length,
      duplicate_reviews: Object.keys(extracted.duplicate_of).length,
      merged_duplicate_stars: voiceDedup.length,   // 합침 뒤 같은 리뷰·같은 현상이라 뺀 별(meta.voice_dedup)
      stars: starsOut.length,
      neg: starsOut.filter(s => s.polarity === 'neg').length,
      pos: starsOut.filter(s => s.polarity === 'pos').length,
      constellations: negC.length + posC.length,
      constellations_neg: negC.length,
      constellations_pos: posC.length,
      seeds: constellations.filter(c => c.status === '씨앗').length,
      singles: starsOut.filter(s => !s.constellation_id).length,
    },
    week_basis: 'ISO 주(월~일). 주간 리포트 버킷(화~월)과 다름',
    window: { from: windowStart(asOf), to: asOf },
  },
  north_star: metrics?.north_star ?? { label: '불편 없이 끝난 체류 비율', value: null, scope: '계산 전', is_estimate: true },
  core,
  guardrails: metrics?.guardrails ?? { ota_rating: [], voice_ratio: [] },
  galaxies,
  constellations,
  stars: starsOut,
  reviews,
}

const out = join(dataDir, 'universe.json')
writeFileSync(`${out}.tmp`, JSON.stringify(universe, null, 1), 'utf8')
renameSync(`${out}.tmp`, out)

// ── 요약 출력 ──
console.log(JSON.stringify(universe.meta.counts))
console.log(JSON.stringify(core))
for (const c of constellations) {
  console.log([c.id, c.branch, c.polarity, c.status, `★${c.star_ids.length}`, `4w${c.recent_4w}`, `wk${c.distinct_weeks}`,
    c.name, JSON.stringify(c.monthly).replace(/"2026-/g, '').replace(/[{}"]/g, ''), c.task ? `[${c.task.status}] ${c.task.title.slice(0, 20)}` : ''].join(' '))
}
if (missingSummary.length) console.log(`요약 없음 ${missingSummary.length}건`)
