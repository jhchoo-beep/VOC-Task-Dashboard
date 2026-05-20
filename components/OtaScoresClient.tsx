'use client'
import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Star } from 'lucide-react'

// ─── 상수 ────────────────────────────────────────────────────────────────────
const BRANCHES = ['신설', '동대문', '제주시티', '고성'] as const
type Branch = typeof BRANCHES[number]

const BRANCH_BADGE: Record<string, string> = {
  신설: 'badge-sinseol', 동대문: 'badge-ddm', 제주시티: 'badge-jeju', 고성: 'badge-goseong',
}
const BRANCH_COLOR: Record<string, string> = {
  신설: '#00D4A0', 동대문: '#9B6FFF', 제주시티: '#00C9E0', 고성: '#FF9B3B',
}

const OTA_LIST = [
  { name: 'Agoda',    max: 10, okr: 9.0 },
  { name: 'Booking',  max: 10, okr: 9.0 },
  { name: 'Trip.com', max: 10, okr: 9.0 },
  { name: 'Expedia',  max: 10, okr: 9.0 },
  { name: '여기어때', max: 10, okr: 9.0 },
  { name: 'Airbnb',   max: 5,  okr: 4.5 },
  { name: 'NOL',      max: 5,  okr: 4.5 },
]

const MONTHS = ['2025-12','2026-01','2026-02','2026-03','2026-04','2026-05']
const MONTH_LABEL: Record<string, string> = {
  '2025-12':'12월','2026-01':'1월','2026-02':'2월','2026-03':'3월','2026-04':'4월','2026-05':'5월',
}

// ─── 임의 데이터 ──────────────────────────────────────────────────────────────
// 월별 OTA 점수 히스토리
const SCORE_HISTORY: Record<Branch, Record<string, number[]>> = {
  신설:   { Agoda:[8.4,8.3,8.5,8.6,8.5,8.6], Booking:[8.6,8.5,8.4,8.4,8.6,8.4], 'Trip.com':[8.5,8.6,8.7,8.7,8.7,8.7], Expedia:[8.2,8.3,8.4,8.5,8.3,8.5], 여기어때:[8.9,9.0,9.1,9.1,9.1,9.1], Airbnb:[4.6,4.6,4.7,4.7,4.6,4.6], NOL:[4.3,4.4,4.4,4.4,4.4,4.4] },
  동대문: { Agoda:[8.5,8.3,8.2,8.4,8.3,8.3], Booking:[8.0,8.1,8.1,8.1,8.0,8.1], 'Trip.com':[8.3,8.4,8.5,8.5,8.5,8.5], Expedia:[8.1,8.2,8.2,8.2,8.2,8.2], 여기어때:[8.8,8.9,8.9,8.8,8.9,8.8], Airbnb:[4.4,4.5,4.5,4.5,4.5,4.5], NOL:[4.3,4.3,4.4,4.4,4.3,4.3] },
  제주시티:{ Agoda:[8.8,9.0,9.1,9.0,9.2,9.2], Booking:[8.8,8.9,9.0,9.0,9.0,9.0], 'Trip.com':[8.9,9.0,9.1,9.1,9.1,9.1], Expedia:[8.8,8.9,9.0,8.9,9.0,9.0], 여기어때:[9.2,9.3,9.3,9.4,9.3,9.4], Airbnb:[4.7,4.7,4.8,4.8,4.8,4.8], NOL:[4.5,4.6,4.6,4.6,4.6,4.6] },
  고성:   { Agoda:[8.6,8.8,8.9,8.7,8.9,8.8], Booking:[0,0,0,0,0,0], 'Trip.com':[0,0,0,0,0,0], Expedia:[0,0,0,0,0,0], 여기어때:[0,0,0,0,0,0], Airbnb:[4.5,4.6,4.7,4.7,4.7,4.7], NOL:[4.3,4.4,4.5,4.5,4.5,4.5] },
}

