'use client'
import { useState } from 'react'
import { f2, md, summarize, summaryText, type Kr4Data, type Kr4Mode } from '../../lib/kr4'
import Kr4Info, { InfoList } from './Kr4Info'
import { Arrow, CHIP, Gray, Score, SECTION_TITLE } from './Kr4Shared'

// 요약 = 이번(고른 기간) | 직전. 점수·지점별·9점 미만·가려진 리뷰·원인 건수·평균을 끌어내린 지점
// 
export default function Kr4Summary({ data, mode, sel, branchSel, onHid }: { data: Kr4Data; mode: Kr4Mode; sel: string[]; branchSel: string[]; onHid?: () => void }) {
  const M = summarize(data, mode, sel, branchSel)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const txt = summaryText(data, M)
    try { await navigator.clipboard.writeText(txt) } catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
    setCopied(true); setTimeout(() => setCopied(false), 1200)
  }
  const isNow = sel.length === 1 && sel[0] === [...(mode === 'w' ? data.weeks : data.months)].pop()
  const left = isNow ? (mode === 'w' ? '이번 주' : '이번 달') : '고른 기간'
  const row = (key: string, l: React.ReactNode, r: React.ReactNode, extra?: React.CSSProperties) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '5px 0', fontSize: 13, color: 'var(--text-2)', ...extra }}>
      <div>{l}</div><div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>{r}</div>
    </div>
  )
  const lowC = (n: number) => <span style={{ color: n ? 'var(--critical)' : undefined, fontWeight: n ? 700 : 400 }}>{n}건</span>

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={SECTION_TITLE}>요약</span>
        <Kr4Info width={460}>
          <InfoList items={[
            '원인 = 9점 미만 리뷰 문장을 키워드로 나눈 9개(시설, 셀프운영, 청결/냄새, 어메니티, 직원응대, 소음, 가성비, 위치/교통, 객실 기대 불일치) + 어디에도 안 맞는 기타, 항상 같은 순서로 0건도 표시(칭찬뿐이거나 코멘트 없는 리뷰는 원인에서 뺌)',
            '원인 표 = 왼쪽 이번 기간 건수, 오른쪽 같은 원인의 직전 기간 건수, ▲ 늘어남(빨강), ▼ 줄어듦(초록)',
            '상승, 하락 = 같은 길이 직전 기간 대비, ±0.05 이내면 유지',
            '평균을 끌어내린(끌어올린) 지점 = 고른 범위 합산 평균보다 낮은(높은) 지점, 리뷰 0건 지점은 뺌',
            `진행 중 기간(${md(data.last)}까지 수집)은 직전 기간과 일수가 달라 윗줄 주석에 일수를 밝힘`,
            '가려진 리뷰 = 9.0 이상인데 본문에 불만이 적힌 리뷰(분류 기준은 9점 미만과 같음), 누르면 리뷰 상세가 그 리뷰만으로 걸러짐, 원인 건수에는 넣지 않음',
            '맨 아래 한 줄 = 연속 주(달), 최근 6주(달) 중 최고, 최저가 있을 때만',
            '복사 = 텍스트만 복사(체크인에 붙여 넣기)',
          ]} />
        </Kr4Info>
        <button id="kr4-copy" style={{ ...CHIP(false), marginLeft: 'auto' }} onClick={copy}>{copied ? '복사됨' : '복사'}</button>
      </div>
      {row('lb', <b style={{ color: 'var(--text-1)' }}>{left}</b>, <b style={{ color: 'var(--text-1)' }}>{M.pk ? M.cmp : '직전 기간'}</b>)}
      {row('per', M.per, M.pk ? M.prevPer : '없음')}
      {row('val',
        M.n ? <span>{M.name} <Score v={M.a} size={20} /> {M.pk && M.d != null && <Arrow d={M.d} />}</span> : `${M.name} 리뷰 없음`,
        !M.pk ? '' : M.pa != null ? <span>{M.name} <Gray v={M.pa} /></span> : `${M.name} 리뷰 없음`)}
      {M.brs && row('br',
        M.brs.map(x => <span key={x.b} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>{x.b} {x.v == null ? '없음' : <Score v={x.v} size={13} />}</span>),
        M.pbrs ? M.pbrs.map(x => <span key={x.b} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>{x.b} {x.v == null ? '없음' : <Gray v={x.v} />}</span>) : '')}
      {row('cnt', <span>리뷰 {M.n}건 중 9점 미만 {lowC(M.low)}</span>, M.pk ? <span>리뷰 {M.pn}건 중 9점 미만 {lowC(M.plow)}</span> : '')}
      {row('hid', <button title="누르면 아래 리뷰 상세가 가려진 리뷰만으로 걸러짐" onClick={onHid} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline dotted' }}>가려진 리뷰(9.0 이상인데 불만 적힘) {M.hid}건</button>, M.pk ? `가려진 리뷰 ${M.phid}건` : '')}
      {M.cn && <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0' }}>{M.cn}</div>}
      {M.mv && (
        <details open style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <summary style={{ cursor: 'pointer', listStyle: 'none', userSelect: 'none' }} title="누르면 접고 폅니다">
            {row('mvh', <b style={{ color: 'var(--text-1)' }}><span className="kr4-chev" aria-hidden="true" /> {M.mv.label} ({left})</b>, <b style={{ color: 'var(--text-1)' }}>{M.cmp}</b>)}
          </summary>
          {M.mv.rows.map(x => row(x.c,
            <span style={{ opacity: x.n ? 1 : 0.45 }}>{x.c} <b>{x.n}건</b> {x.n > x.p && <span style={{ color: 'var(--critical)' }}>▲</span>}{x.n < x.p && <span style={{ color: 'var(--done)' }}>▼</span>}</span>,
            <span style={{ opacity: x.p ? 1 : 0.45 }}>{x.c} {x.p}건</span>, { padding: '2px 0' }))}
          {M.mv.side && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}><b style={{ color: 'var(--text-1)' }}>{M.mv.side.lab}</b> {M.mv.side.t}</div>}
        </details>
      )}
      {M.ov && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>{M.ov}</div>}
      {!M.n && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>선택한 기간에 리뷰가 없습니다 ({f2(null)}).</div>}
    </div>
  )
}
