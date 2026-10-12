/**
 * V2 백필 A3 — 배치별 별 추출 결과를 모아 검증한다 (DB 접속 없음)
 * ────────────────────────────────────────────────────────────────
 * 입력: <data>/stars/input-NN.json(배치 입력), <data>/stars/batch-NN.json(LLM 추출 결과),
 *       <data>/reviews.resolved.json
 * 출력: <data>/stars.extracted.json(별 전체, 아직 ID 없음), <data>/phenomena.json(지점별 현상 사전)
 *
 * batch-NN.json 의 별 한 줄 = [리뷰 id 앞 8자, p|n, 은하 약어, 현상, 발췌, 받는 쪽, 관계 신호]
 *
 * 검증(하나라도 어긋나면 비정상 종료):
 *   · 배치가 입력의 리뷰를 빠짐없이 다뤘는가(reviews 목록 = input 목록)
 *   · 별의 리뷰가 그 배치에 있는가, 중복 표시(dup) 리뷰에서 별이 나오지 않았는가
 *   · 은하·받는 쪽·관계 신호 값이 정해진 목록 안인가
 *   · 발췌가 content_ko 안에 그대로 있는가(공백만 정규화). 위치(코드포인트 시작·길이)를 함께 남긴다 —
 *     운영 표 적재 때 발췌를 옮겨 적지 않고 서버에서 substr 로 채우기 위해서다.
 *
 *   npx tsx scripts/v2/build-stars.ts <data 폴더>
 * ────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const GALAXY_BY_CODE: Record<string, string> = {
  '청': '청결', '소': '소음', '시': '시설', '응': '응대/환대/커뮤니티', '체': '체크인/체크아웃',
  '위': '위치/접근성', '어': '어메니티', '가': '가격', '기': '기타',
}
export const OWNER_BY_CODE: Record<string, string> = { CM: 'CM', CR: 'CR', FM: 'FM', X: '운영 밖' }
export const SIGNAL_BY_CODE: Record<string, string> = { E: '감정 고조', R: '재문의', C: '보상 요구', P: '평판 리스크' }

const dataDir = process.argv[2]
if (!dataDir) {
  console.error('사용법: build-stars.ts <data 폴더>')
  process.exit(1)
}

const resolved: any[] = JSON.parse(readFileSync(join(dataDir, 'reviews.resolved.json'), 'utf8'))
const byId8 = new Map(resolved.map(r => [r.id.substring(0, 8), r]))

// ── reviews 표 안의 중복 ───────────────────────────────────────────
// 같은 지점·같은 채널에서 본문 키(reviewKey, 공백 뺀 앞 60자)가 같은 리뷰는 같은 목소리다.
// 실측: 에어비앤비가 같은 리뷰를 다음 달에 다시 수집해 review_month 만 다른 행이 생겼고(3벌까지),
// 부킹닷컴은 끝 두 단어만 다른 사본이 같은 날 두 행으로 들어갔다. 별을 두 번 만들면 한 사람의
// 목소리가 다른 주·다른 달의 반복으로 보여 씨앗·별자리가 부풀려진다 — 가장 이른 1건(날짜, 다음 id 순)만
// 별을 낸다. 키가 20자 미만인 짧은 리뷰(「좋아요」 등)는 다른 사람이 같은 말을 쓸 수 있어 묶지 않는다.
export function duplicateMap(rows: any[]): Record<string, string> {
  const groups = new Map<string, any[]>()
  for (const r of rows) {
    if (!r.has_text || (r.key ?? '').length < 20) continue
    const k = `${r.branch}|${r.channel}|${r.key}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }
  const out: Record<string, string> = {}
  for (const g of groups.values()) {
    if (g.length < 2) continue
    g.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    for (const d of g.slice(1)) out[d.id] = g[0].id
  }
  return out
}
// 본문 키로는 못 잡는 언어만 다른 사본(같은 날·같은 채널·같은 평점, 원문과 번역본이 각 한 행).
// 사람이 원문을 대조해 확인한 것만 적는다. 값 = 원본(별을 내는 쪽, 더 완전한 본문).
const MANUAL_DUPLICATES: Record<string, { primary: string; why: string }> = {
  // 신설 트립닷컴 2026-09-28 8점 — 중국어 원문은 한국어본의 앞 네 문장과 같고, 한국어본에만
  // 「요청사항을 적었는데도 소용이 없었나 봐요」가 더 있다
  '57b930bc': { primary: '657cd67e', why: '중국어 원문 사본(한국어본이 더 완전)' },
  // 동대문 — 에어비앤비 원문 행과 「한국어 (KR)로 번역하기」 번역 행이 각각 reviews 에 들어감(2026-10-13 원문 대조)
  'bea40cf3': { primary: '310771f5', why: '에어비앤비 2026-07 중국어 원문의 한국어 사본' },
  'dcc7e9b8': { primary: 'b176cc3b', why: '에어비앤비 2026-08 중국어 원문/한국어 번역 두 행' },
  'f821f0e4': { primary: 'c5d46413', why: '에어비앤비 2026-08 영어 원문/한국어 번역 두 행' },
  'f875349a': { primary: 'c731d558', why: '에어비앤비 2026-08 일본어 원문/한국어 번역 두 행' },
  '6c2a23dd': { primary: '2c9b743a', why: '에어비앤비 2026-08 영어 원문/한국어 번역 두 행' },
  // 동대문 트립닷컴 2026-09-17 8점 — 같은 글의 번역 두 벌(한쪽에 마지막 문장이 더 있음)
  'fbfce83f': { primary: 'f20d1260', why: '트립닷컴 번역 두 벌' },
}
const dupFull = duplicateMap(resolved)
for (const [d8, m] of Object.entries(MANUAL_DUPLICATES)) {
  const d = byId8.get(d8)
  const p = byId8.get(m.primary)
  if (!d || !p) throw new Error(`수동 중복 지정 오류: ${d8} → ${m.primary}`)
  dupFull[d.id] = p.id
}
const dupById8 = new Map(Object.entries(dupFull).map(([d, p]) => [d.substring(0, 8), p]))

/** 공백 정규화 문자열과, 정규화 문자열의 각 코드포인트가 원문 몇 번째 코드포인트였는지. */
function normWithMap(s: string): { norm: string[]; map: number[] } {
  const cps = Array.from(s)
  const norm: string[] = []
  const map: number[] = []
  let prevSpace = true
  cps.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (!prevSpace) { norm.push(' '); map.push(i) }
      prevSpace = true
    } else {
      norm.push(c); map.push(i); prevSpace = false
    }
  })
  while (norm.length && norm[norm.length - 1] === ' ') { norm.pop(); map.pop() }
  return { norm, map }
}

