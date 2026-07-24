// OTA 상세 탭 파생용 순수 함수.
// raw_reviews.raw_date는 채널마다 형식이 다르다 — 여기서 한 형식으로 모은다.

export type Granularity = 'week' | 'month'

export interface ParsedDate {
  date:  string | null   // 'YYYY-MM-DD' — 일 단위를 알 수 없으면 null
  month: string | null   // 'YYYY-MM'
}

const pad = (n: number) => String(n).padStart(2, '0')

// 영문 월 이름 → 월 번호. 아고다 raw에 'March 2026' 형태가 실재한다(127건).
// 폴백(review_month)으로 흘려보내도 date는 어차피 null이라 입도는 같다 —
// 명시적으로 해석하는 이득은 '월'이 맞게 나온다는 것이다.
// review_month가 비어 있거나 raw_date와 어긋난 행에서도 원문 표기의 월을 그대로 살린다.
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

export function parseRawDate(
  rawDate: string | null | undefined,
  reviewMonth?: string | null,
): ParsedDate {
  const s = (rawDate ?? '').trim()
  const fallbackMonth = reviewMonth?.trim() || null

  // 2026-07-21 (아고다·익스피디아)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, month: `${iso[1]}-${iso[2]}` }

  // 2026년 7월 22일 (부킹·트립닷컴)
  const kFull = s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (kFull) {
    const [, y, m, d] = kFull
    return { date: `${y}-${pad(+m)}-${pad(+d)}`, month: `${y}-${pad(+m)}` }
  }

  // 2026.07.04 (야놀자)
  const dot = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (dot) {
    const [, y, m, d] = dot
    return { date: `${y}-${pad(+m)}-${pad(+d)}`, month: `${y}-${pad(+m)}` }
  }

  // 2026년 6월 (에어비앤비) — 일 단위 없음
  const kMonth = s.match(/^(\d{4})년\s*(\d{1,2})월\s*$/)
  if (kMonth) {
    const [, y, m] = kMonth
    return { date: null, month: `${y}-${pad(+m)}` }
  }

  // March 2026 / june 2026 (아고다 영문 표기) — 일 단위 없음.
  // 대소문자 무시, 앞뒤 공백 허용(위에서 trim 완료). 월 이름이 아니면 폴백으로 넘긴다.
  const enMonth = s.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (enMonth) {
    const m = EN_MONTHS[enMonth[1].toLowerCase()]
    if (m) return { date: null, month: `${enMonth[2]}-${pad(m)}` }
  }

  // '2개월 전' 등 상대 표현(여기어때) — 절대값 복원 불가, review_month로 대체
  return { date: null, month: fallbackMonth }
}

export function weekStartOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = d.getUTCDay()            // 0=일 … 6=토
  const back = dow === 0 ? 6 : dow - 1 // 월요일까지 되돌릴 일수
  d.setUTCDate(d.getUTCDate() - back)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function monthStartOf(month: string): string {
  return `${month}-01`
}

