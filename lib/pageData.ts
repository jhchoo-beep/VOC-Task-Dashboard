import { unstable_cache } from 'next/cache'
import { supabase, calcCLX } from '@/lib/supabase'
import { distColumnsFor, isWeeklyGap, OTA_SITE_BY_NAME } from '@/lib/otaDetail'
import { buildWeeklyReport, listReportWeeks } from '@/lib/weeklyReport'
import type {
  PropertyRow, DistRow, ScoreSnapshotRow, WeeklyReport,
} from '@/lib/weeklyReport'
import { buildChannelReviews, drilldownMonths } from '@/lib/weeklyReviews'
import type { ChannelReviews, RawReviewRow, TranslatedRow } from '@/lib/weeklyReviews'
import type { WeeklyTaskRow } from '@/lib/weeklyTasks'

// 모든 페이지가 auth()로 인해 동적 렌더링되므로 revalidate만으로는 캐시가 작동하지 않는다.
// unstable_cache로 데이터 레이어를 직접 캐시하고, 쓰기 API에서 revalidateTag로 즉시 무효화한다.
// 태그: reviews / tasks / raw-reviews / ota (테이블 단위)

// ─── 전량 조회 헬퍼 ──────────────────────────────────────────
// 🔴 PostgREST는 한 응답에 최대 1000행만 준다(서버 설정 db-max-rows).
//    `.range(0, 9999)`를 걸어도 **소용없다** — 서버 상한이 클라이언트 요청 범위를 이기므로
//    딱 1000행만 오고, 에러도 경고도 없다. 조용히 잘린다.
//    실측(2026-07-23): ota_voc는 count(*)=1,016인데 .range(0, 9999)가 정확히 1,000행을
//    돌려줬다. 잘려 나간 16행이 하필 최신 주라, 한 채널의 bad 감성 VOC 키워드가
//    그 주 화면에서 통째로 사라진 채 아무 증상도 남기지 않았다.
//    그래서 1000행씩 이어 받는다 — 마지막 페이지가 1000행 미만이면 끝.
//
// 페이지마다 같은 정렬을 걸어야 경계가 흔들리지 않으므로 정렬·필터를 콜백으로 받는다.
// 여기에 더해 `tiebreak` 컬럼으로 항상 최종 정렬을 한 번 더 건다: 정렬 키가 week_start·
// task_month처럼 동값이 대량으로 겹치는 컬럼이면 LIMIT/OFFSET마다 동값 구간의 순서가
// 뒤바뀔 수 있고, 그러면 페이지 경계에서 행이 중복되거나 누락된다. PK로 순서를 확정한다.
const PAGE = 1000
async function fetchAllRows(
  table: string,
  columns: string,
  shape: (q: any) => any = q => q,
  tiebreak = 'id',
): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await shape(supabase.from(table).select(columns))
      .order(tiebreak, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

// ─── 점수 현황 (OTA Scores) ─────────────────────────────────
export const getOtaScoresProps = unstable_cache(async () => {
  const [
    scoresRaw, propsRaw, distRaw, complaintsRaw, vocRaw, checkoutsRaw,
  ] = await Promise.all([
    // 전부 fetchAllRows로 이어 받는다. `.range(0, 9999)`는 상한을 못 넘는다(헬퍼 주석 참조).
    // 특히 dist·complaints·scores·checkouts는 오름차순이라, 상한을 넘는 순간 잘려 나가는 쪽이
    // '가장 최신 주'다 — 이 페이지가 보여 주려는 바로 그 데이터가 먼저 사라진다.
    // voc의 내림차순은 consumer가 의존한다(밴드·키워드 표시 순서). 정렬은 그대로 두고
    // 잘림만 없앤다 — 내림차순은 잘림을 덜 아프게 하려는 임시방편이 아니라 표시 순서다.
    fetchAllRows('ota_scores', 'property_id,overall_score,review_count,recorded_at', q => q.order('recorded_at', { ascending: true })),
    // ota_properties는 지점 × 채널 마스터(현재 24행, 상한은 지점 수 × 채널 수)라 구조적으로
    // 1000행에 닿지 않지만, 페이징해도 요청 수가 늘지 않으므로(1000행 미만이면 1회에 종료)
    // 예외를 두지 않는다. PK가 id가 아니라 property_id다.
    fetchAllRows('ota_properties', 'property_id,branch,ota_name,score_max,okr_target', q => q.eq('active', true), 'property_id'),
    fetchAllRows('ota_score_dist', '*', q => q.order('week_start', { ascending: true })),
    fetchAllRows('ota_complaints', '*', q => q.order('week_start', { ascending: true })),
    fetchAllRows('ota_voc', '*', q => q.order('week_start', { ascending: false })),
    fetchAllRows('ota_channel_checkouts', 'property_id,week_start,checkout_count', q => q.order('week_start', { ascending: true })),
  ])

  const scores     = scoresRaw
  const properties = propsRaw
  const dist       = distRaw
  const complaints = complaintsRaw
  const voc        = vocRaw

  // property_id → {branch, ota_name, score_max, okr_target}
  const propMap = new Map<number, { branch: string; ota_name: string; score_max: number; okr_target: number }>()
  properties.forEach((p: any) => propMap.set(p.property_id, p))

  // OTA list (ordered)
  const OTA_ORDER = ['Agoda', 'Booking', 'Trip.com', 'Expedia', '여기어때', 'Airbnb', 'NOL']
  const otaMap = new Map<string, { max: number; okr: number }>()
  properties.forEach((p: any) => {
    if (!otaMap.has(p.ota_name)) otaMap.set(p.ota_name, { max: p.score_max, okr: Number(p.okr_target) })
  })
  const otaList = OTA_ORDER.filter(n => otaMap.has(n)).map(n => ({ name: n, ...otaMap.get(n)! }))

  // All unique dates sorted asc
  const allDates = [...new Set(scores.map((s: any) => s.recorded_at))].sort() as string[]

  // scoreHistory / reviewHistory: branch → ota_name → number[]
  const scoreHistory:  Record<string, Record<string, number[]>> = {}
  const reviewHistory: Record<string, Record<string, number[]>> = {}

  scores.forEach((s: any) => {
    const p = propMap.get(s.property_id)
    if (!p) return
    const { branch, ota_name } = p
    if (!scoreHistory[branch])          scoreHistory[branch]  = {}
    if (!scoreHistory[branch][ota_name]) scoreHistory[branch][ota_name] = new Array(allDates.length).fill(0)
    if (!reviewHistory[branch])          reviewHistory[branch] = {}
    if (!reviewHistory[branch][ota_name]) reviewHistory[branch][ota_name] = new Array(allDates.length).fill(0)
    const idx = allDates.indexOf(s.recorded_at)
    if (idx >= 0) {
      scoreHistory[branch][ota_name][idx]  = Number(s.overall_score)
      reviewHistory[branch][ota_name][idx] = s.review_count
    }
  })

  // Date labels for x-axis: M/D
  const dateLabels = allDates.map(d => {
    const parts = d.split('-')
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`
  })

  // 채널 무관 조립. Agoda 필터를 걸지 않는다.
  const dist2      = <T,>() => ({} as Record<string, Record<string, T>>)
  const put = <T,>(o: Record<string, Record<string, T>>, b: string, ota: string, v: T) => {
    if (!o[b]) o[b] = {}
    o[b][ota] = v
  }

  const fmtWeek = (ws: string) => ws.substring(5).replace('-', '/')

  const scoreDist      = dist2<{ week: string; scores: number[]; avgScore: number; granularity: 'week' | 'month' }[]>()
  const complaints2    = dist2<{ week: string; room: number; bathroom: number }[]>()
  const complaintMemos = dist2<string>()
  const voc2           = dist2<{ week_start: string; band: string; sentiment: string; keyword: string }[]>()
  const scoreMaxByBranchOta = dist2<number>()

  properties.forEach((p: any) => {
    const max  = p.score_max === 5 ? 5 : 10
    const cols = distColumnsFor(max)
    put(scoreMaxByBranchOta, p.branch, p.ota_name, max)

    const dRows = (dist as any[]).filter(d => d.property_id === p.property_id)
    put(scoreDist, p.branch, p.ota_name, dRows.slice(-10).map((r: any) => ({
      week:        r.granularity === 'month' ? `${parseInt(r.week_start.substring(5, 7))}월` : fmtWeek(r.week_start),
      scores:      cols.map(c => r[c] ?? 0),
      avgScore:    Number(r.weekly_avg_score) || 0,
      granularity: (r.granularity ?? 'week') as 'week' | 'month',
    })))

    const cRows = (complaints as any[]).filter(c => c.property_id === p.property_id)
    put(complaints2, p.branch, p.ota_name, cRows.slice(-8).map((c: any) => ({
      week:     c.granularity === 'month' ? `${parseInt(c.week_start.substring(5, 7))}월` : fmtWeek(c.week_start),
      room:     c.room_complaints,
      bathroom: c.bathroom_complaints,
    })))
    put(complaintMemos, p.branch, p.ota_name, cRows[cRows.length - 1]?.memo ?? '')

    const vRows = (voc as any[]).filter(v => v.property_id === p.property_id)
    put(voc2, p.branch, p.ota_name, vRows.map((v: any) => ({
      week_start: v.week_start, band: v.band, sentiment: v.sentiment, keyword: v.keyword,
    })))
  })

  // 리뷰 작성률 = 채널별 주간 신규 리뷰(ota_scores 델타) / 그 채널의 주간 체크아웃.
  // 분자를 저장하지 않는 이유: collect-ota-scores가 이미 매주 누적 리뷰 수를 찍고 있다.
  //
  // 분모는 채널(property) 단위다. 지점 전체 체크아웃이 아니다 —
  // 신설의 119~147건은 '아고다로 예약한 고객의 체크아웃 수'다. 지점 단위로 묶어
  // 전 채널이 나눠 쓰면 분자(부킹 리뷰)와 분모(아고다 체크아웃)의 모집단이 어긋나
  // 아무 의미 없는 비율이 나온다(실측: 신설 Booking 4/119 = 3.4%).
  // 체크아웃이 없는 채널은 행을 한 줄도 만들지 않는다 — UI가 안내 문구를 띄운다.
  const checkoutByPropWeek = new Map<string, number>()
  ;checkoutsRaw.forEach((c: any) => checkoutByPropWeek.set(`${c.property_id}|${c.week_start}`, c.checkout_count))

  const reviewRate = dist2<{ week: string; reviewCount: number; checkoutCount: number; ratePct: number }[]>()
  properties.forEach((p: any) => {
    const snaps = scores
      .filter((s: any) => s.property_id === p.property_id)
      .sort((a: any, b: any) => a.recorded_at < b.recorded_at ? -1 : 1)

    const rows: { week: string; reviewCount: number; checkoutCount: number; ratePct: number }[] = []
    for (let i = 1; i < snaps.length; i++) {
      const ws = snaps[i].recorded_at
      const co = checkoutByPropWeek.get(`${p.property_id}|${ws}`)
      if (!co) continue // 체크아웃 미입력 주는 작성률을 낼 수 없다
      // 델타는 '직전 스냅샷 이후 늘어난 리뷰'다. 두 스냅샷 간격이 한 주보다 크게 벌어지면
      // (예: 수집이 한 주 빠져 14일 간격) 이 델타는 여러 주치를 담고 있어 한 주 체크아웃으로
      // 나눌 수 없다 — 부풀려진 작성률(신설 Agoda 04-06의 84/168=50%) 대신 그 주를 통째로
      // 뺀다. 행이 없으면 서브탭이 깔끔히 넘어가므로 누락이 곧 의도한 결과다. 컷오프 근거는
      // otaDetail의 MAX_WEEKLY_GAP_DAYS 주석 참조(8일=정상 유지, 14일=한 주 결손 제외).
      if (!isWeeklyGap(snaps[i - 1].recorded_at, ws)) continue
      const delta = Math.max(0, (snaps[i].review_count ?? 0) - (snaps[i - 1].review_count ?? 0))
      rows.push({
        week: fmtWeek(ws),
        reviewCount: delta,
        checkoutCount: co,
        ratePct: Math.round(delta / co * 1000) / 10,
      })
    }
    put(reviewRate, p.branch, p.ota_name, rows)
  })

  // 채널별로 '체크아웃 수를 넣으면 실제로 작성률이 나오는' 스냅샷 기준일.
  // 위 루프가 i=1부터 도는 이유는 델타를 내려면 직전 스냅샷이 있어야 하기 때문이다 —
  // 그래서 그 채널의 가장 이른 스냅샷 날짜는 무엇을 입력해도 한 줄도 만들지 못한다.
  // 조인될 수 없는 날짜를 고를 수 있게 두면 저장에 성공하고도 화면이 그대로인
  // 막다른 길이 생긴다. 고를 수 있는 날짜만 내려보낸다.
  // 분모가 채널 단위로 돌아왔으므로 이 목록도 지점 합집합이 아니라 채널 자신의
  // 스냅샷 날짜여야 한다 — 지점 합집합을 쓰면 같은 지점의 다른 채널에만 있는 날짜가
  // 섞여 들어와 똑같은 막다른 길이 다시 생긴다.
  const snapshotDatesByChannel = dist2<string[]>()
  properties.forEach((p: any) => {
    const dates = [...new Set(
      scores.filter((s: any) => s.property_id === p.property_id).map((s: any) => s.recorded_at)
    )].sort() as string[]
    put(snapshotDatesByChannel, p.branch, p.ota_name, dates.slice(1))
  })

  const latestDate = allDates[allDates.length - 1] ?? '2026-05-18'

  // branch+ota → property_id 매핑 (데이터 입력 모달용)
  const branchOtaToId: Record<string, Record<string, number>> = {}
  properties.forEach((p: any) => {
    if (!branchOtaToId[p.branch]) branchOtaToId[p.branch] = {}
    branchOtaToId[p.branch][p.ota_name] = p.property_id
  })

  return {
    recordedAt: latestDate,
    scoreHistory,
    reviewHistory,
    dateLabels,
    dates: allDates,
    snapshotDatesByChannel,
    otaList,
    scoreDist,
    complaints: complaints2,
    complaintMemos,
    voc: voc2,
    reviewRate,
    scoreMaxByBranchOta,
    branchOtaToId,
  }
}, ['ota-scores-props'], { revalidate: 300, tags: ['ota'] })

// ─── 대시보드 (Dashboard) ───────────────────────────────────
export const getDashboardProps = unstable_cache(async (month?: string) => {
  // 1) 월 목록만 컬럼 한정 조회 (리뷰 원문 등 무거운 컬럼 제외)
  //    컬럼을 줄여도 행 수는 그대로다 — 리뷰 한 건이 한 행이라 상한을 넘는다(2026-07-23 927행).
  //    월 목록이 잘리면 드롭다운에서 월이 사라지고, 그 월은 아예 조회할 수 없게 된다.
  const [reviewMonthsRaw, taskMonthsRaw] = await Promise.all([
    fetchAllRows('reviews', 'review_month', q => q.order('review_month', { ascending: false })),
    fetchAllRows('tasks', 'task_month', q => q.order('task_month', { ascending: false })),
  ])
  const months = [...new Set([
    ...reviewMonthsRaw.map((r: any) => r.review_month),
    ...taskMonthsRaw.map((t: any) => t.task_month),
  ].filter(Boolean))].sort().reverse() as string[]

  const currentMonth = month ?? months[0] ?? ''
  const prevMonth    = months[months.indexOf(currentMonth) + 1] ?? ''

  if (!currentMonth) {
    return { clxData: [], criticals: [], completedCriticals: [], taskProgress: [], completedTasks: [], resolvedTriggers: [], avgClxDiff: null, currentMonth, months }
  }

  // 2) 현재월·전월 데이터만 병렬 조회
  //    - CLX 계산용은 평점만, 리뷰 원문(content)은 Critical/High 행에서만 내려받음
  //    두 달치 리뷰는 현재 ~325행이지만 월 리뷰량이 늘면 상한에 닿는다. 잘리면 CLX 분모가
  //    조용히 줄어 지점 지수가 틀린 값으로 나온다 — 화면에는 아무 표시도 없다.
  const targetMonths = [currentMonth, prevMonth].filter(Boolean)
  const [ratingRows, criticalRows, monthTasksRaw] = await Promise.all([
    fetchAllRows('reviews', 'branch, rating, review_month', q => q.in('review_month', targetMonths)),
    fetchAllRows('reviews', 'id, branch, ota_site, rating, review_month, content_ko, content, severity, status', q => q.eq('review_month', currentMonth).in('severity', ['Critical', 'High'])),
    fetchAllRows('tasks', 'id, branch, status, task_month, title, churn_trigger, assignee, solution', q => q.eq('task_month', currentMonth)),
  ])
  const reviews = ratingRows

  // 지점 목록 (현재월·전월 리뷰 기준 — 리뷰 없는 지점은 어차피 CLX 계산에서 제외됨)
  const branches = [...new Set(reviews.map((r: any) => r.branch).filter(Boolean))] as string[]

  // CLX 계산
  function calcBranchMetrics(m: string) {
    return branches.map(branch => {
      const br = reviews.filter((r: any) => r.review_month === m && r.branch === branch)
      if (!br.length) return null
      const total = br.length
      const lp = Math.round(br.filter((r: any) => r.rating >= 9).length / total * 1000) / 10
      const sp = Math.round(br.filter((r: any) => r.rating >= 7 && r.rating < 9).length / total * 1000) / 10
      const ap = Math.round(br.filter((r: any) => r.rating >= 5 && r.rating < 7).length / total * 1000) / 10
      const cp = Math.round(br.filter((r: any) => r.rating < 5).length / total * 1000) / 10
      return {
        branch, total,
        avg_rating: Math.round(br.reduce((s: number, r: any) => s + r.rating, 0) / total * 100) / 100,
        loyal_pct: lp, satisfied_pct: sp, at_risk_pct: ap, churned_pct: cp,
        clx: calcCLX(lp, sp, ap, cp),
      }
    }).filter(Boolean)
  }

  const latest  = calcBranchMetrics(currentMonth)
  const prev    = calcBranchMetrics(prevMonth)
  const clxData = latest.map((m: any) => {
    const p = prev.find((x: any) => x?.branch === m.branch) as any
    return { ...m, diff: p ? m.clx - p.clx : null }
  }).sort((a: any, b: any) => b.clx - a.clx)

  // Critical/High 미처리 (criticalRows는 이미 현재월 + Critical/High만 조회됨)
  const sevSort = (a: any, b: any) => (a.severity === 'Critical' ? 0 : 1) - (b.severity === 'Critical' ? 0 : 1)
  const criticals = criticalRows.filter((r: any) =>
    !['완료', '문서화완료'].includes(r.status)
  ).sort(sevSort).slice(0, 10)

  // Critical/High 처리완료 (되돌리기용) - 항상 내려보냄
  const completedCriticals = criticalRows.filter((r: any) =>
    ['완료', '문서화완료'].includes(r.status)
  ).sort(sevSort).slice(0, 10)

  // 수행과제 진행률 (monthTasksRaw는 이미 currentMonth만 조회됨)
  const monthTasks = monthTasksRaw

  // 수행과제가 있는 지점만 표시 (리뷰 없어도 수행과제 있으면 표시)
  const taskBranchSet = [...new Set(monthTasks.map((t: any) => t.branch).filter(Boolean))] as string[]
  const taskProgress = taskBranchSet.map(branch => {
    const bt = monthTasks.filter((t: any) => t.branch === branch)
    return { branch, total: bt.length, done: bt.filter((t: any) => t.status === '완료').length }
  }).filter(tp => tp.total > 0)

  // 이번 달 완료 과제 & 해결된 트리거
  const completedTasks = monthTasks.filter((t: any) => t.status === '완료')
  const resolvedTriggers = [...new Set(completedTasks.flatMap((t: any) => t.churn_trigger ?? []))] as string[]

  // CLX 전월 대비 평균 diff
  const avgClxDiff = clxData.length > 0
    ? Math.round(clxData.filter((d: any) => d.diff !== null).reduce((s: number, d: any) => s + (d.diff ?? 0), 0) / Math.max(clxData.filter((d: any) => d.diff !== null).length, 1) * 10) / 10
    : null

  return { clxData, criticals, completedCriticals, taskProgress, completedTasks, resolvedTriggers, avgClxDiff, currentMonth, months }
}, ['dashboard-props'], { revalidate: 60, tags: ['reviews', 'tasks'] })

// ─── 수행과제 (Tasks) ───────────────────────────────────────
// highlightTaskId(URL의 ?task=)는 캐시 키에 들어가지 않도록 데이터 조회만 캐시한다
const getTasksData = unstable_cache(async (month?: string) => {
  // 월 목록은 tasks 전 행을 훑는다 — 과제가 쌓이면 상한에 닿고, 잘리면 오래된 월이
  // 드롭다운에서 사라진다(정렬이 내림차순이라 꼬리부터). 이어 받는다.
  const fetchMonths = () => fetchAllRows('tasks', 'task_month', q => q.order('task_month', { ascending: false }))
  const fetchMonthTasks = (m: string) =>
    fetchAllRows('tasks', '*', q => q.eq('task_month', m).order('priority_score', { ascending: false }))

  let months: string[]
  let currentMonth: string
  let tasks: any[]

  if (month) {
    // month가 URL에 있으면 2개 쿼리 병렬 실행
    const [allTasks, tasksData] = await Promise.all([fetchMonths(), fetchMonthTasks(month)])
    months = [...new Set(allTasks.map((t: any) => t.task_month).filter(Boolean))] as string[]
    currentMonth = month
    tasks = tasksData
  } else {
    const allTasks = await fetchMonths()
    months = [...new Set(allTasks.map((t: any) => t.task_month).filter(Boolean))] as string[]
    currentMonth = months[0] ?? ''
    tasks = await fetchMonthTasks(currentMonth)
  }

  return { tasks, months, currentMonth }
}, ['tasks-data'], { revalidate: 60, tags: ['tasks'] })

export async function getTasksProps(month?: string, task?: string) {
  const data = await getTasksData(month)
  return { ...data, highlightTaskId: task ?? null }
}

// ─── 분석 & 트렌드 (Analytics) ──────────────────────────────
export const getAnalyticsProps = unstable_cache(async () => {
  // 이 페이지는 전 기간 리뷰를 전수로 집계한다 — 이 파일에서 상한에 가장 먼저 닿는 쿼리다
  // (2026-07-23 기준 927행). 잘리면 월별 CLX·카테고리·severity 트렌드가 전부 조용히 틀어진다.
  const [reviews, allTasks] = await Promise.all([
    fetchAllRows('reviews', 'review_month, branch, rating, categories, severity, churn_triggers', q => q.order('review_month', { ascending: false })),
    fetchAllRows('tasks', 'id, churn_trigger, status, task_month', q => q.order('task_month', { ascending: false })),
  ])
  const rv = reviews
  const tasks = allTasks

  const months  = [...new Set(rv.map((r: any) => r.review_month).filter(Boolean))].sort() as string[]
  const branches = [...new Set(rv.map((r: any) => r.branch).filter(Boolean))] as string[]

  // 월별 CLX
  const monthlyRaw = months.flatMap(month =>
    branches.map(branch => {
      const br = rv.filter((r: any) => r.review_month === month && r.branch === branch)
      if (!br.length) return null
      const total = br.length
      const lp = Math.round(br.filter((r: any) => r.rating >= 9).length / total * 1000) / 10
      const sp = Math.round(br.filter((r: any) => r.rating >= 7 && r.rating < 9).length / total * 1000) / 10
      const ap = Math.round(br.filter((r: any) => r.rating >= 5 && r.rating < 7).length / total * 1000) / 10
      const cp = Math.round(br.filter((r: any) => r.rating < 5).length / total * 1000) / 10
      return { review_month: month, branch, total, loyal_pct: lp, satisfied_pct: sp, at_risk_pct: ap, churned_pct: cp, clx: calcCLX(lp, sp, ap, cp) }
    }).filter(Boolean)
  )

  // 카테고리 집계
  const catMap: Record<string, number> = {}
  rv.forEach((r: any) => (r.categories ?? []).forEach((c: string) => { catMap[c] = (catMap[c] ?? 0) + 1 }))
  const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, cnt]) => ({ category, cnt }))

  // 월별 severity 트렌드
  const severityData = months.map(month => {
    const mr = rv.filter((r: any) => r.review_month === month)
    return {
      month,
      Critical: mr.filter((r: any) => r.severity === 'Critical').length,
      High:     mr.filter((r: any) => r.severity === 'High').length,
      Medium:   mr.filter((r: any) => r.severity === 'Medium').length,
      Low:      mr.filter((r: any) => r.severity === 'Low').length,
    }
  })

  // 트리거별 수행과제 해결률
  const triggerTaskMap: Record<string, { total: number; done: number }> = {}
  for (const t of tasks) {
    for (const tr of t.churn_trigger ?? []) {
      if (!triggerTaskMap[tr]) triggerTaskMap[tr] = { total: 0, done: 0 }
      triggerTaskMap[tr].total++
      if (t.status === '완료') triggerTaskMap[tr].done++
    }
  }
  const triggerResolution = Object.entries(triggerTaskMap)
    .map(([trigger, { total, done }]) => ({
      trigger,
      total,
      done,
      rate: total > 0 ? Math.round(done / total * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)

  // 월별 트리거 발생 건수 (리뷰 기준)
  const taskMonths = [...new Set(tasks.map((t: any) => t.task_month).filter(Boolean))].sort() as string[]
  const allMonths = [...new Set([...months, ...taskMonths])].sort() as string[]

  const triggerNames = [...new Set([
    ...rv.flatMap((r: any) => r.churn_triggers ?? []),
    ...tasks.flatMap((t: any) => t.churn_trigger ?? []),
  ])] as string[]

  const triggerMonthlyData = allMonths.map(month => {
    const entry: Record<string, any> = { month }
    for (const tr of triggerNames) {
      entry[`review_${tr}`] = rv.filter((r: any) => r.review_month === month && (r.churn_triggers ?? []).includes(tr)).length
      entry[`done_${tr}`]   = tasks.filter((t: any) => t.task_month === month && t.status === '완료' && (t.churn_trigger ?? []).includes(tr)).length
    }
    return entry
  })

  return { monthlyRaw, catData, severityData, triggerResolution, triggerMonthlyData, triggerNames }
}, ['analytics-props'], { revalidate: 60, tags: ['reviews', 'tasks'] })

// ─── 주간 리포트 (Weekly Report) ────────────────────────────────
// FO Weekly 260721 결정: '그 주에 리뷰를 쓴 사람들'이 채널 누적 점수보다 낮게 줬는가로
// 확인 대상을 가른다. 판정 규칙 자체는 lib/weeklyReport.ts(순수 함수)에 있고,
// 여기서는 조회와 조립만 한다 — DB 없이 판정을 전수 검증할 수 있게 하기 위해서다.
export const getWeeklyReportProps = unstable_cache(async (week?: string): Promise<{
  report: WeeklyReport | null
  week: string
  weeks: string[]
  reviews: Record<number, ChannelReviews>   // propertyId → 그 버킷 리뷰. 미달 채널만
}> => {
  // ota_complaints·ota_voc는 더 이상 읽지 않는다 — 카드가 원인을 쓰지 않기로 했다(2026-07-27).
  // 잘림 사고의 전말은 파일 상단 fetchAllRows 주석 참조.
  const [propsRaw, distRaw, scoresRaw] = await Promise.all([
    fetchAllRows('ota_properties', 'property_id,branch,ota_name,score_max', q => q.eq('active', true), 'property_id'),
    fetchAllRows('ota_score_dist', '*', q => q.order('week_start', { ascending: true })),
    fetchAllRows('ota_scores', 'property_id,overall_score,review_count,recorded_at', q => q.order('recorded_at', { ascending: true })),
  ])

  const dist  = (distRaw ?? []) as DistRow[]
  const weeks = listReportWeeks(dist)   // 최신 우선

  // 요청한 주에 데이터가 없으면 조용히 최신 주로 바꿔치지 않는다 —
  // '지난주는 문제 없었다'로 읽히는 화면이 나온다. 목록에 없는 주는 report=null 이다.
  const target = week ?? weeks[0] ?? ''
  if (!target || !weeks.includes(target)) {
    return { report: null, week: target, weeks, reviews: {} }
  }

  const report = buildWeeklyReport({
    weekStart:  target,
    properties: (propsRaw ?? []) as PropertyRow[],
    dist,
    scores:     (scoresRaw ?? []) as ScoreSnapshotRow[],
  })

  // 리뷰 원문은 미달 채널에만 붙인다. 통과 채널까지 끌어오면 raw_reviews 1.2만 행에서
  // 필요 없는 범위를 매주 읽게 되고, 화면은 그걸 쓰지도 않는다.
  //
  // 🔴 클라이언트 조회로 만들지 말 것 — 노션 임베드는 인증 API를 타지 못한다.
  //    서버가 미리 실어 내려야 임베드에서도 보인다(진행사항 로그에서 겪은 것과 같은 함정).
  const drillTargets = [...report.below, ...report.monthly.filter(r => r.verdict === 'below')]
  const reviews: Record<number, ChannelReviews> = {}

  if (drillTargets.length > 0) {
    const branches = [...new Set(drillTargets.map(r => r.branch))]
    // 주 버킷은 두 달에 걸칠 수 있다 — 시작월과 종료월을 모두 넣는다.
    // 🔴 weekStart는 구간의 '끝'이라 그 월만 쓰면 범위가 한 달로 접힌다. drilldownMonths 주석 참조.
    const months = drilldownMonths(drillTargets)
    // 채널로도 좁힌다 — 미달이 "신설 Trip.com" 하나여도 신설의 전 채널 그 달치를
    // 통째로 끌어오지 않는다. selectBucketReviews가 어차피 지점×채널로 거르므로
    // 판정에는 영향이 없다(raw_reviews.ota_site 표기로 변환해야 한다).
    const sites = [...new Set(
      drillTargets.map(r => OTA_SITE_BY_NAME[r.otaName]).filter((s): s is string => Boolean(s))
    )]

    const [rawRows, transRows] = sites.length === 0 ? [[], []] : await Promise.all([
      fetchAllRows(
        'raw_reviews',
        'id,branch,ota_site,review_month,raw_date,rating,country,room_type,content,reviewer',
        q => q.in('branch', branches).in('review_month', months).in('ota_site', sites),
      ),
      fetchAllRows(
        'reviews',
        'branch,ota_site,content,content_ko',
        q => q.in('branch', branches).in('review_month', months).in('ota_site', sites),
      ),
    ])

    for (const row of drillTargets) {
      reviews[row.propertyId] = buildChannelReviews(
        (rawRows ?? []) as RawReviewRow[],
        (transRows ?? []) as TranslatedRow[],
        {
          propertyId: row.propertyId,
          branch: row.branch,
          otaName: row.otaName,
          weekStart: row.weekStart,
          granularity: row.granularity,
          reviewCount: row.reviewCount,
          // 카드가 판정에 쓴 바로 그 기준선. 드릴다운은 이보다 낮은 리뷰만 보여 준다 —
          // 점수를 밀어올린 10.0짜리 호평이 '미달 주'의 근거 자리에 섞이지 않게 한다.
          baseline: row.baseline,
        },
      )
    }
  }

  return { report, week: target, weeks, reviews }
}, ['weekly-report-props'], { revalidate: 300, tags: ['ota', 'raw-reviews', 'reviews'] })

// 주간 수행과제. 리포트 본문과 캐시를 분리한다 — 과제 하나 저장할 때마다
// ota·raw-reviews·reviews 를 통째로 무효화하면 무거운 리포트가 매번 다시 계산된다.
//
// 🔴 unstable_cache로 감싸지 않는다(과거엔 revalidate:60·tags:['weekly-tasks']였다).
//    PATCH/POST/DELETE 직후 revalidateTag는 Data Cache는 즉시 비우지만, 같은 URL에 대한
//    router.refresh()의 RSC 재요청은 그 무효화를 타지 않고 계속 캐시된 값을 반환했다
//    (하드 네비게이션·다른 URL은 항상 최신값 — Data Cache 자체는 정상). 이 표는 지점당
//    한 주 몇 건뿐인 가벼운 조회라 캐시할 이유가 없다 — 그냥 매번 직접 읽는다.
//    (2026-07-28, SDD 격리 재현으로 확인: revalidatePath로 고치면 되긴 하지만 같은 라우트의
//    다른 unstable_cache — 여기선 getWeeklyReportProps — 까지 통째로 재계산시켜 위 주석이
//    막으려던 문제를 그대로 재현한다.)
//
// 이월 과제를 보여야 하므로 그 주 이하를 전부 끌어온다. 가르는 일은 순수 함수
// selectVisibleTasks(lib/weeklyTasks.ts)가 한다.
export async function getWeeklyTasks(week: string): Promise<WeeklyTaskRow[]> {
  if (!week) return []
  const { data, error } = await supabase
    .from('weekly_tasks')
    .select('*')
    .lte('week_start', week)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[weekly-tasks] 조회 실패:', error.message)
    return []
  }
  return (data ?? []) as WeeklyTaskRow[]
}
