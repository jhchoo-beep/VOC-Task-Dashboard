'use client'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const BRANCHES = ['신설', '동대문', '제주시티', '고성']

const BRANCH_BADGE: Record<string, string> = {
  '신설': 'badge-sinseol', '동대문': 'badge-ddm',
  '제주시티': 'badge-jeju', '고성': 'badge-goseong',
}

const OTA_10PT = ['Agoda', 'Booking', 'Trip.com', 'Expedia', '여기어때']
const OTA_5PT  = ['Airbnb', 'NOL']
const OKR_10   = 9.0
const OKR_5    = 4.5

function scoreColor(score: number, max: number) {
  const okr = max === 10 ? OKR_10 : OKR_5
  if (score >= okr) return 'var(--done)'
  if (score >= okr - 0.5) return 'var(--medium)'
  return 'var(--critical)'
}

function scoreBg(score: number, max: number) {
  const okr = max === 10 ? OKR_10 : OKR_5
  if (score >= okr) return 'rgba(0,229,102,0.08)'
  if (score >= okr - 0.5) return 'rgba(245,200,66,0.08)'
  return 'rgba(255,59,92,0.08)'
}

function TrendIcon({ diff }: { diff: number }) {
  if (diff > 0) return <TrendingUp size={11} color="var(--done)" />
  if (diff < 0) return <TrendingDown size={11} color="var(--critical)" />
  return <Minus size={11} color="var(--text-3)" />
}

// ── 임의 데이터 ─────────────────────────────────────────────
const MOCK_SCORES: Record<string, Record<string, { score: number; prev: number; reviews: number; max: number }>> = {
  '신설': {
    Agoda:    { score: 8.6, prev: 8.5, reviews: 8414, max: 10 },
    Booking:  { score: 8.4, prev: 8.6, reviews: 2103, max: 10 },
    'Trip.com': { score: 8.7, prev: 8.7, reviews: 531,  max: 10 },
    Expedia:  { score: 8.5, prev: 8.3, reviews: 287,  max: 10 },
    '여기어때': { score: 9.1, prev: 9.0, reviews: 412,  max: 10 },
    Airbnb:   { score: 4.6, prev: 4.7, reviews: 98,   max: 5  },
    NOL:      { score: 4.4, prev: 4.4, reviews: 63,   max: 5  },
  },
  '동대문': {
    Agoda:    { score: 8.3, prev: 8.4, reviews: 5621, max: 10 },
    Booking:  { score: 8.1, prev: 8.0, reviews: 1874, max: 10 },
    'Trip.com': { score: 8.5, prev: 8.3, reviews: 398,  max: 10 },
    Expedia:  { score: 8.2, prev: 8.2, reviews: 201,  max: 10 },
    '여기어때': { score: 8.8, prev: 8.9, reviews: 334,  max: 10 },
    Airbnb:   { score: 4.5, prev: 4.4, reviews: 76,   max: 5  },
    NOL:      { score: 4.3, prev: 4.5, reviews: 51,   max: 5  },
  },
  '제주시티': {
    Agoda:    { score: 9.2, prev: 9.0, reviews: 3241, max: 10 },
    Booking:  { score: 9.0, prev: 8.9, reviews: 891,  max: 10 },
    'Trip.com': { score: 9.1, prev: 9.2, reviews: 264,  max: 10 },
    Expedia:  { score: 9.0, prev: 8.8, reviews: 143,  max: 10 },
    '여기어때': { score: 9.4, prev: 9.3, reviews: 287,  max: 10 },
    Airbnb:   { score: 4.8, prev: 4.7, reviews: 134,  max: 5  },
    NOL:      { score: 4.6, prev: 4.6, reviews: 88,   max: 5  },
  },
  '고성': {
    Agoda:    { score: 8.8, prev: 8.9, reviews: 1876, max: 10 },
    Booking:  { score: 0,   prev: 0,   reviews: 0,    max: 10 },
    'Trip.com': { score: 0,   prev: 0,   reviews: 0,    max: 10 },
    Expedia:  { score: 0,   prev: 0,   reviews: 0,    max: 10 },
    '여기어때': { score: 0,   prev: 0,   reviews: 0,    max: 10 },
    Airbnb:   { score: 4.7, prev: 4.6, reviews: 57,   max: 5  },
    NOL:      { score: 4.5, prev: 4.4, reviews: 42,   max: 5  },
  },
}