/** 발췌의 원문 위치(코드포인트). 못 찾으면 null. */
export function locateQuote(text: string, quote: string): { start: number; len: number } | null {
  const t = normWithMap(text)
  const q = normWithMap(quote).norm.join('')
  if (!q) return null
  const joined = t.norm.join('')
  const idx16 = joined.indexOf(q)
  if (idx16 < 0) return null
  // indexOf 는 UTF-16 위치를 돌려준다 — 앞에 이모지(서로게이트 쌍)가 있으면 코드포인트 위치와 어긋난다.
  // 2026-10-13 실측: 이 차이로 발췌 15건이 1~2글자 밀렸다. 코드포인트 위치로 바꿔 쓴다.
  const idx = Array.from(joined.slice(0, idx16)).length
  const qLen = Array.from(q).length
  const startCp = t.map[idx]
  const endCp = t.map[idx + qLen - 1]
  return { start: startCp, len: endCp - startCp + 1 }
}

const files = readdirSync(join(dataDir, 'stars')).filter(f => /^batch-\d+\.json$/.test(f)).sort()
const errors: string[] = []
const stars: any[] = []
const dupOf: Record<string, string> = {}
const covered = new Set<string>()

for (const f of files) {
  const n = f.match(/\d+/)![0]
  const batch = JSON.parse(readFileSync(join(dataDir, 'stars', f), 'utf8'))
  const input: any[] = JSON.parse(readFileSync(join(dataDir, 'stars', `input-${n}.json`), 'utf8'))
  const want = new Set(input.map(r => r.id.substring(0, 8)))
  const got = new Set<string>(batch.reviews)
  for (const id of want) if (!got.has(id)) errors.push(`${f}: 입력 리뷰 ${id} 누락`)
  for (const id of got) if (!want.has(id)) errors.push(`${f}: 입력에 없는 리뷰 ${id}`)
  for (const id of got) covered.add(id)
  for (const id of got) {
    const p = dupById8.get(id)
    if (p) dupOf[byId8.get(id)!.id] = p
  }

  for (const s of batch.stars) {
    const [id8, pol, g, ph, quote, owner, sig] = s
    const rv = byId8.get(id8)
    if (!rv) { errors.push(`${f}: 모르는 리뷰 ${id8}`); continue }
    if (!want.has(id8)) errors.push(`${f}: 배치 밖 리뷰의 별 ${id8}`)
    if (dupById8.has(id8)) errors.push(`${f}: 중복 리뷰에서 별 ${id8} (원본 ${dupById8.get(id8)!.substring(0, 8)})`)
    if (pol !== 'p' && pol !== 'n') errors.push(`${f}: polarity ${id8} ${pol}`)
    if (!GALAXY_BY_CODE[g]) errors.push(`${f}: 은하 약어 ${id8} ${g}`)
    if (!OWNER_BY_CODE[owner]) errors.push(`${f}: 받는 쪽 ${id8} ${owner}`)
    if (sig != null && !SIGNAL_BY_CODE[sig]) errors.push(`${f}: 관계 신호 ${id8} ${sig}`)
    if (!ph || /[()]/.test(ph)) errors.push(`${f}: 현상 이름 ${id8} "${ph}"`)
    const loc = locateQuote(rv.content_ko ?? '', quote)
    if (!loc) errors.push(`${f}: 발췌 불일치 ${id8} "${quote}"`)
    else {
      // 위치로 잘라 낸 조각이 발췌와 같은지 다시 확인(공백만 정규화) — 위치 계산 오류를 여기서 막는다
      const sliced = Array.from(rv.content_ko as string).slice(loc.start, loc.start + loc.len).join('')
      const n = (x: string) => x.replace(/\s+/g, ' ').trim()
      if (n(sliced) !== n(quote)) errors.push(`${f}: 발췌 위치 오류 ${id8} "${quote}" → "${sliced}"`)
    }
    stars.push({
      batch: n,
      review_id: rv.id,
      branch: rv.branch,
      channel: rv.channel,
      date: rv.date,
      date_source: rv.date_source,
      week: rv.iso_week,
      week_label: rv.week_label,
      polarity: pol === 'p' ? 'pos' : 'neg',
      galaxy: GALAXY_BY_CODE[g],
      phenomenon: ph,
      quote,
      // 원문 그대로의 조각(공백·줄바꿈 포함). 운영 표 적재는 서버에서 substr(content_ko, start+1, len)로
      // 같은 조각을 만든다 — 화면 발췌와 DB 발췌가 글자 하나까지 같게 하기 위해 이 값을 정본으로 쓴다.
      quote_exact: loc ? Array.from(rv.content_ko as string).slice(loc.start, loc.start + loc.len).join('') : quote,
      quote_start: loc?.start ?? null,
      quote_len: loc?.len ?? null,
      owner: OWNER_BY_CODE[owner],
      relation_signal: sig == null ? null : SIGNAL_BY_CODE[sig],
    })
  }
}

