import { unstable_cache } from 'next/cache'
import { supabase, calcCLX } from '@/lib/supabase'

// 모든 페이지가 auth()로 인해 동적 렌더링되므로 revalidate만으로는 캐시가 작동하지 않는다.
// unstable_cache로 데이터 레이어를 직접 캐시하고, 쓰기 API에서 revalidateTag로 즉시 무효화한다.
// 태그: reviews / tasks / raw-reviews / ota (테이블 단위)

// ─── 점수 현황 (OTA Scores) ─────────────────────────────────
export const getOtaScoresProps = unstable_cache(async () => {
  const [
    { data: scoresRaw },
    { data: propsRaw },
    { data: distRaw },
    { data: complaintsRaw },
    { data: vocRaw },
    { data: reviewRateRaw },
  ] = await Promise.all([
    supabase.from('ota_scores').select('property_id,overall_score,review_count,recorded_at').order('recorded_at', { ascending: true }),
    supabase.from('ota_properties').select('property_id,branch,ota_name,score_max,okr_target').eq('active', true),
    supabase.from('ota_agoda_score_dist').select('*').order('week_start', { ascending: true }),
    supabase.from('ota_agoda_complaints').select('*').order('week_start', { ascending: true }),
    supabase.from('ota_agoda_voc').select('*').order('week_start', { ascending: false }),
    supabase.from('ota_agoda_review_rate').select('property_id,week_start,review_count,checkout_count,rate_pct').order('week_start', { ascending: true }),
  ])

  const scores     = scoresRaw     ?? []
  const properties = propsRaw      ?? []
  const dist       = distRaw       ?? []
  const complaints = complaintsRaw ?? []
  const voc        = vocRaw        ?? []

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

  const agodaProps = properties.filter((p: any) => p.ota_name === 'Agoda')

  // Agoda score distribution: branch → [{week, scores, avgScore}[]] all weeks (max 10)
  const agodaDist: Record<string, { week: string; scores: number[]; avgScore: number }[]> = {}
  agodaProps.forEach((p: any) => {
    const rows = (dist as any[]).filter(d => d.property_id === p.property_id)
    agodaDist[p.branch] = rows.slice(-10).map((r: any) => ({
      week: r.week_start.substring(5).replace('-', '/'),
      scores: [r.score_2 ?? 0, r.score_3 ?? 0, r.score_4 ?? 0, r.score_5 ?? 0,
               r.score_6 ?? 0, r.score_7 ?? 0, r.score_8 ?? 0, r.score_9 ?? 0, r.score_10 ?? 0],
      avgScore: Number(r.weekly_avg_score) || 0,
    }))
  })

  // Complaints: branch → [{week, room, bathroom}[]] (recent 8 weeks)
  const agodaComplaints: Record<string, { week: string; room: number; bathroom: number }[]> = {}
  const complaintMemos: Record<string, string> = {}
  agodaProps.forEach((p: any) => {
    const rows = (complaints as any[]).filter(c => c.property_id === p.property_id)
    agodaComplaints[p.branch] = rows.slice(-8).map(c => ({
      week: c.week_start.substring(5).replace('-', '/'),
      room: c.room_complaints,
      bathroom: c.bathroom_complaints,
    }))
    const latest = rows[rows.length - 1]
    complaintMemos[p.branch] = latest?.memo ?? ''
  })

  // VOC: branch → [{week_start, band, sentiment, keyword}[]] all weeks sorted desc
  const agodaVoc: Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]> = {}
  agodaProps.forEach((p: any) => {
    const rows = (voc as any[]).filter(v => v.property_id === p.property_id)
    agodaVoc[p.branch] = rows.map(v => ({
      week_start: v.week_start,
      band: v.band,
      sentiment: v.sentiment,
      keyword: v.keyword,
    }))
  })

  // Review rate: branch → [{week, reviewCount, checkoutCount, ratePct}[]]
  const reviewRate = reviewRateRaw ?? []
  const agodaReviewRate: Record<string, { week: string; reviewCount: number; checkoutCount: number; ratePct: number }[]> = {}
  agodaProps.forEach((p: any) => {
    const rows = (reviewRate as any[]).filter(r => r.property_id === p.property_id)
    agodaReviewRate[p.branch] = rows.map(r => ({
      week: r.week_start.substring(5).replace('-', '/'),
      reviewCount: r.review_count ?? 0,
      checkoutCount: r.checkout_count ?? 0,
      ratePct: r.rate_pct ?? 0,
    }))
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
    otaList,
    agodaDist,
    agodaComplaints,
    complaintMemos,
    agodaVoc,
    agodaReviewRate,
    branchOtaToId,
  }
}, ['ota-scores-props'], { revalidate: 300, tags: ['ota'] })