// 월별 누적 리뷰 수
const REVIEW_HISTORY: Record<Branch, Record<string, number[]>> = {
  신설:   { Agoda:[7850,7980,8100,8230,8340,8414], Booking:[1980,2010,2040,2060,2090,2103], 'Trip.com':[490,500,510,518,526,531], Expedia:[260,268,275,280,284,287], 여기어때:[370,380,390,397,406,412], Airbnb:[88,91,93,95,97,98], NOL:[55,58,59,61,62,63] },
  동대문: { Agoda:[5240,5340,5420,5510,5580,5621], Booking:[1750,1780,1810,1840,1860,1874], 'Trip.com':[360,370,378,385,392,398], Expedia:[185,190,194,197,199,201], 여기어때:[305,312,318,324,329,334], Airbnb:[68,70,72,74,75,76], NOL:[44,46,48,49,50,51] },
  제주시티:{ Agoda:[2980,3050,3110,3165,3210,3241], Booking:[820,836,850,864,878,891], 'Trip.com':[238,245,251,256,261,264], Expedia:[128,133,137,140,142,143], 여기어때:[260,266,271,276,282,287], Airbnb:[120,124,127,130,132,134], NOL:[78,81,83,85,87,88] },
  고성:   { Agoda:[1760,1790,1815,1835,1858,1876], Booking:[0,0,0,0,0,0], 'Trip.com':[0,0,0,0,0,0], Expedia:[0,0,0,0,0,0], 여기어때:[0,0,0,0,0,0], Airbnb:[50,52,54,55,56,57], NOL:[36,38,39,40,41,42] },
}

// 리뷰 작성률 (Agoda, 체크아웃 대비 리뷰 작성 %)
const WRITE_RATE_HISTORY: Record<Branch, number[]> = {
  신설:    [22.1, 23.4, 24.0, 23.8, 25.1, 26.3],
  동대문:  [19.8, 20.5, 21.0, 21.3, 21.8, 22.4],
  제주시티:[28.4, 29.0, 30.1, 31.2, 31.8, 32.5],
  고성:    [24.0, 25.3, 26.0, 25.8, 27.1, 27.8],
}

// Agoda 점수 분포 (이번 주, 2~10점 배열)
const AGODA_DIST: Record<Branch, number[]> = {
  신설:    [0,1,2,4,8,15,22,31,17],
  동대문:  [1,2,4,7,12,18,24,23,9],
  제주시티:[0,0,1,2,5,9,18,34,31],
  고성:    [0,1,1,3,7,13,21,29,25],
}

// 불만 주간 추이 (최근 6주)
const COMPLAINT_HISTORY: Record<Branch, {week: string; room: number; bathroom: number}[]> = {
  신설:    [{week:'4/6',room:3,bathroom:2},{week:'4/13',room:2,bathroom:3},{week:'4/20',room:2,bathroom:2},{week:'4/27',room:1,bathroom:2},{week:'5/4',room:1,bathroom:2},{week:'5/11',room:1,bathroom:2}],
  동대문:  [{week:'4/6',room:4,bathroom:1},{week:'4/13',room:3,bathroom:2},{week:'4/20',room:3,bathroom:1},{week:'4/27',room:2,bathroom:1},{week:'5/4',room:3,bathroom:1},{week:'5/11',room:3,bathroom:1}],
  제주시티:[{week:'4/6',room:1,bathroom:0},{week:'4/13',room:0,bathroom:0},{week:'4/20',room:1,bathroom:1},{week:'4/27',room:0,bathroom:0},{week:'5/4',room:0,bathroom:0},{week:'5/11',room:0,bathroom:0}],
  고성:    [{week:'4/6',room:2,bathroom:0},{week:'4/13',room:1,bathroom:0},{week:'4/20',room:1,bathroom:1},{week:'4/27',room:1,bathroom:0},{week:'5/4',room:1,bathroom:0},{week:'5/11',room:1,bathroom:0}],
}

const COMPLAINT_MEMO: Record<Branch, string> = {
  신설:    '욕실 바닥 물 샘 1건 / 화장실 하수구 냄새 1건 (3월부터 반복) / 침구 불쾌 1건',
  동대문:  '도미토리 소음 2건 / 에어컨 불량 1건 / 욕실 청결 1건',
  제주시티:'이번 주 불만 없음',
  고성:    '온수 불량 1건 (보일러 점검 필요)',
}

