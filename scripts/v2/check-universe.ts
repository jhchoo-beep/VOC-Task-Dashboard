/**
 * V2 A8 — universe.json 형식·정합 검사 (DB 접속 없음). 하나라도 어긋나면 비정상 종료.
 *   npx tsx scripts/v2/check-universe.ts <universe.json 경로>
 */
import { readFileSync } from 'node:fs'
import { isoWeekOf } from '../../lib/v2/isoWeek'
import { RULES } from '../../lib/v2/constellationRules'

const path = process.argv[2]
const u = JSON.parse(readFileSync(path, 'utf8'))
const errors: string[] = []
const err = (m: string) => errors.push(m)

const GALAXIES = ['청결', '소음', '시설', '응대/환대/커뮤니티', '체크인/체크아웃', '위치/접근성', '어메니티', '가격', '기타']
const OWNERS = ['CM', 'CR', 'FM', '운영 밖']
const SIGNALS = ['감정 고조', '재문의', '보상 요구', '평판 리스크']
const NEG_STATUS = ['씨앗', '열림', '수행과제 진행', '관찰', '성운', '재발']
const POS_STATUS = ['씨앗', '유지', '흐려짐']
// 요약·이름에 들어가면 안 되는 말: 원인 단정·처방·지시, 「고객」
const BANNED = [/고객/, /원인/, /때문/, /해야/, /필요(하|합)/, /개선/, /조치(하|를)/, /권장/, /하세요/, /바랍니다/, /도입/, /교체(하|를)/, /점검(하|을)/]
const ROOM_NO = /\d{3,4}\s*호/

// 최상위 키
for (const k of ['meta', 'north_star', 'core', 'guardrails', 'galaxies', 'constellations', 'stars', 'reviews']) if (!(k in u)) err(`최상위 키 없음: ${k}`)

const starIds = new Set<string>()
const starById = new Map<string, any>()
for (const s of u.stars) {
  if (starIds.has(s.id)) err(`별 ID 중복 ${s.id}`)
  starIds.add(s.id); starById.set(s.id, s)
  for (const k of ['id', 'review_id', 'branch', 'channel', 'date', 'date_source', 'week', 'polarity', 'galaxy', 'phenomenon', 'quote', 'owner', 'relation_signal', 'constellation_id']) {
    if (!(k in s)) err(`별 ${s.id} 키 없음 ${k}`)
  }
  if (!u.reviews[s.review_id]) err(`별 ${s.id} 의 review_id 가 reviews 에 없음`)
  if (!GALAXIES.includes(s.galaxy)) err(`별 ${s.id} 은하 값 ${s.galaxy}`)
  if (!OWNERS.includes(s.owner)) err(`별 ${s.id} 받는 쪽 ${s.owner}`)
  if (s.relation_signal != null && !SIGNALS.includes(s.relation_signal)) err(`별 ${s.id} 관계 신호 ${s.relation_signal}`)
  if (!['neg', 'pos'].includes(s.polarity)) err(`별 ${s.id} 극성 ${s.polarity}`)
  if (!['raw', 'collected', 'month'].includes(s.date_source)) err(`별 ${s.id} 날짜 출처 ${s.date_source}`)
  if (s.week !== isoWeekOf(s.date)) err(`별 ${s.id} week 불일치`)
  if (s.date > u.meta.as_of) err(`별 ${s.id} 기준일 뒤 날짜`)
  if (!s.quote || !s.quote.trim()) err(`별 ${s.id} 발췌 비어 있음`)
  if (/고객/.test(s.phenomenon) || ROOM_NO.test(s.phenomenon)) err(`별 ${s.id} 현상 이름 금지어/객실 번호`)
}

