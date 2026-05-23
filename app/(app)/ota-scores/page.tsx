export const revalidate = 300

import { supabase } from '@/lib/supabase'
import OtaScoresClient from '@/components/OtaScoresClient'

export default async function OtaScoresPage() {
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

  // Agoda score distribution: branch → [{week, scores}[]] all weeks (max 10)
  const agodaDist: Record<string, { week: string; scores: number[] }[]> = {}
  agodaProps.forEach((p: any) => {
    const rows = (dist as any[]).filter(d => d.property_id === p.property_id)
    agodaDist[p.branch] = rows.slice(-10).map((r: any) => ({
      week: r.week_start.substring(5).replace('-', '/'),
      scores: [r.score_2 ?? 0, r.score_3 ?? 0, r.score_4 ?? 0, r.score_5 ?? 0,
               r.score_6 ?? 0, r.score_7 ?? 0, r.score_8 ?? 0, r.score_9 ?? 0, r.score_10 ?? 0],
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

  // VOC: branch → [{band, sentiment, keyword}[]] latest week only
  const agodaVoc: Record<string, { band: string; sentiment: string; keyword: string }[]> = {}
  agodaProps.forEach((p: any) => {
    const rows = (voc as any[]).filter(v => v.property_id === p.property_id)
    if (rows.length > 0) {
      const latestWeek = rows[0].week_start // sorted desc
      agodaVoc[p.branch] = rows
        .filter(v => v.week_start === latestWeek)
        .map(v => ({ band: v.band, sentiment: v.sentiment, keyword: v.keyword }))
    }
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

  return (
    <OtaScoresClient
      recordedAt={latestDate}
      scoreHistory={scoreHistory}
      reviewHistory={reviewHistory}
      dateLabels={dateLabels}
      otaList={otaList}
      agodaDist={agodaDist}
      agodaComplaints={agodaComplaints}
      complaintMemos={complaintMemos}
      agodaVoc={agodaVoc}
      agodaReviewRate={agodaReviewRate}
    />
  )
}
