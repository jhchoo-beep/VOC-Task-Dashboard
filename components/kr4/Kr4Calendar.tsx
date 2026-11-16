'use client'
import { useState } from 'react'
import { addDays, avg, md, rowsFor, wkOf, type Kr4Data, type Kr4Mode } from '../../lib/kr4'
import Kr4Info, { InfoList } from './Kr4Info'
import { CHIP, Score } from './Kr4Shared'

const SHORT: Record<string, string> = { 신설: '신설', 동대문: '동대문', 제주시티: '제주', 고성: '고성' }

// 기간 선택: 주간 = 화~월 7칸 달력 + 오른쪽 고른 지점 점수 · 월간 = 한 줄 = 한 달. 켜고 끄기, 여러 개 = 합산, 최소 1개 남김
export default function Kr4Calendar({ data, mode, sel, branchSel, onMode, onPick, dash, onDash }: {
  dash: boolean; onDash: (on: boolean) => void
  data: Kr4Data; mode: Kr4Mode; sel: string[]; branchSel: string[]; onMode: (m: Kr4Mode) => void; onPick: (k: string) => void
}) {
  const months = [...new Set(data.weeks.map(w => w.slice(0, 7)))].filter(m => m >= '2026-07')
  const selMonth = [...sel].sort().pop()!.slice(0, 7)
  const [calMonth, setCalMonth] = useState<string | null>(null)
  const M = calMonth && months.includes(calMonth) ? calMonth : months.includes(selMonth) ? selMonth : months[months.length - 1]
  const head = !branchSel.length || branchSel.length === 4 ? '4개 지점' : branchSel.length === 1 ? SHORT[branchSel[0]] : '합산'

  const scoreCell = (k: string) => {
    const r = rowsFor(data, mode, [k], branchSel), a = avg(r)
    return <td title={`${r.length}건`} style={{ textAlign: 'right', padding: '4px 8px' }}>{r.length ? <Score v={a} size={13} /> : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>없음</span>}</td>
  }
  const th: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', fontWeight: 500, padding: '4px 6px', textAlign: 'center' }
  const rowStyle = (on: boolean, has: boolean): React.CSSProperties => ({
    background: on ? 'var(--bg-hover)' : undefined, outline: on ? '1px solid var(--accent)' : undefined, cursor: has ? 'pointer' : 'default', opacity: has ? 1 : 0.4,
  })

  const weekRows = () => {
    const y = +M.slice(0, 4), m = +M.slice(5), end = `${M}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
    const out: React.ReactNode[] = []
    for (let w = wkOf(`${M}-01`); addDays(w, -6) <= end; w = addDays(w, 7)) {
      const has = data.weeks.includes(w), on = sel.includes(w), ww = w
      out.push(
        <tr key={w} onClick={() => has && onPick(ww)} style={rowStyle(on, has)}>
          {[...Array(7)].map((_, i) => {
            const d = addDays(w, i - 6)
            return <td key={d} style={{ fontSize: 12, textAlign: 'center', padding: '4px 6px', color: d.slice(0, 7) !== M ? 'var(--text-3)' : 'var(--text-1)', fontWeight: on && d.slice(0, 7) === M ? 700 : 400 }}>
              {md(d)}{d === w && has && w >= data.last ? '*' : ''}
            </td>
          })}
          {has ? scoreCell(w) : <td />}
        </tr>,
      )
    }
    return out
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 4 }}>기간</span>
        <button style={CHIP(mode === 'w')} onClick={() => onMode('w')}>주간</button>
        <button style={CHIP(mode === 'm')} onClick={() => onMode('m')}>월간</button>
        <Kr4Info>
          <InfoList items={[
            ...(mode === 'w'
              ? ['주 = 화~월, 줄을 누르면 그 주를 고름', `오른쪽 칸 = 그 주 고른 지점 점수(전체면 4개 지점 합산), * = ${md(data.last)} 수집분까지`, '에어비앤비는 작성일이 없어 주간에서 빠짐(월간에는 포함)']
              : ['월 = 일자 있는 리뷰는 작성월', '월만 표기된 리뷰는 수집된 달', '오른쪽 칸 = 그 달 고른 지점 점수']),
            '누르면 켜지고 다시 누르면 꺼짐, 여러 개 켜면 합산(리뷰 수 가중 평균), 기간은 최소 1개 남음',
          ]} />
          {mode === 'w' && (
            <label style={{ display: 'block', marginTop: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={dash} onChange={e => onDash(e.target.checked)} /> 대시보드 방식(공식값은 켠 상태)
            </label>
          )}
        </Kr4Info>
      </div>
      {mode === 'w' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {months.map(x => <button key={x} style={CHIP(x === M)} onClick={() => setCalMonth(x)}>{+x.slice(5)}월</button>)}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {mode === 'w' ? ['화', '수', '목', '금', '토', '일', '월'].map(d => <th key={d} style={th}>{d}</th>) : <th style={{ ...th, textAlign: 'left' }}>월</th>}
            <th style={{ ...th, textAlign: 'right', color: 'var(--accent)' }}>{head}</th>
          </tr>
        </thead>
        <tbody>
          {mode === 'w' ? weekRows() : data.months.map(k => (
            <tr key={k} onClick={() => onPick(k)} style={rowStyle(sel.includes(k), true)}>
              <td style={{ fontSize: 12, padding: '4px 6px', fontWeight: sel.includes(k) ? 700 : 400 }}>{+k.slice(5)}월{k === data.last.slice(0, 7) ? '*' : ''}</td>
              {scoreCell(k)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