// ─── 대시보드 (Dashboard) ───────────────────────────────────
export const getDashboardProps = unstable_cache(async (month?: string) => {
  // 1) 월 목록만 컬럼 한정 조회 (리뷰 원문 등 무거운 컬럼 제외, 1000행 기본 캡 회피)
  const [{ data: reviewMonthsRaw }, { data: taskMonthsRaw }] = await Promise.all([
    supabase.from('reviews').select('review_month').order('review_month', { ascending: false }).range(0, 9999),
    supabase.from('tasks').select('task_month').order('task_month', { ascending: false }).range(0, 9999),
  ])
  const months = [...new Set([
    ...(reviewMonthsRaw ?? []).map((r: any) => r.review_month),
    ...(taskMonthsRaw ?? []).map((t: any) => t.task_month),
  ].filter(Boolean))].sort().reverse() as string[]

  const currentMonth = month ?? months[0] ?? ''
  const prevMonth    = months[months.indexOf(currentMonth) + 1] ?? ''

  if (!currentMonth) {
    return { clxData: [], criticals: [], completedCriticals: [], taskProgress: [], completedTasks: [], resolvedTriggers: [], avgClxDiff: null, currentMonth, months }
  }

  // 2) 현재월·전월 데이터만 병렬 조회
  //    - CLX 계산용은 평점만, 리뷰 원문(content)은 Critical/High 행에서만 내려받음
  const targetMonths = [currentMonth, prevMonth].filter(Boolean)
  const [{ data: ratingRows }, { data: criticalRows }, { data: monthTasksRaw }] = await Promise.all([
    supabase.from('reviews').select('branch, rating, review_month').in('review_month', targetMonths).range(0, 9999),
    supabase.from('reviews').select('id, branch, ota_site, rating, review_month, content_ko, content, severity, status').eq('review_month', currentMonth).in('severity', ['Critical', 'High']),
    supabase.from('tasks').select('id, branch, status, task_month, title, churn_trigger, assignee, solution').eq('task_month', currentMonth),
  ])
  const reviews = ratingRows ?? []

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
  const criticals = (criticalRows ?? []).filter((r: any) =>
    !['완료', '문서화완료'].includes(r.status)
  ).sort(sevSort).slice(0, 10)

  // Critical/High 처리완료 (되돌리기용) - 항상 내려보냄
  const completedCriticals = (criticalRows ?? []).filter((r: any) =>
    ['완료', '문서화완료'].includes(r.status)
  ).sort(sevSort).slice(0, 10)

  // 수행과제 진행률 (monthTasksRaw는 이미 currentMonth만 조회됨)
  const monthTasks = monthTasksRaw ?? []

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
  const monthsQuery = supabase.from('tasks').select('task_month').order('task_month', { ascending: false }).range(0, 9999)

  let months: string[]
  let currentMonth: string
  let tasks: any[]

  if (month) {
    // month가 URL에 있으면 2개 쿼리 병렬 실행
    const [{ data: allTasks }, { data: tasksData }] = await Promise.all([
      monthsQuery,
      supabase.from('tasks').select('*').eq('task_month', month).order('priority_score', { ascending: false }),
    ])
    months = [...new Set((allTasks ?? []).map((t: any) => t.task_month).filter(Boolean))] as string[]
    currentMonth = month
    tasks = tasksData ?? []
  } else {
    const { data: allTasks = [] } = await monthsQuery
    months = [...new Set((allTasks ?? []).map((t: any) => t.task_month).filter(Boolean))] as string[]
    currentMonth = months[0] ?? ''
    const { data: tasksData = [] } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_month', currentMonth)
      .order('priority_score', { ascending: false })
    tasks = tasksData ?? []
  }

  return { tasks, months, currentMonth }
}, ['tasks-data'], { revalidate: 60, tags: ['tasks'] })

export async function getTasksProps(month?: string, task?: string) {
  const data = await getTasksData(month)
  return { ...data, highlightTaskId: task ?? null }
}

// ─── 분석 & 트렌드 (Analytics) ──────────────────────────────
export const getAnalyticsProps = unstable_cache(async () => {
  const [{ data: reviews = [] }, { data: allTasks = [] }] = await Promise.all([
    supabase.from('reviews').select('review_month, branch, rating, categories, severity, churn_triggers').order('review_month', { ascending: false }).range(0, 9999),
    supabase.from('tasks').select('id, churn_trigger, status, task_month').order('task_month', { ascending: false }).range(0, 9999),
  ])
  const rv = reviews ?? []
  const tasks = allTasks ?? []

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