const VOC_DATA: Record<Branch, {band: string; sentiment: 'good'|'bad'; keyword: string}[]> = {
  신설:    [{band:'10점',sentiment:'good',keyword:'신설역·공항버스 바로 앞'},{band:'10점',sentiment:'good',keyword:'비대면 체크인 편리'},{band:'8~9점',sentiment:'good',keyword:'가성비 좋음·위치 편리'},{band:'8~9점',sentiment:'bad',keyword:'화장실 냄새 신경 쓰임'},{band:'6~7점',sentiment:'bad',keyword:'TV 없음·냉장고 없음'},{band:'6~7점',sentiment:'bad',keyword:'방음 부족·층간소음'}],
  동대문:  [{band:'10점',sentiment:'good',keyword:'동대문 쇼핑 5분 거리'},{band:'10점',sentiment:'good',keyword:'청결·직원 친절'},{band:'8~9점',sentiment:'good',keyword:'대중교통 최고'},{band:'8~9점',sentiment:'bad',keyword:'도미토리 소음'},{band:'6~7점',sentiment:'bad',keyword:'야간 QR 불편'}],
  제주시티:[{band:'10점',sentiment:'good',keyword:'공항 10분·제주 시내 중심'},{band:'10점',sentiment:'good',keyword:'청결·인테리어 예쁨'},{band:'8~9점',sentiment:'good',keyword:'제주 투어 거점'},{band:'8~9점',sentiment:'bad',keyword:'주차 안내 불명확'}],
  고성:    [{band:'10점',sentiment:'good',keyword:'자연 뷰·고요한 분위기'},{band:'10점',sentiment:'good',keyword:'가성비 최고'},{band:'8~9점',sentiment:'bad',keyword:'주변 편의시설 부족'}],
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────
function scoreColor(score: number, okr: number) {
  if (score >= okr)        return 'var(--done)'
  if (score >= okr - 0.5) return 'var(--medium)'
  return 'var(--critical)'
}
function scoreBg(score: number, okr: number) {
  if (score >= okr)        return 'rgba(0,229,102,0.08)'
  if (score >= okr - 0.5) return 'rgba(245,200,66,0.08)'
  return 'rgba(255,59,92,0.08)'
}
function TrendBadge({ cur, prev }: { cur: number; prev: number }) {
  const d = Math.round((cur - prev) * 10) / 10
  if (d === 0) return <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2 }}><Minus size={9} /> 유지</span>
  return (
    <span style={{ fontSize: 10, color: d > 0 ? 'var(--done)' : 'var(--critical)', display: 'flex', alignItems: 'center', gap: 2 }}>
      {d > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {d > 0 ? '+' : ''}{d.toFixed(1)}
    </span>
  )
}

const INNER_TABS = ['종합 현황', 'OKR 트래커', 'OTA 추이', 'Agoda 상세'] as const
type InnerTab = typeof INNER_TABS[number]

