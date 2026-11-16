'use client'
import { useMemo, useState } from 'react'
import { KR4_BRANCHES, buildKr4Data, latestKey, md, type Kr4Filter, type Kr4Mode, type Kr4Row } from '../lib/kr4'
import type { Kr4Props } from '../lib/kr4Data'
import Kr4Cards from './kr4/Kr4Cards'
import Kr4Calendar from './kr4/Kr4Calendar'
import Kr4Fyi from './kr4/Kr4Fyi'
import Kr4Heat from './kr4/Kr4Heat'
import Kr4Reviews from './kr4/Kr4Reviews'
import Kr4Summary from './kr4/Kr4Summary'
import Kr4Trend from './kr4/Kr4Trend'

// KR4 STAY VOC 주간 점수 — 선택 상태는 이것 하나: 기간(mode, sel) + 지점(branchSel, 빈 배열 = 4개 지점 전체) + 직전 비교(cmp)
export default function Kr4WeeklyClient({ rows, collectedThrough, updatedAt, ota, source, notice }: Kr4Props) {
  const [dash, setDash] = useState(true)   // 대시보드 방식(기본 켬 = 공식값)
  const data = useMemo(() => buildKr4Data(rows as Kr4Row[], collectedThrough ?? undefined, dash), [rows, collectedThrough, dash])
  const [mode, setMode] = useState<Kr4Mode>('w')
  const [sel, setSel] = useState<string[]>(() => (data.weeks.length ? [latestKey(data, 'w')] : []))
  const [branchSel, setBranchSel] = useState<string[]>([])
  const [F, setF] = useState<Kr4Filter>({})   // 리뷰 상세 필터 — 기간·지점을 바꾸면 초기화
  const [cmp, setCmp] = useState<{ on: boolean; n: { w: number; m: number } }>({ on: false, n: { w: 4, m: 3 } })

  if (!data.recs.length || !sel.length) {
    return <div style={{ padding: 32, color: 'var(--text-2)', fontSize: 13 }}>{notice ?? '아직 게시된 KR4 주간 데이터가 없습니다.'}</div>
  }

  const onMode = (m: Kr4Mode) => { setMode(m); setSel([latestKey(data, m)]); setF({}) }
  const onPickKey = (k: string) => { setF({}); setSel(s => (s.includes(k) ? (s.length > 1 ? s.filter(x => x !== k) : s) : [...s, k].sort())) }
  const onPickBranch = (b: string | null) => {
    setF({})
    setBranchSel(cur => (b == null ? [] : KR4_BRANCHES.filter(x => x === b ? !cur.includes(b) : cur.includes(x))))
  }
  // toLocaleString 은 Node(서버)와 브라우저의 로케일 데이터가 달라 하이드레이션이 어긋난다 — KST(+9h) 로 직접 만든다
  const stamp = updatedAt ? new Date(new Date(updatedAt).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : ''

  return (
    <div className="page-pad" style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Stay OTA 리뷰 평점</div>
        <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>KR4 STAY VOC 주간 점수</h1>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          {md(data.last)} 수집분까지{stamp ? ` · 갱신 ${stamp}` : ''}{source === 'mock' ? ' · 목 데이터' : ''}
        </div>
        {notice && source !== 'empty' && <div style={{ fontSize: 12, color: 'var(--high)', marginTop: 6 }}>{notice}</div>}
      </div>
      <Kr4Cards data={data} ota={{ props: ota.props, scores: ota.scores }} mode={mode} sel={sel} branchSel={branchSel} onPick={onPickBranch} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 400px) minmax(0, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }} className="kr4-grid">
        <Kr4Calendar data={data} mode={mode} sel={sel} branchSel={branchSel} onMode={onMode} onPick={onPickKey} dash={dash} onDash={on => { setDash(on); setF({}) }} />
        <Kr4Summary data={data} mode={mode} sel={sel} branchSel={branchSel} onHid={() => { setF({ s: 'hid' }); document.getElementById('kr4-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 440px)', gap: 16, marginTop: 16, alignItems: 'start' }} className="kr4-grid">
        <Kr4Trend data={data} mode={mode} sel={sel} branchSel={branchSel} cmpOn={cmp.on} cmpN={cmp.n[mode]}
          onCmp={(on, n) => setCmp(c => ({ on, n: { ...c.n, [mode]: n } }))} onPick={onPickKey} />
        <Kr4Heat data={data} mode={mode} sel={sel} branchSel={branchSel} cmpOn={cmp.on} cmpN={cmp.n[mode]} F={F}
          onCell={(k, i) => {
            const same = F.k === k && F.s === `b${i}`
            setF(same ? {} : { k, s: `b${i}` })
            if (!same) document.getElementById('kr4-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Kr4Reviews data={data} mode={mode} sel={sel} branchSel={branchSel} F={F} setF={setF} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Kr4Fyi branchSel={branchSel} />
      </div>
    </div>
  )
}