// 'YYYY-MM-DD'에 일수를 더한다. 전부 UTC 기준 — 로컬 시간대가 끼어들 여지를 두지 않는다.
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// 'YYYY-MM-DD' 두 날짜의 일수 차이(later - earlier). 전부 UTC 자정으로 파싱한다 —
// 문자열 뺄셈이나 로컬 Date는 시간대·서머타임에 흔들리므로 쓰지 않는다.
export function daysBetweenIso(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00Z`).getTime()
  const b = new Date(`${later}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

// 리뷰 작성률 분자는 연속한 두 ota_scores 스냅샷의 review_count 델타이고, 이 델타를
// '한 주치 신규 리뷰'로 보려면 두 스냅샷이 실제로 한 주 간격이어야 한다. 이 컷오프는
// '직전 스냅샷과의 간격이 한 주로 볼 수 있는 정상 범위인가'를 판정한다.
//
// 컷오프를 10일로 둔 근거: 스냅샷은 7일 간격으로 수집하도록 설계됐지만 실제 수집은
// 하루이틀 밀린다. 8일 간격은 정상적인 한 주고, 14일 간격은 한 주가 통째로 빠진 것이다.
// 그래서 그 사이인 10일을 경계로 삼는다.
// 🔴 이 값을 정확히 7일로 조이지 말 것 — 정상적인 8·9일 주가 통째로 버려져
//    (신설 Agoda 04-06처럼) 멀쩡한 작성률까지 사라진다. 8일은 살리고 14일은 버리는 게 목적이다.
export const MAX_WEEKLY_GAP_DAYS = 10

export function isWeeklyGap(prevIso: string, currIso: string): boolean {
  return daysBetweenIso(prevIso, currIso) <= MAX_WEEKLY_GAP_DAYS
}

// 기준일(오늘)이 속한 주부터 거슬러 n개 주의 월요일 목록(오름차순).
// 기준일을 인자로 받는 이유: new Date()(로컬)와 toISOString()(UTC)을 섞으면
// KST 09시 이전 실행에서 '오늘'이 전날로 밀려 월요일 오전 실행 시 이번 주가 통째로 빠진다.
// 호출자가 로컬 달력으로 'YYYY-MM-DD'를 정해 넘기고, 이후 계산은 전부 UTC로만 한다.
export function recentWeekStarts(todayIso: string, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(weekStartOf(addDaysIso(todayIso, -i * 7)))
  }
  return [...new Set(out)].sort()
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

// 주 목록이 실제로 걸치는 모든 달('YYYY-MM', 오름차순).
// 주 시작일의 달만 모으면, 최신 주의 월요일이 전월이면 그 주의 이번 달 날짜가
// review_month 필터에서 통째로 빠진다 — 경고도 에러도 없이 조용히 잘린다.
// 각 주는 월~일 7일이므로 마지막 주는 시작일 +6일까지 포함해 범위를 잡는다.
export function monthsCovering(weekStarts: string[]): string[] {
  if (weekStarts.length === 0) return []
  const sorted = [...weekStarts].sort()
  const firstMonth = sorted[0].substring(0, 7)
  const lastMonth  = addDaysIso(sorted[sorted.length - 1], 6).substring(0, 7)

  const out: string[] = []
  for (let m = firstMonth; m <= lastMonth; m = nextMonth(m)) out.push(m)
  return out
}

// ── --month YYYY-MM 이 펼쳐지는 창 ────────────────────────────────
// 상류 파싱 절차(/parse-reviews 2026-06)는 달력 월을 키로 돈다. 그런데 파생 배치는
// --weeks N(오늘부터 거슬러 N주)으로 창을 잡아 왔다 — 실행할 때마다 사람이 '그 달을
// 덮으려면 몇 주인가'를 암산해야 했고, 하나 모자라게 잡아도 실행은 성공한 것처럼 끝난다
// (그 달 앞부분 주가 조용히 빠진 채). 그 산수를 여기서 결정론적으로 한다.
//
// '덮는다'의 정의: 그 달의 1일이 든 주부터 말일이 든 주까지, 사이의 모든 주.
// 달의 첫날·마지막 날은 대개 주중에 걸리므로 양 끝 주는 이웃 달과 겹친다. 겹치는 쪽을
// 잘라내면 그 며칠의 리뷰가 어느 주 버킷에도 들어가지 못한다 — 창은 넓게 잡고,
// 주 버킷 필터(targetWeeks)가 그대로 판정하게 둔다.
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export interface MonthWindow {
  month: string          // 'YYYY-MM'
  firstDay: string       // 그 달 1일
  lastDay: string        // 그 달 말일(윤년 반영)
  weeks: string[]        // 주간 채널용 — 월요일 목록(오름차순)
  monthBuckets: string[] // 월간 채널용 — 정확히 그 달 하나
}

// 형식이 어긋나면 던진다 — 호출부가 비정상 종료시킨다.
// 조용히 기본값(4주)으로 흘리면 '6월을 돌렸다'고 믿은 실행이 엉뚱한 창을 돈다.
export function monthWindow(month: string | null | undefined): MonthWindow {
  const m = (month ?? '').trim()
  if (!MONTH_PATTERN.test(m)) {
    throw new Error(
      `--month 는 'YYYY-MM' 형식(월은 01~12)이어야 합니다 (받은 값: "${month ?? '없음'}") — 예: --month 2026-06`
    )
  }
  const firstDay = monthStartOf(m)
  // 말일은 '다음 달 1일 - 1일'로 구한다 — 윤년·30/31일을 표로 들고 있지 않기 위해서다.
  const lastDay = addDaysIso(monthStartOf(nextMonth(m)), -1)

  const lastWeek = weekStartOf(lastDay)
  const weeks: string[] = []
  // ISO 'YYYY-MM-DD'는 사전순 비교가 곧 날짜 비교다.
  for (let w = weekStartOf(firstDay); w <= lastWeek; w = addDaysIso(w, 7)) weeks.push(w)

  // 월간 채널(에어비앤비·여기어때)은 애초에 달로 버킷을 만든다 — 주 창이 이웃 달을
  // 걸친다고 해서 이웃 달 버킷까지 파생 대상에 넣으면, '6월을 돌렸는데 5·7월 버킷이
  // 덮여 쓰였다'가 된다. 물어본 달 하나만 준다.
  return { month: m, firstDay, lastDay, weeks, monthBuckets: [m] }
}

// 버킷이 덮는 구간의 마지막 날('YYYY-MM-DD').
// 주 버킷은 시작일(월)+6일(일), 월 버킷은 그 달의 말일이다.
export function bucketPeriodEnd(weekStart: string, granularity: Granularity): string {
  if (granularity === 'month') {
    return addDaysIso(monthStartOf(nextMonth(weekStart.substring(0, 7))), -1)
  }
  return addDaysIso(weekStart, 6)
}

// 구간이 끝난 뒤에도 뒤늦은 리뷰를 기다려 주는 유예 일수.
// raw_reviews는 주기적 수집으로 채워지므로 구간이 끝난 뒤에도 그 구간의 리뷰가 계속 들어온다
// (에어비앤비 실측: review_month 2026-06의 47건 중 6건이 7월에, 2026-05의 51건 중 18건이
//  6월에, 2026-04의 54건 중 28건이 5월에 적재됐다).
export const SETTLE_GRACE_DAYS = 7

// 이 버킷이 아직 '확정되지 않았는가' — 뒤늦은 리뷰가 더 들어올 여지가 있는가.
//
// 구간이 아직 끝나지 않았거나, 끝난 지 SETTLE_GRACE_DAYS일 이내면 미확정으로 본다.
// 파생 배치가 자기가 쓴 행을 다시 분석할지 정하는 기준이다 — 확정된 버킷까지 매주 다시
// 분석하면 주간 루틴이 몇 달치 본문을 반복 분석하는 비용을 치른다.
// 값이 싼 점수 분포는 이 판정을 쓰지 않고 자기 행을 항상 다시 계산한다.
export function isUnsettledBucket(
  weekStart: string,
  granularity: Granularity,
  todayIso: string,
): boolean {
  // ISO 'YYYY-MM-DD'는 사전순 비교가 곧 날짜 비교다.
  return todayIso <= addDaysIso(bucketPeriodEnd(weekStart, granularity), SETTLE_GRACE_DAYS)
}

// ── 행 출처(source) 판정 ───────────────────────────────────────────
// '무엇을 덮어써도 되는가'의 규칙. 스크립트가 아니라 여기 두는 이유는 DB 없이 전수 검증하기
// 위해서다 — 지금 DB에는 파생 행이 하나도 없어 실행만으로는 아래 분기의 절반이 열리지 않는다.

export type DetailSource = 'manual' | 'derived'

// 키 하나에 행이 여러 개 달리는 표(ota_voc는 한 버킷에 키워드 행이 여럿)에서 키의 출처를 정한다.
// 한 행이라도 사람이 넣었으면 그 키는 manual이다 — 사람 손이 닿은 행을 지우는 쪽이 훨씬 비싼 실수다.
export function mergeSource(prev: DetailSource | undefined, next: DetailSource): DetailSource {
  return prev === 'manual' || next === 'manual' ? 'manual' : 'derived'
}

// 버킷 하나에 대한 판정. 다섯 값은 서로 배타적이고, 대상 버킷은 반드시 이 중 하나로 떨어진다
// (기록 = new + refresh + overwrite, 보류 = skip-manual + skip-settled).
export type WriteAction = 'new' | 'refresh' | 'overwrite' | 'skip-manual' | 'skip-settled'

export const WRITE_ACTION_LABEL: Record<WriteAction, string> = {
  'new':          '신규',
  'refresh':      '파생 재분석',
  'overwrite':    '수기 덮어씀',
  'skip-manual':  '수기 보존',
  'skip-settled': '확정 버킷 건너뜀',
}

export function isWriteAction(a: WriteAction): boolean {
  return a === 'new' || a === 'refresh' || a === 'overwrite'
}

// 판정에 필요한 입력 전부. --fill-empty가 묶어 주던 두 보장을 여기서 분리한다.
//   · fillEmpty        — 수기 입력(manual)을 보호한다.
//   · unsettled        — 이 버킷이 아직 확정되지 않았는가.
//   · reanalyzeSettled — 확정된 파생 버킷도 다시 분석 대상에 넣는다(--reanalyze-settled).
export interface WritePlanOpts {
  fillEmpty: boolean
  unsettled: boolean
  // 생략하면 false. 기존 호출부(점수 분포 등)의 동작을 바꾸지 않기 위해 선택 값이다.
  reanalyzeSettled?: boolean
}

// 기존 행이 'derived'라고 이미 확정된 뒤에만 부르는 내부 판정.
// 반환 타입에 skip-manual·overwrite가 아예 없다 — 이 함수는 수기 행을 판정할 수단 자체가 없고,
// reanalyzeSettled는 오직 여기서만 읽힌다. 그래서 이 플래그로 수기 보호를 뚫는 경로가
// 주석이 아니라 구조적으로 존재하지 않는다.
function planDerivedWrite(opts: WritePlanOpts): 'refresh' | 'skip-settled' {
  // --fill-empty가 없으면 확정 여부를 따지지 않고 어차피 전부 다시 쓴다.
  // 그래서 --reanalyze-settled 는 --fill-empty 없이는 구조적으로 아무 일도 하지 않는다
  // (강제할 대상인 'skip-settled' 자체가 나오지 않는다).
  if (!opts.fillEmpty) return 'refresh'
  if (opts.unsettled) return 'refresh'
  // 여기가 확정된 파생 버킷 — 주간 루틴은 건너뛰고, 소급 적재(backfill)는 강제로 다시 분석한다.
  return opts.reanalyzeSettled === true ? 'refresh' : 'skip-settled'
}

// 대상 표(불만·VOC·점수 분포)마다 자기 표의 출처로 따로 부른다.
// 불만 행의 출처로 VOC 삭제까지 결정하면, 손으로 넣은 VOC가 '불만 행이 없다'거나
// '불만 행이 파생이다'라는 남의 사정으로 통째로 지워진다.
//
// unsettled=false는 '이 버킷은 확정됐다'는 뜻으로, 재분석이 비싼 값(불만·VOC)에만 쓴다.
// 재계산이 사실상 공짜인 점수 분포는 항상 unsettled=true로 불러 자기 행을 매번 다시 쓴다.
//
// 🔴 수기 보호(manual)는 어떤 플래그로도 열리지 않는다. --reanalyze-settled 는 아래
//    manual 분기를 지난 뒤에야 닿을 수 있는 곳(planDerivedWrite)에서만 읽힌다.
export function planDetailWrite(
  existing: DetailSource | undefined,
  opts: WritePlanOpts,
): WriteAction {
  if (existing === undefined) return 'new'
  // 수기 행은 여기서 판정이 끝난다 — reanalyzeSettled 는 이 아래로 전달되지 않는다.
  if (existing === 'manual') return opts.fillEmpty ? 'skip-manual' : 'overwrite'
  return planDerivedWrite(opts)
}

// 이 버킷이 '--reanalyze-settled 때문에' 다시 분석 대상이 됐는가.
// 플래그가 없었으면 어떤 판정이 나왔을지를 같은 함수로 직접 계산해 비교한다 —
// 조건을 로그 쪽에 손으로 다시 적으면 판정과 로그가 언젠가 어긋난다.
// 운영자가 '플래그가 실제로 무엇을 되살렸는지'를 세고 볼 수 있게 하는 것이 목적이다.
export function isForcedReanalysis(
  existing: DetailSource | undefined,
  opts: WritePlanOpts,
): boolean {
  if (opts.reanalyzeSettled !== true) return false
  const withFlag = planDetailWrite(existing, opts)
  const without  = planDetailWrite(existing, { ...opts, reanalyzeSettled: false })
  return withFlag === 'refresh' && without === 'skip-settled'
}

// ota_properties.ota_name → raw_reviews.ota_site (같은 채널의 두 표기)
export const OTA_SITE_BY_NAME: Record<string, string> = {
  'Agoda':    '아고다',
  'Booking':  '부킹닷컴',
  'Trip.com': '트립닷컴',
  'Expedia':  '익스피디아',
  'Airbnb':   '에어비앤비',
  'NOL':      '야놀자',
  '여기어때':  '여기어때',
}

// ── 스크래퍼가 리뷰로 잘못 잡은 UI 요소 행 ─────────────────────────
// 🔴 이 필터는 원인 치료가 아니라 하류 방어다. 진짜 고쳐야 할 곳은 수집(ingestion)이다.
//
// 무슨 일이 있었나: 에어비앤비 수집기가 리뷰 목록을 한 행씩 밀려 읽어, 페이지 내비게이션
// 버튼인 '호스팅 하기'(Become a host)를 리뷰어 이름으로 잡았다. 그 행의 본문에는
// '바로 앞 진짜 리뷰의 본문 + 줄바꿈 + 바로 뒤 리뷰어 이름'이 붙는다.
//   채운        | 너무 깔끔하소 좋았습니다 !
//   호스팅 하기 | 너무 깔끔하소 좋았습니다 !\n서영     ← 리뷰가 아님
// 결과: 그 달 버킷의 리뷰 건수가 부풀고, 같은 손님의 감정이 두 번 세어진다
// (2026-04~07 전 지점 48행, 동대문 2026-06은 9행 중 5행 = 56%가 이 행이었다).
//
// 기존 중복 제거 키 (reviewer, raw_date, rating, content 앞 80자)로는 절대 못 잡는다 —
// 리뷰어도 다르고(진짜 이름 vs '호스팅 하기') 본문도 다르다(뒤에 이름이 덧붙음).
//
// raw_reviews는 사용자의 실제 원본 데이터다. 지우거나 고치지 않고, 파생 배치가 읽는
// 시점에 건너뛴다. 수집기가 고쳐져 이 행이 더는 들어오지 않게 되더라도, 이미 쌓인
// 48행은 그대로 남아 있으므로 이 필터를 삭제하면 안 된다.
//
// 판정은 리뷰어 값의 '완전 일치'로만 한다. 본문 유사도·길이 같은 휴리스틱을 쓰지 않는
// 이유는 정밀도 때문이다 — 여기서의 오탐(false positive)은 진짜 손님의 목소리를
// 조용히 분석에서 지우는 일이고, 짧은 칭찬 리뷰("깨끗해요")는 서로 실제로 닮았다.
// 앞뒤·중간 공백만 정규화한다(수집 시 공백이 흔들려도 같은 라벨로 보기 위해서다).
//
// 다음 UI 요소는 '호스팅 하기'라는 이름이 아닐 것이다 — 새 라벨이 발견되면
// 이 집합에 한 줄 추가하고 테스트를 한 줄 더한다. 판정 로직은 그대로 둔다.
const SCRAPER_CHROME_REVIEWERS = new Set<string>([
  '호스팅 하기',   // 에어비앤비 내비게이션 버튼(Become a host) — 2026-07 확인
])

// 이 행이 손님이 쓴 리뷰가 아니라 스크래퍼가 잡아 온 화면 UI 요소인가.
// 채널을 가리지 않는다 — 어느 채널에도 '호스팅 하기'라는 이름의 손님은 없고,
// 같은 수집기가 다른 채널에 같은 행을 남길 수 있다.
export function isScraperChromeReviewer(reviewer: string | null | undefined): boolean {
  if (!reviewer) return false
  return SCRAPER_CHROME_REVIEWERS.has(reviewer.trim().replace(/\s+/g, ' '))
}

// ── raw_reviews 중복 제거 ─────────────────────────────────────────
// 부킹닷컴 raw에 중복 행이 실재한다(~14%) — 파생 배치가 버킷을 만들기 전에 반드시 제거한다.
// scripts/derive-ota-detail.ts의 로컬 함수였던 것을 그대로 옮겼다(로직 변경 없음) —
// 드릴다운(lib/weeklyReviews.ts)이 같은 규칙을 쓰려면 스크립트가 아니라 여기 있어야 한다.
export function dedupeRawRows<T extends { reviewer?: string | null; raw_date?: string | null; rating?: number | string | null; content?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter(r => {
    const k = `${r.reviewer ?? ''}|${r.raw_date ?? ''}|${r.rating ?? ''}|${(r.content ?? '').slice(0, 80)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * 파생 배치가 버킷을 만들기 전에 거는 행 필터. 🔴 배치와 드릴다운이 반드시 같은 것을 써야 한다.
 *
 * 왜 공유하는가: 화면이 "3건 8.0"이라 써 놓고 다른 3건을 띄우면 리포트가 근거를 잃는다.
 * 예전엔 두 경로가 같은 규칙을 각자 구현했고, 그래서 드릴다운이 중복 행과 스크래퍼 UI 행을
 * 다시 주워 왔다(부킹 중복 14%, 에어비앤비 '호스팅 하기' 행 48건).
 *
 * 🔴 여기에 필터를 추가하면 배치와 화면 양쪽에 자동으로 반영된다. 한쪽에만 넣지 말 것.
 */
export function eligibleRawRows<T extends { reviewer?: string | null; raw_date?: string | null; rating?: number | string | null; content?: string | null }>(rows: T[]): T[] {
  return dedupeRawRows(rows).filter(r => !isScraperChromeReviewer(r.reviewer))
}

// ── 지점×채널 제외 지정(--exclude) ────────────────────────────────
// '이번 실행에서 손대지 않을 조합'의 규칙. 스크립트가 아니라 여기 두는 이유는 DB 없이
// 전수 검증하기 위해서다 — 오타 하나가 조용히 '아무것도 제외하지 않음'으로 떨어지면,
// 비워 두기로 한 구간에 파생 행이 덮여 쓰이고 실행 로그만으로는 알 수 없다.
//
// 형식은 '지점:채널'이고 쉼표로 여러 개를 이어 쓸 수 있다. --exclude 를 여러 번 써도 된다.
//   --exclude 신설:Agoda
//   --exclude 신설:Agoda,동대문:Booking
//   --exclude 신설:Agoda --exclude 동대문:Booking

export interface OtaExclusion {
  branch: string
  ota: string   // ota_properties.ota_name 표기(Agoda·Booking…)
}

// 형식이 어긋나거나 채널명을 알 수 없으면 던진다 — 호출부가 비정상 종료시킨다.
// 조용히 건너뛰면 '제외했다'고 믿은 조합이 그대로 파생 대상이 된다.
export function parseExclusions(values: string[]): OtaExclusion[] {
  const known = Object.keys(OTA_SITE_BY_NAME)
  const out: OtaExclusion[] = []

  for (const raw of values) {
    const parts = raw.split(',')
    for (const part of parts) {
      const token = part.trim()
      if (!token) {
        throw new Error(`--exclude 에 빈 항목이 있습니다 (받은 값: "${raw}") — '지점:채널' 형식으로 적어 주세요`)
      }
      const seg = token.split(':')
      if (seg.length !== 2) {
        throw new Error(`--exclude 는 '지점:채널' 형식이어야 합니다 (받은 값: "${token}")`)
      }
      const branch = seg[0].trim()
      const ota    = seg[1].trim()
      if (!branch || !ota) {
        throw new Error(`--exclude 의 지점 또는 채널이 비어 있습니다 (받은 값: "${token}")`)
      }
      // 채널명은 정본 매핑에 있는 이름만 받는다 — 'agoda'·'아고다' 같은 표기 흔들림도
      // 실제로는 아무것도 제외하지 못하므로 여기서 막는다.
      if (!known.includes(ota)) {
        throw new Error(
          `--exclude 의 채널명 '${ota}' 을(를) 알 수 없습니다 (받은 값: "${token}") — ` +
          `가능한 값: ${known.join(', ')}`
        )
      }
      // 같은 조합을 두 번 적어도 로그·검증이 중복되지 않게 한 번만 담는다.
      if (!out.some(e => e.branch === branch && e.ota === ota)) out.push({ branch, ota })
    }
  }
  return out
}

export function isExcludedPair(
  exclusions: OtaExclusion[],
  branch: string,
  otaName: string,
): boolean {
  return exclusions.some(e => e.branch === branch && e.ota === otaName)
}

export function formatExclusion(e: OtaExclusion): string {
  return `${e.branch}:${e.ota}`
}

// ── 채널별 입도(granularity) ──────────────────────────────────────
// '이 채널이 주 단위인가 월 단위인가'의 단일 정본.
//
// 파생 배치와 입력 모달이 각자 사본을 들고 있으면 반드시 어긋난다. 모달 쪽은 사본 대신
// '이미 쌓인 분포 행이 전부 month인가'로 추론했는데, 여기어때는 3개 지점 모두 분포 행이
// 0개라 그 추론이 week로 떨어졌다 — 월 단위 채널에 주 행을 쓰게 되고, 한 property에
// 주·월 행이 섞이면 월별 뷰가 '07/06'과 '7월'을 똑같이 '7월'로 접어 React 키가 중복된다.
//
// 판정은 데이터가 아니라 채널이 한다. 행이 0개여도 답이 달라지지 않는다.
const MONTHLY_ONLY_SITES = new Set(['에어비앤비', '여기어때'])

// raw_reviews.ota_site 표기 기준 — 파생 배치가 보는 이름.
export function granularityForSite(otaSite: string): Granularity {
  return MONTHLY_ONLY_SITES.has(otaSite) ? 'month' : 'week'
}

// ota_properties.ota_name 표기 기준 — 앱·UI가 보는 이름.
// 매핑에 없는 이름은 이름 그대로 판정해 보고, 그래도 아니면 주 단위로 본다
// (새 채널이 아무 근거 없이 월 버킷으로 빠지는 쪽이 더 나쁜 기본값이다).
export function granularityForOtaName(otaName: string): Granularity {
  return granularityForSite(OTA_SITE_BY_NAME[otaName] ?? otaName)
}

export function bandsFor(scoreMax: number): string[] {
  if (scoreMax === 5) return ['1점', '2점', '3점', '4점', '5점']
  return ['1점대','2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점']
}

export function distColumnsFor(scoreMax: number): string[] {
  const n = scoreMax === 5 ? 5 : 10
  return Array.from({ length: n }, (_, i) => `score_${i + 1}`)
}

export interface ScoreDist {
  counts: Record<string, number>
  avg:    number
  total:  number
}

export function distFromRatings(ratings: number[], scoreMax: number): ScoreDist {
  const cols   = distColumnsFor(scoreMax)
  const counts: Record<string, number> = {}
  cols.forEach(c => { counts[c] = 0 })

  let sum = 0
  ratings.forEach(r => {
    const clamped = Math.min(Math.max(r, 1), scoreMax)
    const idx     = Math.min(Math.floor(clamped) - 1, cols.length - 1)
    counts[cols[idx]] += 1
    sum += r
  })

  const total = ratings.length
  return {
    counts,
    total,
    avg: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
  }
}