// 같은 리뷰·같은 현상·같은 극성 별이 두 번 나오면 목소리 하나를 두 번 센 것이다
const seen = new Set<string>()
for (const s of stars) {
  const k = `${s.review_id}|${s.phenomenon}|${s.polarity}`
  if (seen.has(k)) errors.push(`같은 리뷰에서 같은 현상 두 번: ${s.review_id.substring(0, 8)} ${s.phenomenon}`)
  seen.add(k)
}

// 같은 현상 이름은 은하·받는 쪽이 하나여야 한다(극성별)
const meta = new Map<string, { galaxy: Set<string>; owner: Set<string> }>()
for (const s of stars) {
  const k = `${s.phenomenon}|${s.polarity}`
  if (!meta.has(k)) meta.set(k, { galaxy: new Set(), owner: new Set() })
  meta.get(k)!.galaxy.add(s.galaxy)
  meta.get(k)!.owner.add(s.owner)
}
for (const [k, m] of meta) {
  if (m.galaxy.size > 1) errors.push(`현상 은하 불일치: ${k} → ${[...m.galaxy].join(',')}`)
  if (m.owner.size > 1) errors.push(`현상 받는 쪽 불일치: ${k} → ${[...m.owner].join(',')}`)
}

stars.sort((a, b) => a.branch.localeCompare(b.branch) || a.date.localeCompare(b.date)
  || a.review_id.localeCompare(b.review_id) || (a.quote_start ?? 0) - (b.quote_start ?? 0))

const tmp = join(dataDir, 'stars.extracted.json.tmp')
writeFileSync(tmp, JSON.stringify({ stars, duplicate_of: dupOf }, null, 1), 'utf8')
renameSync(tmp, join(dataDir, 'stars.extracted.json'))

// 현상 사전: 지점별·극성별 이름, 은하, 받는 쪽, 별 수
const dict: Record<string, Record<string, any>> = {}
for (const s of stars) {
  dict[s.branch] ??= {}
  const k = `${s.polarity === 'pos' ? '+' : '-'} ${s.phenomenon}`
  dict[s.branch][k] ??= { phenomenon: s.phenomenon, polarity: s.polarity, galaxy: s.galaxy, owner: s.owner, stars: 0 }
  dict[s.branch][k].stars++
}
const ptmp = join(dataDir, 'phenomena.json.tmp')
writeFileSync(ptmp, JSON.stringify(dict, null, 1), 'utf8')
renameSync(ptmp, join(dataDir, 'phenomena.json'))

console.log(JSON.stringify({
  batches: files.length, stars: stars.length, reviews_covered: covered.size,
  duplicates: Object.keys(dupOf).length, errors: errors.length,
}))
if (errors.length) {
  console.log(errors.join('\n'))
  process.exit(1)
}