const cIds = new Set<string>()
for (const c of u.constellations) {
  if (cIds.has(c.id)) err(`별자리 ID 중복 ${c.id}`)
  cIds.add(c.id)
  for (const k of ['id', 'branch', 'galaxy', 'name', 'polarity', 'status', 'star_ids', 'first_date', 'last_date', 'distinct_weeks', 'recent_4w', 'monthly', 'channels', 'owner', 'task', 'summary', 'history']) {
    if (!(k in c)) err(`별자리 ${c.id} 키 없음 ${k}`)
  }
  const allowed = c.polarity === 'neg' ? NEG_STATUS : POS_STATUS
  if (!allowed.includes(c.status)) err(`별자리 ${c.id} 상태 ${c.status}`)
  if (!GALAXIES.includes(c.galaxy)) err(`별자리 ${c.id} 은하 ${c.galaxy}`)
  if (!OWNERS.includes(c.owner)) err(`별자리 ${c.id} 받는 쪽 ${c.owner}`)
  if (!c.summary || !c.summary.trim()) err(`별자리 ${c.id} 요약 없음`)
  for (const b of BANNED) {
    if (b.test(c.summary)) err(`별자리 ${c.id} 요약 금지 표현 ${b} — ${c.summary}`)
    if (b.test(c.name)) err(`별자리 ${c.id} 이름 금지 표현 ${b}`)
  }
  if (ROOM_NO.test(c.name) || ROOM_NO.test(c.summary)) err(`별자리 ${c.id} 객실 번호`)
  const members = c.star_ids.map((id: string) => starById.get(id))
  if (members.some((m: any) => !m)) { err(`별자리 ${c.id} star_ids 중 stars 에 없는 ID`); continue }
  for (const m of members) {
    if (m.constellation_id !== c.id) err(`별 ${m.id} constellation_id(${m.constellation_id}) ≠ ${c.id}`)
    if (m.branch !== c.branch || m.polarity !== c.polarity || m.phenomenon !== c.name) err(`별자리 ${c.id} 에 다른 지점·극성·현상 별 ${m.id}`)
  }
  const weeks = new Set(members.map((m: any) => m.week)).size
  if (weeks !== c.distinct_weeks) err(`별자리 ${c.id} distinct_weeks 불일치`)
  const dates = members.map((m: any) => m.date).sort()
  if (dates[0] !== c.first_date || dates[dates.length - 1] !== c.last_date) err(`별자리 ${c.id} 첫·마지막 날짜 불일치`)
  if (c.status === '씨앗') {
    if (members.length < RULES.seed) err(`씨앗 ${c.id} 별 ${members.length}개`)
  } else {
    if (members.length < RULES.constellationMin) err(`별자리 ${c.id} 별 ${members.length}개(<3)`)
    if (weeks < RULES.distinctWeeks) err(`별자리 ${c.id} 서로 다른 주 ${weeks}(<2)`)
  }
  const monthSum = Object.values(c.monthly as Record<string, number>).reduce((a, b) => a + b, 0)
  if (monthSum !== members.length) err(`별자리 ${c.id} monthly 합 ${monthSum} ≠ ${members.length}`)
  const chSum = Object.values(c.channels as Record<string, number>).reduce((a, b) => a + b, 0)
  if (chSum !== members.length) err(`별자리 ${c.id} channels 합 불일치`)
}
for (const s of u.stars) {
  if (s.constellation_id != null && !cIds.has(s.constellation_id)) err(`별 ${s.id} constellation_id ${s.constellation_id} 가 constellations 에 없음`)
}

// 리뷰: 리뷰어 이름 없음
for (const [id, r] of Object.entries<any>(u.reviews)) {
  for (const k of Object.keys(r)) if (/reviewer|author|name|guest/i.test(k)) err(`리뷰 ${id} 이름 칸 ${k}`)
  for (const k of ['branch', 'channel', 'date', 'rating', 'scale', 'text_ko', 'text_orig']) if (!(k in r)) err(`리뷰 ${id} 키 없음 ${k}`)
}

// meta.counts 정합
const c = u.meta.counts
if (c.stars !== u.stars.length) err('counts.stars 불일치')
if (c.neg + c.pos !== c.stars) err('counts.neg+pos 불일치')
if (c.seeds !== u.constellations.filter((x: any) => x.status === '씨앗').length) err('counts.seeds 불일치')
if (c.constellations !== u.constellations.filter((x: any) => x.status !== '씨앗').length) err('counts.constellations 불일치')
if (c.singles !== u.stars.filter((s: any) => s.constellation_id == null).length) err('counts.singles 불일치')
const gStars = u.galaxies.reduce((a: number, g: any) => a + g.stars, 0)
if (gStars !== u.stars.length) err('galaxies 별 합 불일치')
if (u.galaxies.length !== 9) err('은하 9개 아님')
for (const k of ['seed', 'constellation_min', 'distinct_weeks', 'window_days']) if (!(k in u.meta.rules)) err(`meta.rules.${k} 없음`)
if (u.meta.rules.seed !== 2 || u.meta.rules.constellation_min !== 3 || u.meta.rules.distinct_weeks !== 2 || u.meta.rules.window_days !== 90) err('meta.rules 가 확정 기준값과 다름')

console.log(JSON.stringify({ stars: u.stars.length, constellations: u.constellations.length, reviews: Object.keys(u.reviews).length, errors: errors.length }))
if (errors.length) {
  console.log(errors.slice(0, 60).join('\n'))
  process.exit(1)
}
console.log('형식 검사 통과')
