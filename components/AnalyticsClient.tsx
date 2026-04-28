'use client'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#FF4D4D',
  High:     '#FF9B3B',
  Medium:   '#F5C842',
  Low:      '#00D4A0',
}

const BRANCH_COLORS: Record<string, string> = {
  '제주시티':'#00C9E0','제주':'#00C9E0',
  '동대문':'#9B6FFF','신설':'#00D4A0','고성':'#FF9B3B',
}
const RANGE_OPTIONS = [
  { label: '최근 6개월',  value: 6 },
  { label: '최근 12개월', value: 12 },
  { label: '최근 24개월', value: 24 },
  { label: '전체',        value: 0 },
]

export default function AnalyticsClient({ monthlyRaw, catData, severityData }: any) {
  const allMonths = [...new Set(monthlyRaw.map((d: any) => d.review_month))].sort() as string[]
  const branches  = [...new Set(monthlyRaw.map((d: any) => d.branch))] as string[]
  const [range, setRange] = useState(12)

  const months = range === 0 ? allMonths : allMonths.slice(-range)
  const severityFiltered = (severityData ?? []).filter((d: any) => months.includes(d.month))

  const clxChart = months.map(month => {
    const entry: any = { month }
    branches.forEach(branch => {
      const row = monthlyRaw.find((d: any) => d.review_month === month && d.branch === branch)
      if (row) entry[branch] = Math.round(row.clx)
    })
    return entry
  })

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
        <div style={{ color: 'var(--text-2)', marginBottom: 8 }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
            <span style={{ color: 'var(--text-2)' }}>{p.name}:</span>
            <span style={{ color: p.color, fontWeight: 600 }}>{p.value >= 0 ? '+' : ''}{p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>분석 & 트렌드</h1>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>월별 CLX 추이 · 카테고리 분포</div>
      </div>

      {/* CLX 추이 */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>📈 지점별 CLX 월별 추이</div>
          <select
            value={range}
            onChange={e => setRange(Number(e.target.value))}
            className="input"
            style={{ width: 'auto', fontSize: 12, padding: '4px 10px' }}
          >
            {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {clxChart.length < 2
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>2개월 이상 데이터가 필요합니다</div>
          : <ResponsiveContainer width="100%" height={300}>
              <LineChart data={clxChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: BRANCH_COLORS[v] ?? 'var(--text-2)' }}>{v}</span>} />
                {branches.map(branch => (
                  <Line key={branch} type="monotone" dataKey={branch}
                    stroke={BRANCH_COLORS[branch] ?? '#888'} strokeWidth={2}
                    dot={{ fill: BRANCH_COLORS[branch] ?? '#888', r: 4 }}
                    activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
        }
      </div>

      {/* CLX 기준 */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: 16, background: 'rgba(74,158,255,0.04)', borderColor: 'rgba(74,158,255,0.15)' }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11 }}>
          {[['120+','탁월','#00E5FF'],['80~119','건강 (목표)','var(--done)'],['40~79','보통','var(--medium)'],['0~39','주의','var(--high)'],['0 미만','위험','var(--critical)']].map(([range, label, color]) => (
            <div key={range} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
              <span style={{ color: 'var(--text-3)' }}>{range}</span>
              <span style={{ color, fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Severity 트렌드 차트 */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 20 }}>🔴 월별 Severity 트렌드</div>
        {severityFiltered.length < 2
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>2개월 이상 데이터가 필요합니다</div>
          : <ResponsiveContainer width="100%" height={300}>
              <BarChart data={severityFiltered} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-1)' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span style={{ color: SEVERITY_COLORS[v] }}>{v}</span>} />
                {(['Critical', 'High', 'Medium', 'Low'] as const).map(sev => (
                  <Bar key={sev} dataKey={sev} stackId="a" fill={SEVERITY_COLORS[sev]} radius={sev === 'Low' ? [4,4,0,0] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
        }
      </div>

      {/* 카테고리 바 차트 */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 20, color: 'var(--text-2)' }}>📊 카테고리별 전체 VOC 건수</div>
        {catData.length === 0
          ? <div style={{ color: 'var(--text-3)', textAlign: 'center', padding: 40, fontSize: 13 }}>데이터 없음</div>
          : <ResponsiveContainer width="100%" height={250}>
              <BarChart data={catData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="category" stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-3)" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-1)' }}
                  itemStyle={{ color: 'var(--accent)' }}
                />
                <Bar dataKey="cnt" fill="var(--accent)" radius={[4,4,0,0]} name="VOC 건수" />
              </BarChart>
            </ResponsiveContainer>
        }
      </div>
    </div>
  )
}