const MOCK_AGODA_DIST: Record<string, number[]> = {
  '신설':   [0, 0, 1, 2, 4, 8, 15, 22, 31, 17],
  '동대문': [0, 1, 2, 4, 7, 12, 18, 24, 23, 9],
  '제주시티':[0, 0, 0, 1, 2, 5, 9, 18, 34, 31],
  '고성':   [0, 0, 1, 1, 3, 7, 13, 21, 29, 25],
}

const MOCK_COMPLAINTS: Record<string, { room: number; bathroom: number; memo: string }> = {
  '신설':   { room: 1, bathroom: 2, memo: '욕실 바닥 물 샘 1건 / 화장실 냄새 1건 / 하수구 냄새 1건 (반복)' },
  '동대문': { room: 3, bathroom: 1, memo: '도미토리 소음 2건 / 에어컨 불량 1건 / 욕실 청결 1건' },
  '제주시티':{ room: 0, bathroom: 0, memo: '이번 주 불만 없음' },
  '고성':   { room: 1, bathroom: 0, memo: '온수 불량 1건 (보일러 점검 필요)' },
}

const MOCK_VOC: Record<string, { band: string; sentiment: 'good' | 'bad'; keyword: string }[]> = {
  '신설': [
    { band: '10점', sentiment: 'good', keyword: '신설역·공항버스 바로 앞·교통 최고' },
    { band: '10점', sentiment: 'good', keyword: '체크인 간편·비대면 편리' },
    { band: '8~9점', sentiment: 'good', keyword: '가성비 좋음·위치 편리' },
    { band: '8~9점', sentiment: 'bad', keyword: '화장실 냄새 신경 쓰임' },
    { band: '6~7점', sentiment: 'bad', keyword: 'TV 없음·냉장고 없음' },
    { band: '6~7점', sentiment: 'bad', keyword: '방음 부족·층간소음' },
  ],
  '동대문': [
    { band: '10점', sentiment: 'good', keyword: '동대문 쇼핑 접근성 최고' },
    { band: '10점', sentiment: 'good', keyword: '깔끔하고 직원 친절' },
    { band: '8~9점', sentiment: 'good', keyword: '위치 편리·대중교통 좋음' },
    { band: '8~9점', sentiment: 'bad', keyword: '도미토리 소음 문제' },
    { band: '6~7점', sentiment: 'bad', keyword: '야간 QR 불편·안내 부족' },
  ],
  '제주시티': [
    { band: '10점', sentiment: 'good', keyword: '공항 10분·제주시티 중심가' },
    { band: '10점', sentiment: 'good', keyword: '청결·인테리어 예쁨' },
    { band: '8~9점', sentiment: 'good', keyword: '제주 투어 거점으로 딱' },
    { band: '8~9점', sentiment: 'bad', keyword: '주차 안내 불명확' },
  ],
  '고성': [
    { band: '10점', sentiment: 'good', keyword: '자연 뷰·고요한 분위기' },
    { band: '10점', sentiment: 'good', keyword: '가성비 최고·청결' },
    { band: '8~9점', sentiment: 'bad', keyword: '주변 편의시설 부족' },
  ],
}

