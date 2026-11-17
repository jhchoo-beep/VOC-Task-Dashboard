'use client'
import { Fragment, useMemo, useState } from 'react'
import {
  COLV, SOPT, gistOf, md, passFilter, periodMain, reviewBase, rowClass, scopeName, srcText,
  type Kr4Col, type Kr4Data, type Kr4Filter, type Kr4Mode, type Kr4Rec,
} from '../../lib/kr4'
import { CHIP, SECTION_TITLE } from './Kr4Shared'

const LAB: Record<Kr4Col, string> = { d: '작성일', b: '지점', c: '채널', s: '점수', cat: '원인' }
const ROW_BG = { lo: 'rgba(220,38,38,.10)', mid: 'rgba(245,158,11,.12)', hi: 'rgba(22,163,74,.08)' }
const sortKey = (c: Kr4Col, r: Kr4Rec): string | number =>
  c === 'd' ? r.d || r.col : c === 'b' ? r.b : c === 'c' ? r.c : c === 's' ? r.s : r.cat[0] ?? '￿'
const klab = (mode: Kr4Mode, k: string) => periodMain({ weeks: [], months: [], recs: [], last: '' }, mode, [k]).replace(/ \(.*\)$/, '')

// 리뷰 상세 = 현재 HTML 과 같은 표: 열 머리글 누르면 정렬, ▾ 로 열 필터, 줄을 누르면 원문(외국어는 번역 위, 원문 아래)
export default function Kr4Reviews({ data, mode, sel, branchSel, F, setF }: {
  data: Kr4Data; mode: Kr4Mode; sel: string[]; branchSel: string[]; F: Kr4Filter; setF: (f: Kr4Filter) => void
}) {
  const [sort, setSort] = useState<{ col: Kr4Col; dir: 1 | -1 }>({ col: 's', dir: 1 })
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [pop, setPop] = useState<Kr4Col | null>(null)

  const base = useMemo(() => reviewBase(data, mode, sel, branchSel, F), [data, mode, sel, branchSel, F])
  const rs = useMemo(() => {
    const out = base.filter(r => passFilter(r, F))
    out.sort((a, b) => {
      const x = sortKey(sort.col, a), y = sortKey(sort.col, b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.s - b.s
    })
    return out
  }, [base, F, sort])
  const act = Object.keys(F).length
  const low = rs.filter(r => r.s < 9).length
  const head = `${scopeName(branchSel)} ${F.k ? klab(mode, F.k) : periodMain(data, mode, sel)}, ` + (act ? `${base.length}건 중 ${rs.length}건` : `리뷰 ${rs.length}건 중 9점 미만 ${low}건`)

  const setCol = (c: 'd' | 'b' | 'c' | 'cat', vals: string[] | undefined) => {
    const n = { ...F }
    if (vals) n[c] = vals
    else delete n[c]
    setF(n)
  }
  const clearKey = (c: keyof Kr4Filter) => { const n = { ...F }; delete n[c]; setF(n) }
  const chips: [keyof Kr4Filter, string][] = []
  if (F.k) chips.push(['k', `기간: ${klab(mode, F.k)}`])
  if (F.s) chips.push(['s', `점수: ${SOPT.find(o => o[0] === F.s)?.[1]}`])
  ;(['d', 'b', 'c', 'cat'] as const).forEach(c => { const f = F[c]; if (f) chips.push([c, `${LAB[c]}: ${f.map(v => (c === 'd' && v !== '수집' ? md(v) : v)).join(', ') || '없음'}`]) })

  const Pop = ({ c }: { c: Kr4Col }) => {
    const others = base.filter(r => passFilter(r, F, c))
    let body: React.ReactNode
    if (c === 's') {
      body = [['', '전체'], ...SOPT.map(o => [o[0], o[1]])].map(([k, l]) => (
        <label key={k} style={{ display: 'block', padding: '2px 0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="radio" name="kr4s" checked={(F.s ?? '') === k} onChange={() => { const n = { ...F }; if (k) n.s = k; else delete n.s; setF(n) }} />{' '}
          {l} <span style={{ color: 'var(--text-3)' }}>{k ? others.filter((SOPT.find(o => o[0] === k) as (typeof SOPT)[number])[2]).length : others.length}</span>
        </label>
      ))
    } else {
      const cnt: Record<string, number> = {}
      others.forEach(r => COLV[c](r).forEach(v => (cnt[v] = (cnt[v] || 0) + 1)))
      const vals = Object.keys(cnt).sort(c === 'd' ? (a, b) => Number(a === '수집') - Number(b === '수집') || a.localeCompare(b) : (a, b) => cnt[b] - cnt[a] || a.localeCompare(b))
      const cur = F[c]
      const toggle = (v: string) => {
        const on = new Set(cur ?? vals); on.has(v) ? on.delete(v) : on.add(v)
        setCol(c, on.size === vals.length ? undefined : vals.filter(x => on.has(x)))
      }
      body = (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <button style={CHIP(false)} onClick={() => setCol(c, undefined)}>모두 켬</button>
            <button style={CHIP(false)} onClick={() => setCol(c, [])}>모두 끔</button>
            {c === 'd' && <button style={CHIP(false)} onClick={() => setCol(c, ['수집'])}>수집 기준만</button>}
          </div>
          {vals.map(v => (
            <label key={v} style={{ display: 'block', padding: '2px 0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={!cur || cur.includes(v)} onChange={() => toggle(v)} />{' '}
              {c === 'd' && v !== '수집' ? md(v) : v} <span style={{ color: 'var(--text-3)' }}>{cnt[v]}</span>
            </label>
          ))}
        </>
      )
    }
    return (
      <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,.18)', padding: '8px 10px', minWidth: 200, maxHeight: 320, overflow: 'auto', fontSize: 13, fontWeight: 400, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{LAB[c]} 필터</div>{body}
      </div>
    )
  }

  const COLS_ORDER: Kr4Col[] = ['d', 'b', 'c', 's', 'cat']
  const W = ['96px', '76px', '92px', '58px', '170px']
  return (
    <div className="card" id="kr4-reviews" style={{ padding: '16px 20px' }}>
      <div style={SECTION_TITLE}>리뷰 상세 <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-3)', marginLeft: 6 }}>{head}</span></div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '8px 0' }}>
          {chips.map(([c, l]) => <span key={c} style={CHIP(true)} onClick={() => clearKey(c)}>{l} ✕</span>)}
          <button style={CHIP(false)} onClick={() => setF({})}>전체 해제</button>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 8px' }}>
        줄을 누르면 리뷰 원문이 펼쳐짐(외국어는 번역 위, 원문 아래, 번역은 VOC 대시보드 번역본, 없으면 AI 번역)
        {([['lo', '9.0 미만'], ['mid', '9.0 이상인데 불만 있음(가려진 리뷰)'], ['hi', '9.0 이상, 불만 없음']] as const).map(([k, l]) => (
          <span key={k} style={{ display: 'inline-block', padding: '0 8px', borderRadius: 4, marginLeft: 6, background: ROW_BG[k], color: 'var(--text-1)' }}>{l}</span>
        ))}
      </div>
      <div style={{ overflow: 'auto', maxHeight: 640, minHeight: pop ? 400 : undefined, border: '1px solid var(--border)', borderRadius: 8 }}>   {/* 열 필터 팝업이 잘리지 않게(결과 0건이어도 닫을 수 있게) */}
        <table style={{ tableLayout: 'fixed', width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 14 }}>
          <colgroup>{W.map((w, i) => <col key={i} style={{ width: w }} />)}<col /></colgroup>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1, boxShadow: '0 1px 0 var(--border)' }}>
            <tr>
              {COLS_ORDER.map((c, i) => (
                <th key={c} style={{ position: 'relative', padding: '6px 8px', textAlign: i === 0 || c === 's' ? 'right' : i < 3 ? 'center' : 'left', fontSize: 13, color: 'var(--text-2)' }}>
                  <span style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSort(s => (s.col === c ? { col: c, dir: (-s.dir) as 1 | -1 } : { col: c, dir: 1 }))}>
                    {LAB[c]}<i style={{ fontStyle: 'normal', color: 'var(--accent)', marginLeft: 2 }}>{sort.col === c ? (sort.dir > 0 ? '▲' : '▼') : ''}</i>
                  </span>
                  <button title={`${LAB[c]} 필터`} onClick={() => setPop(p => (p === c ? null : c))}
                    style={{ border: 0, background: (c === 's' ? F.s : F[c]) ? 'var(--accent)' : 'none', color: (c === 's' ? F.s : F[c]) ? '#fff' : 'var(--text-3)', cursor: 'pointer', padding: '0 3px', borderRadius: 4 }}>▾</button>
                  {pop === c && <Pop c={c} />}
                </th>
              ))}
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 13, color: 'var(--text-2)' }}>요약</th>
            </tr>
          </thead>
          <tbody>
            {rs.map(r => {
              const key = r.id || `${r.b}|${r.c}|${r.d}|${r.s}|${r.col}`, isOpen = open.has(key), bg = ROW_BG[rowClass(r)]
              const cell: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top', background: bg, borderBottom: '1px solid var(--border)', fontWeight: isOpen ? 600 : 400 }
              return (
                <Fragment key={key}>
                  <tr className="kr4-rv" style={{ cursor: 'pointer' }}
                    onClick={() => setOpen(o => { const n = new Set(o); n.has(key) ? n.delete(key) : n.add(key); return n })}>
                    <td style={{ ...cell, textAlign: 'right' }}>{r.k === 'd' ? md(r.d) : <span style={{ color: 'var(--text-3)' }}>수집 {md(r.col)}</span>}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{r.b}</td>
                    <td style={cell}>{r.c}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{r.s.toFixed(1)}</td>
                    <td style={cell}>{r.cat.map(c => <span key={c} style={{ display: 'inline-block', background: 'var(--bg-hover, rgba(127,127,127,.15))', borderRadius: 4, padding: '0 5px', margin: '1px 2px 1px 0', fontSize: 13, whiteSpace: 'nowrap' }}>{c}</span>)}</td>
                    <td style={cell}>{gistOf(r) || <span style={{ color: 'var(--text-3)' }}>점수만</span>}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} style={{ padding: '6px 10px', background: 'var(--bg-hover, rgba(127,127,127,.12))', borderBottom: '1px solid var(--border)' }}>
                        {!r.t ? <div style={{ color: 'var(--text-3)', fontSize: 14 }}>원문 없음(점수만 남긴 리뷰)</div>
                          : r.tr ? (
                            <>
                              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.65 }}>{r.tr}{' '}
                                <span style={{ fontSize: 11, color: 'var(--accent)' }}>{r.ts === 'dashboard' ? '대시보드 번역' : 'AI 번역'}</span></div>
                              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.65, color: 'var(--text-3)', borderTop: '1px dashed var(--border)', marginTop: 6, paddingTop: 6 }}>{srcText(r.t)}</div>
                            </>
                          ) : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.65 }}>{srcText(r.t)}</div>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {!rs.length && <tr><td colSpan={6} style={{ padding: 12, color: 'var(--text-3)', fontSize: 13 }}>리뷰 없음</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