// ════════════════════════════════════════════════════════════════════════════
// 탭 1 — 종합 현황
// ════════════════════════════════════════════════════════════════════════════
function TabOverview() {
  return (
    <div>
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          📊 지점 × OTA 현재 점수 (기준일: 2026-05-18)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 18px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>OTA / 만점</th>
                {BRANCHES.map(b => (
                  <th key={b} style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 600, fontSize: 11 }}>
                    <span className={`badge ${BRANCH_BADGE[b]}`} style={{ fontSize: 10 }}>{b}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OTA_LIST.map(({ name, max, okr }) => (
                <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>/{max}점 · OKR {okr}+</div>
                  </td>
                  {BRANCHES.map(b => {
                    const hist = SCORE_HISTORY[b][name]
                    const cur  = hist[hist.length - 1]
                    const prev = hist[hist.length - 2]
                    const revHist = REVIEW_HISTORY[b][name]
                    const reviews = revHist[revHist.length - 1]
                    if (!cur) return <td key={b} style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>—</td>
                    return (
                      <td key={b} style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                          padding: '7px 14px', borderRadius: 8,
                          background: scoreBg(cur, okr), border: `1px solid ${scoreColor(cur, okr)}28`, minWidth: 68,
                        }}>
                          <span className="font-display" style={{ fontSize: 18, fontWeight: 800, color: scoreColor(cur, okr), lineHeight: 1 }}>
                            {cur.toFixed(1)}
                          </span>
                          <TrendBadge cur={cur} prev={prev} />
                          <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{reviews.toLocaleString()}건</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 지점별 OKR 달성 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {BRANCHES.map(b => {
          const achieved = OTA_LIST.filter(({ name, okr }) => {
            const hist = SCORE_HISTORY[b][name]
            const cur = hist[hist.length - 1]
            return cur > 0 && cur >= okr
          }).length
          const total = OTA_LIST.filter(({ name }) => SCORE_HISTORY[b][name][SCORE_HISTORY[b][name].length - 1] > 0).length
          const pct = total > 0 ? Math.round(achieved / total * 100) : 0
          return (
            <div key={b} className="card" style={{ padding: '16px 18px' }}>
              <span className={`badge ${BRANCH_BADGE[b]}`} style={{ fontSize: 10, marginBottom: 10, display: 'inline-block' }}>{b}</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: pct === 100 ? 'var(--done)' : pct >= 60 ? 'var(--medium)' : 'var(--critical)' }}>
                {achieved}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-3)' }}>/{total}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>OKR 달성 OTA</div>
              <div className="progress">
                <div className="progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--done)' : pct >= 60 ? 'var(--medium)' : 'var(--critical)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 탭 2 — OKR 트래커
// ════════════════════════════════════════════════════════════════════════════
function TabOKR() {
  const [selBranch, setSelBranch] = useState<Branch>('신설')
  return (
    <div>
      {/* 전체 OTA × 지점 OKR 매트릭스 */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 18 }}>🎯 전체 OKR 달성 현황</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {OTA_LIST.map(({ name, okr, max }) => (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{name} <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>목표 {okr}/{max}</span></span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {BRANCHES.map(b => {
                    const hist = SCORE_HISTORY[b][name]
                    const cur = hist[hist.length - 1]
                    if (!cur) return null
                    const met = cur >= okr
                    return (
                      <span key={b} style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: met ? 'rgba(0,229,102,0.12)' : 'rgba(255,59,92,0.1)',
                        color: met ? 'var(--done)' : 'var(--critical)',
                        border: `1px solid ${met ? 'rgba(0,229,102,0.25)' : 'rgba(255,59,92,0.2)'}`,
                      }}>
                        {b} {cur.toFixed(1)}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {BRANCHES.map(b => {
                  const hist = SCORE_HISTORY[b][name]
                  const cur = hist[hist.length - 1]
                  if (!cur) return <div key={b} style={{ opacity: 0.2, fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28 }}>미운영</div>
                  const pct = Math.min((cur / okr) * 100, 100)
                  const gap = Math.round((cur - okr) * 10) / 10
                  return (
                    <div key={b}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10 }}>
                        <span style={{ color: 'var(--text-3)' }}>{b}</span>
                        <span style={{ color: gap >= 0 ? 'var(--done)' : 'var(--critical)', fontWeight: 600 }}>
                          {gap >= 0 ? '✓' : `${gap.toFixed(1)}`}
                        </span>
                      </div>
                      <div className="progress" style={{ height: 6 }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: scoreColor(cur, okr), borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 지점별 상세 OKR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {BRANCHES.map(b => (
          <button key={b} onClick={() => setSelBranch(b)}
            className={selBranch === b ? `badge ${BRANCH_BADGE[b]}` : 'badge'}
            style={{ cursor: 'pointer', border: 'none', fontSize: 11, padding: '4px 10px', opacity: selBranch === b ? 1 : 0.5 }}>
            {b}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {OTA_LIST.map(({ name, okr, max }) => {
          const hist = SCORE_HISTORY[selBranch][name]
          const cur  = hist[hist.length - 1]
          const prev = hist[hist.length - 2]
          if (!cur) return (
            <div key={name} className="card" style={{ padding: '14px 16px', opacity: 0.4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>미운영</div>
            </div>
          )
          const met = cur >= okr
          const gap = Math.round((cur - okr) * 10) / 10
          const pct = Math.min(Math.round(cur / okr * 100), 100)
          return (
            <div key={name} className="card" style={{ padding: '14px 16px', borderColor: met ? 'rgba(0,229,102,0.25)' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>목표 {okr}/{max}</div>
                </div>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10,
                  background: met ? 'rgba(0,229,102,0.12)' : 'rgba(255,59,92,0.1)',
                  color: met ? 'var(--done)' : 'var(--critical)' }}>
                  {met ? '✓ 달성' : `${gap.toFixed(1)}`}
                </span>
              </div>
              <div className="font-display" style={{ fontSize: 26, fontWeight: 800, color: scoreColor(cur, okr), lineHeight: 1, marginBottom: 4 }}>
                {cur.toFixed(1)}
              </div>
              <TrendBadge cur={cur} prev={prev} />
              <div className="progress" style={{ marginTop: 10 }}>
                <div className="progress-fill" style={{ width: `${pct}%`, background: scoreColor(cur, okr), borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{pct}% of OKR</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 탭 3 — OTA 추이
// ════════════════════════════════════════════════════════════════════════════
function TabTrend() {
  const [selOTA, setSelOTA]    = useState('Agoda')
  const [viewMode, setViewMode] = useState<'score'|'reviews'>('score')

  const scoreChartData = MONTHS.map((m, i) => {
    const entry: any = { month: MONTH_LABEL[m] }
    BRANCHES.forEach(b => {
      const hist = SCORE_HISTORY[b][selOTA]
      if (hist[i] > 0) entry[b] = hist[i]
    })
    return entry
  })

  const reviewChartData = MONTHS.map((m, i) => {
    const entry: any = { month: MONTH_LABEL[m] }
    BRANCHES.forEach(b => {
      const hist = REVIEW_HISTORY[b][selOTA]
      if (hist[i] > 0) entry[b] = hist[i]
    })
    return entry
  })

  const { okr } = OTA_LIST.find(o => o.name === selOTA)!

  return (
    <div>
      {/* 컨트롤 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {OTA_LIST.map(o => (
            <button key={o.name} onClick={() => setSelOTA(o.name)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                background: selOTA === o.name ? 'var(--accent)' : 'var(--bg-card)',
                color: selOTA === o.name ? '#fff' : 'var(--text-2)',
                fontWeight: selOTA === o.name ? 600 : 400,
              }}>
              {o.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['score', 'reviews'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)}
              style={{
                padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                background: viewMode === v ? 'var(--bg-card)' : 'transparent',
                color: viewMode === v ? 'var(--text-1)' : 'var(--text-3)',
                fontWeight: viewMode === v ? 600 : 400,
              }}>
              {v === 'score' ? '📈 평점 추이' : '📊 리뷰 수 추이'}
            </button>
          ))}
        </div>
      </div>

      {/* 평점 추이 */}
      {viewMode === 'score' && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
            {selOTA} 지점별 평점 추이 (최근 6개월)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
            점선: OKR 목표 {okr}점
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={scoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--text-1)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => <span style={{ color: BRANCH_COLOR[v] }}>{v}</span>} />
              <ReferenceLine y={okr} stroke="rgba(255,255,255,0.2)" strokeDasharray="6 3" label={{ value: `OKR ${okr}`, fill: 'var(--text-3)', fontSize: 10, position: 'right' }} />
              {BRANCHES.map(b => (
                <Line key={b} type="monotone" dataKey={b}
                  stroke={BRANCH_COLOR[b]} strokeWidth={2}
                  dot={{ fill: BRANCH_COLOR[b], r: 4 }} activeDot={{ r: 6 }}
                  connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 리뷰 수 추이 */}
      {viewMode === 'reviews' && (
        <div className="card" style={{ padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 20 }}>
            {selOTA} 누적 리뷰 수 추이 (최근 6개월)
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={reviewChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--text-1)' }} formatter={(v: any) => [`${v.toLocaleString()}건`, '']} />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={v => <span style={{ color: BRANCH_COLOR[v] }}>{v}</span>} />
              {BRANCHES.map(b => (
                <Line key={b} type="monotone" dataKey={b}
                  stroke={BRANCH_COLOR[b]} strokeWidth={2}
                  dot={{ fill: BRANCH_COLOR[b], r: 4 }} activeDot={{ r: 6 }}
                  connectNulls={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 전 OTA 스냅샷 미니카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {OTA_LIST.map(({ name, okr }) => (
          <div key={name} className="card" style={{ padding: '12px 14px', cursor: 'pointer', borderColor: name === selOTA ? 'var(--accent)' : undefined }}
            onClick={() => setSelOTA(name)}>
            <div style={{ fontSize: 11, fontWeight: 600, color: name === selOTA ? 'var(--accent)' : 'var(--text-2)', marginBottom: 8 }}>{name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {BRANCHES.map(b => {
                const hist = SCORE_HISTORY[b][name]
                const cur = hist[hist.length - 1]
                if (!cur) return null
                return (
                  <div key={b} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{b}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(cur, okr) }}>{cur.toFixed(1)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 탭 4 — Agoda 상세
// ════════════════════════════════════════════════════════════════════════════
type AgodaSubTab = 'OKR' | '리뷰 작성률' | '점수 분포' | '불만 분석' | 'VOC'

function TabAgoda() {
  const [branch, setBranch] = useState<Branch>('신설')
  const [sub, setSub]       = useState<AgodaSubTab>('OKR')

  const agodaOTA = OTA_LIST.find(o => o.name === 'Agoda')!
  const scoreHist = SCORE_HISTORY[branch]['Agoda']
  const curScore  = scoreHist[scoreHist.length - 1]
  const prevScore = scoreHist[scoreHist.length - 2]
  const writeRate = WRITE_RATE_HISTORY[branch]

  const scoreChartData = MONTHS.map((m, i) => ({ month: MONTH_LABEL[m], 점수: scoreHist[i] }))
  const writeRateData  = MONTHS.map((m, i) => ({ month: MONTH_LABEL[m], 작성률: writeRate[i] }))
  const distData = AGODA_DIST[branch].map((cnt, i) => ({ score: `${i + 2}점`, 건수: cnt }))
  const complaints = COMPLAINT_HISTORY[branch]
  const voc = VOC_DATA[branch]

  return (
    <div>
      {/* 지점 선택 + 서브탭 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {BRANCHES.map(b => (
            <button key={b} onClick={() => setBranch(b)}
              className={branch === b ? `badge ${BRANCH_BADGE[b]}` : 'badge'}
              style={{ cursor: 'pointer', border: 'none', fontSize: 11, padding: '4px 10px', opacity: branch === b ? 1 : 0.5 }}>
              {b}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['OKR','리뷰 작성률','점수 분포','불만 분석','VOC'] as AgodaSubTab[]).map(t => (
            <button key={t} onClick={() => setSub(t)}
              style={{
                padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
                background: sub === t ? 'var(--accent)' : 'var(--bg-card)',
                color: sub === t ? '#fff' : 'var(--text-2)',
                fontWeight: sub === t ? 600 : 400,
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 상단 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: '현재 점수', value: `${curScore.toFixed(1)}`, sub: `목표 ${agodaOTA.okr}+`, color: scoreColor(curScore, agodaOTA.okr) },
          { label: '전주 대비', value: `${(curScore - prevScore) >= 0 ? '+' : ''}${(curScore - prevScore).toFixed(1)}`, sub: `이전 ${prevScore.toFixed(1)}`, color: curScore >= prevScore ? 'var(--done)' : 'var(--critical)' },
          { label: '리뷰 작성률', value: `${writeRate[writeRate.length - 1]}%`, sub: '체크아웃 대비', color: 'var(--accent)' },
          { label: '누적 리뷰', value: REVIEW_HISTORY[branch]['Agoda'][MONTHS.length - 1].toLocaleString(), sub: '건', color: 'var(--text-2)' },
        ].map(item => (
          <div key={item.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{item.label}</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* 서브탭 콘텐츠 */}

      {/* OKR */}
      {sub === 'OKR' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 20 }}>Agoda 평점 추이 (최근 6개월) — {branch}</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={scoreChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <ReferenceLine y={agodaOTA.okr} stroke="rgba(0,229,102,0.4)" strokeDasharray="6 3"
                label={{ value: `OKR ${agodaOTA.okr}`, fill: 'var(--done)', fontSize: 10, position: 'right' }} />
              <Line type="monotone" dataKey="점수" stroke={BRANCH_COLOR[branch]} strokeWidth={2.5}
                dot={{ fill: BRANCH_COLOR[branch], r: 5 }} activeDot={{ r: 7 }} />
            </LineChart>
          </ResponsiveContainer>
          {/* 달성 현황 */}
          <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {scoreHist.map((s, i) => (
              <div key={i} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12, textAlign: 'center',
                background: s >= agodaOTA.okr ? 'rgba(0,229,102,0.1)' : 'rgba(255,59,92,0.08)',
                border: `1px solid ${s >= agodaOTA.okr ? 'rgba(0,229,102,0.25)' : 'rgba(255,59,92,0.2)'}`,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{MONTH_LABEL[MONTHS[i]]}</div>
                <div style={{ fontWeight: 700, color: s >= agodaOTA.okr ? 'var(--done)' : 'var(--critical)' }}>{s.toFixed(1)}</div>
                <div style={{ fontSize: 9, color: s >= agodaOTA.okr ? 'var(--done)' : 'var(--critical)' }}>{s >= agodaOTA.okr ? '✓' : `${(s - agodaOTA.okr).toFixed(1)}`}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 리뷰 작성률 */}
      {sub === '리뷰 작성률' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Agoda 리뷰 작성률 추이 — {branch}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>체크아웃 고객 중 Agoda 리뷰를 작성한 비율</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={writeRateData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 40]} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, '리뷰 작성률']} />
              <Bar dataKey="작성률" radius={[4,4,0,0]}>
                {writeRateData.map((_, i) => <Cell key={i} fill={writeRate[i] >= 25 ? 'var(--done)' : 'var(--accent)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(99,179,255,0.06)', borderRadius: 8, border: '1px solid rgba(99,179,255,0.15)', fontSize: 12, color: 'var(--text-2)' }}>
            <strong style={{ color: 'var(--accent)' }}>목표:</strong> 작성률 25% 이상 유지 · 현재 {writeRate[writeRate.length-1]}% {writeRate[writeRate.length-1] >= 25 ? '✓ 달성' : `(${(25 - writeRate[writeRate.length-1]).toFixed(1)}%p 부족)`}
          </div>
        </div>
      )}

      {/* 점수 분포 */}
      {sub === '점수 분포' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Agoda 점수대별 리뷰 분포 (이번 주) — {branch}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>각 점수대에 리뷰가 몇 건씩 들어왔는지 확인</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={distData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="score" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}건`, '리뷰 수']} />
              <Bar dataKey="건수" radius={[4,4,0,0]}>
                {distData.map((_, i) => (
                  <Cell key={i} fill={i >= 7 ? 'var(--done)' : i >= 5 ? 'var(--accent)' : i >= 3 ? 'var(--medium)' : 'var(--critical)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['9~10점','var(--done)'], ['7~8점','var(--accent)'], ['5~6점','var(--medium)'], ['2~4점','var(--critical)']].map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={{ color: 'var(--text-3)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 불만 분석 */}
      {sub === '불만 분석' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>⚠️ 주간 불만 추이 (최근 6주) — {branch}</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={complaints} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" stroke="var(--text-3)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--text-3)" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="room" name="객실 불만" stackId="a" fill="var(--high)" radius={[0,0,0,0]} />
                  <Bar dataKey="bathroom" name="욕실 불만" stackId="a" fill="var(--critical)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>이번 주 불만 현황</div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                {[
                  { label: '객실 불만', value: complaints[complaints.length-1].room,    color: 'var(--high)',     bg: 'rgba(255,155,59,0.1)' },
                  { label: '욕실 불만', value: complaints[complaints.length-1].bathroom, color: 'var(--critical)', bg: 'rgba(255,59,92,0.1)' },
                ].map(item => (
                  <div key={item.label} style={{ flex: 1, padding: '12px 14px', background: item.bg, borderRadius: 10, textAlign: 'center', border: `1px solid ${item.color}30` }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.7 }}>
                {COMPLAINT_MEMO[branch]}
              </div>
            </div>
          </div>
          {/* 누적 불만 요약 */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>최근 6주 누적 요약</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: '총 객실 불만', value: complaints.reduce((s,c) => s+c.room, 0), color: 'var(--high)' },
                { label: '총 욕실 불만', value: complaints.reduce((s,c) => s+c.bathroom, 0), color: 'var(--critical)' },
                { label: '주간 평균', value: ((complaints.reduce((s,c) => s+c.room+c.bathroom, 0)) / 6).toFixed(1), color: 'var(--medium)', unit: '건/주' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{item.label}</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}<span style={{ fontSize: 12, fontWeight: 400 }}>{(item as any).unit ?? '건'}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VOC */}
      {sub === 'VOC' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>💬 VOC 키워드 — {branch} Agoda</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>점수대별 긍정/부정 키워드 분석 (이번 주)</div>
          {['10점','8~9점','6~7점'].map(band => {
            const items = voc.filter(v => v.band === band)
            if (!items.length) return null
            const good = items.filter(v => v.sentiment === 'good')
            const bad  = items.filter(v => v.sentiment === 'bad')
            return (
              <div key={band} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {band}
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: good.length && bad.length ? '1fr 1fr' : '1fr', gap: 12 }}>
                  {good.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--done)', fontWeight: 600, marginBottom: 6 }}>👍 좋아요</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {good.map((v, i) => (
                          <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,229,102,0.08)', border: '1px solid rgba(0,229,102,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' }}>
                            {v.keyword}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {bad.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--critical)', fontWeight: 600, marginBottom: 6 }}>👎 나빠요</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {bad.map((v, i) => (
                          <div key={i} style={{ padding: '6px 10px', background: 'rgba(255,59,92,0.08)', border: '1px solid rgba(255,59,92,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-1)' }}>
                            {v.keyword}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ════════════════════════════════════════════════════════════════════════════
export default function OtaScoresClient({ recordedAt = '2026-05-18' }: { recordedAt?: string }) {
  const [tab, setTab] = useState<InnerTab>('종합 현황')

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Star size={20} color="var(--medium)" />
          <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800 }}>OTA 현황</h1>
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
          OTA 플랫폼 점수 · OKR 달성 추이 · Agoda 심층 분석
          <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>기준일: {recordedAt}</span>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {INNER_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--text-1)' : 'var(--text-3)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s',
          }}>
            {t === '종합 현황' && '📊 '}
            {t === 'OKR 트래커' && '🎯 '}
            {t === 'OTA 추이' && '📈 '}
            {t === 'Agoda 상세' && '🔍 '}
            {t}
          </button>
        ))}
      </div>

      {/* OKR 기준 안내 */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: '8px 16px', background: 'rgba(74,158,255,0.04)', border: '1px solid rgba(74,158,255,0.15)', borderRadius: 8, fontSize: 11, flexWrap: 'wrap' }}>
        {[['var(--done)','OKR 달성','10점 ≥ 9.0 · 5점 ≥ 4.5'],['var(--medium)','근접','OKR -0.5 이내'],['var(--critical)','미달','OKR -0.5 초과']].map(([color, label, desc]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ color: color as string, fontWeight: 600 }}>{label}</span>
            <span style={{ color: 'var(--text-3)' }}>{desc}</span>
          </div>
        ))}
      </div>

      {tab === '종합 현황' && <TabOverview />}
      {tab === 'OKR 트래커' && <TabOKR />}
      {tab === 'OTA 추이'   && <TabTrend />}
      {tab === 'Agoda 상세' && <TabAgoda />}
    </div>
  )
}