export default function OtaScoresClient({ recordedAt = '2026-05-18' }: { recordedAt?: string }) {
  const [selectedBranch, setSelectedBranch] = useState('신설')

  const agodaDistData = (MOCK_AGODA_DIST[selectedBranch] ?? []).map((cnt, i) => ({
    score: `${i + 1}점`,
    건수: cnt,
  })).slice(1)

  const complaints = MOCK_COMPLAINTS[selectedBranch]
  const voc = MOCK_VOC[selectedBranch] ?? []

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>OTA 현황</h1>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
          OTA 플랫폼별 실시간 점수 · OKR 달성 현황 &nbsp;
          <span style={{ color: 'var(--text-3)' }}>기준일: {recordedAt}</span>
        </div>
      </div>

      {/* OKR 기준선 */}
      <div className="card" style={{ padding: '10px 18px', marginBottom: 20, background: 'rgba(74,158,255,0.04)', borderColor: 'rgba(74,158,255,0.15)' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--done)' }} />
            <span style={{ color: 'var(--text-3)' }}>OKR 달성</span>
            <span style={{ color: 'var(--done)', fontWeight: 600 }}>10점 만점 ≥ 9.0 · 5점 만점 ≥ 4.5</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--medium)' }} />
            <span style={{ color: 'var(--text-3)' }}>근접</span>
            <span style={{ color: 'var(--medium)', fontWeight: 500 }}>OKR -0.5 이내</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--critical)' }} />
            <span style={{ color: 'var(--text-3)' }}>미달</span>
          </div>
        </div>
      </div>

      {/* 지점별 OTA 점수 테이블 */}
      <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          📊 지점 × OTA 종합 점수
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>OTA</th>
                {BRANCHES.map(b => (
                  <th key={b} style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 600, fontSize: 11 }}>
                    <span className={`badge ${BRANCH_BADGE[b]}`} style={{ fontSize: 10 }}>{b}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...OTA_10PT, ...OTA_5PT].map(ota => {
                const max = OTA_5PT.includes(ota) ? 5 : 10
                return (
                  <tr key={ota} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{ota}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>만점 {max}점 · OKR {max === 10 ? '9.0' : '4.5'}+</div>
                    </td>
                    {BRANCHES.map(b => {
                      const d = MOCK_SCORES[b][ota]
                      const diff = Math.round((d.score - d.prev) * 10) / 10
                      if (!d.score) return (
                        <td key={b} style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                        </td>
                      )
                      return (
                        <td key={b} style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{
                            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                            padding: '6px 12px', borderRadius: 8,
                            background: scoreBg(d.score, max),
                            border: `1px solid ${scoreColor(d.score, max)}30`,
                            minWidth: 64,
                          }}>
                            <span className="font-display" style={{ fontSize: 17, fontWeight: 800, color: scoreColor(d.score, max), lineHeight: 1 }}>
                              {d.score.toFixed(1)}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                              <TrendIcon diff={diff} />
                              <span style={{ fontSize: 10, color: diff > 0 ? 'var(--done)' : diff < 0 ? 'var(--critical)' : 'var(--text-3)' }}>
                                {diff > 0 ? '+' : ''}{diff !== 0 ? diff.toFixed(1) : '±0'}
                              </span>
                            </div>
                            <span style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{d.reviews.toLocaleString()}건</span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agoda 상세 섹션 — 지점 탭 */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>🔍 Agoda 주간 상세 분석</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {BRANCHES.map(b => (
            <button key={b} onClick={() => setSelectedBranch(b)}
              className={selectedBranch === b ? `badge ${BRANCH_BADGE[b]}` : 'badge'}
              style={{
                cursor: 'pointer', border: 'none', fontSize: 11, padding: '4px 10px',
                background: selectedBranch === b ? undefined : 'var(--bg-card)',
                color: selectedBranch === b ? undefined : 'var(--text-3)',
                opacity: selectedBranch === b ? 1 : 0.6,
              }}>
              {b}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* 점수 분포 */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>📈 점수대별 리뷰 분포 (이번 주)</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={agodaDistData} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="score" stroke="var(--text-3)" tick={{ fontSize: 10 }} />
              <YAxis stroke="var(--text-3)" tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: 'var(--text-1)' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="건수" radius={[4, 4, 0, 0]}>
                {agodaDistData.map((entry, i) => (
                  <Cell key={i} fill={
                    i >= 7 ? 'var(--done)' : i >= 5 ? 'var(--accent)' : i >= 3 ? 'var(--medium)' : 'var(--critical)'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 불만 건수 */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>⚠️ 이번 주 불만 접수</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { label: '객실 불만', value: complaints.room, color: 'var(--high)', bg: 'rgba(255,155,59,0.1)' },
              { label: '욕실 불만', value: complaints.bathroom, color: 'var(--critical)', bg: 'rgba(255,59,92,0.1)' },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, padding: '14px 16px', background: item.bg, borderRadius: 10, border: `1px solid ${item.color}30`, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{item.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-hover)', padding: '10px 12px', borderRadius: 8, lineHeight: 1.7 }}>
            {complaints.memo || '메모 없음'}
          </div>
        </div>
      </div>

      {/* VOC 키워드 */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 }}>💬 VOC 키워드 — {selectedBranch} Agoda</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['10점', '8~9점', '6~7점'].map(band => {
            const items = voc.filter(v => v.band === band)
            if (!items.length) return null
            return (
              <div key={band}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6, marginTop: 4 }}>{band}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map((v, i) => (
                    <span key={i} style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11,
                      background: v.sentiment === 'good' ? 'rgba(0,229,102,0.1)' : 'rgba(255,59,92,0.1)',
                      border: `1px solid ${v.sentiment === 'good' ? 'rgba(0,229,102,0.25)' : 'rgba(255,59,92,0.25)'}`,
                      color: v.sentiment === 'good' ? 'var(--done)' : 'var(--critical)',
                    }}>
                      {v.sentiment === 'good' ? '👍' : '👎'} {v.keyword}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
