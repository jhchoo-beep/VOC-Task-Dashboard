'use client'
import { BANDS, addDays, md, rowsFor, trendKeys, type Kr4Data, type Kr4Filter, type Kr4Mode, type Kr4Rec } from '../../lib/kr4'
import Kr4Info, { InfoList } from './Kr4Info'
import { SECTION_TITLE } from './Kr4Shared'

// 점수대별 리뷰 분포 = 점수 추이와 같은 기간(가로), 점수대(세로). 칸을 누르면 리뷰 상세가 그 기간·점수대로 걸러진다(다시 누르면 풀림)
export default function Kr4Heat({ data, mode, sel, branchSel, cmpOn, cmpN, F, onCell }: {
  data: Kr4Data; mode: Kr4Mode; sel: string[]; branchSel: string[]; cmpOn: boolean; cmpN: number; F: Kr4Filter; onCell: (k: string, band: number) => void
}) {
  const { keys, prev } = trendKeys(data, mode, sel, cmpOn ? cmpN : 0)
  const cols = keys.map(k => rowsFor(data, mode, [k], branchSel))
  const mx = Math.max(1, ...BANDS.flatMap(([, f]) => cols.map(x => x.filter(f).length)))
  const isSel = (k: string) => sel.includes(k), isPrev = (k: string) => prev.includes(k)
  const multi = sel.length > 1
  const sc = keys.map((k, j) => (isSel(k) ? j : -1)).filter(j => j >= 0)
  const sumc = (f: (r: Kr4Rec) => boolean) => sc.reduce((s, j) => s + cols[j].filter(f).length, 0)
  const many = keys.length > 5
  // 헤더 3종을 같은 모양(위쪽 둥근 칸 + 아래 3px 띠)으로: 고른 기간 = 파랑 칸·파랑 띠, 붙인 직전 기간 = 회색 칸, 합계 = 진한 글자·회색 칸·진한 띠
  const thBase: React.CSSProperties = { textAlign: 'center', fontSize: 12, padding: '4px 0 5px', whiteSpace: 'nowrap', lineHeight: 1.35, borderRadius: '6px 6px 0 0' }
  const th = (k: string): React.CSSProperties => (isSel(k)
    ? { ...thBase, fontWeight: 700, color: 'var(--accent)', background: 'rgba(43,127,224,.12)', boxShadow: 'inset 0 -3px var(--accent)' }
    : { ...thBase, fontWeight: 500, color: isPrev(k) ? 'var(--text-3)' : 'var(--text-2)', background: isPrev(k) ? 'rgba(127,127,127,.12)' : undefined })
  const lab = (k: string) => (mode === 'w'
    ? <><span>{md(addDays(k, -6))}</span><br /><span>~{md(k)}{k >= data.last ? '*' : ''}</span></>
    : <>{+k.slice(5)}월</>)
  const rowH: React.CSSProperties = { textAlign: 'right', paddingRight: 10, fontWeight: 500, color: 'var(--text-3)', whiteSpace: 'nowrap', fontSize: 13 }

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={SECTION_TITLE}>점수대별 리뷰 분포</span>
        <span style={{ marginLeft: 'auto' }}>
          <Kr4Info align="right" width={380}>
            <InfoList items={[
              '칸 = 그 기간 그 점수대 리뷰 건수(고른 지점 기준), 진할수록 많음, 9점 미만 행은 빨강',
              '칸을 누르면 아래 리뷰 상세가 그 기간, 점수대로 걸러짐(다시 누르면 풀림)',
              '열 = 왼쪽 그래프와 같은 기간, 같은 순서(고른 기간 = 파랑, 비교로 붙인 기간 = 회색 「직전」)',
              '「합계(고른 기간)」 열, 「9점 미만」 줄의 합계는 고른 기간만 더함(붙인 기간은 안 넣음)',
            ]} />
          </Kr4Info>
        </span>
      </div>
      <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 2, fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ width: 74 }} />
            {keys.map(k => <th key={k} style={th(k)}>{isPrev(k) && !many && <i style={{ fontStyle: 'normal', fontSize: 10 }}>직전 </i>}{lab(k)}</th>)}
            {multi && <th style={{ ...thBase, fontWeight: 700, color: 'var(--text-1)', background: 'rgba(127,127,127,.16)', boxShadow: 'inset 0 -3px var(--text-2)' }}>합계<br /><span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>고른 기간</span></th>}
          </tr>
        </thead>
        <tbody>
          {BANDS.map(([l, f], i) => (
            <tr key={l}>
              <th style={rowH}>{l}</th>
              {cols.map((x, j) => {
                const n = x.filter(f).length, al = n ? 0.15 + 0.75 * n / mx : 0, rgb = i >= 2 ? '220,38,38' : '22,163,74'
                const on = F.k === keys[j] && F.s === `b${i}`
                return (
                  <td key={keys[j]} onClick={() => onCell(keys[j], i)}
                    style={{ textAlign: 'center', height: 30, fontWeight: 600, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                      background: n ? `rgba(${rgb},${al.toFixed(2)})` : 'transparent', color: al > 0.55 ? '#fff' : undefined,
                      boxShadow: on ? 'inset 0 0 0 2px var(--accent)' : isSel(keys[j]) ? 'inset 0 0 0 2px rgba(37,99,235,.35)' : undefined }}>
                    {n || ''}
                  </td>
                )
              })}
              {multi && <td style={{ textAlign: 'center', fontWeight: 700, background: 'rgba(127,127,127,.12)' }}>{sumc(f) || ''}</td>}
            </tr>
          ))}
          <tr>
            <th style={{ ...rowH, borderTop: '1px solid var(--border)' }}>9점 미만</th>
            {cols.map((x, j) => { const n = x.filter(r => r.s < 9).length; return <td key={keys[j]} style={{ textAlign: 'center', borderTop: '1px solid var(--border)', color: n ? 'var(--critical)' : 'var(--text-3)', fontWeight: n ? 700 : 500 }}>{n}</td> })}
            {multi && <td style={{ textAlign: 'center', fontWeight: 700, color: sumc(r => r.s < 9) ? 'var(--critical)' : undefined, background: 'rgba(127,127,127,.12)' }}>{sumc(r => r.s < 9)}</td>}
          </tr>
          <tr>
            <th style={rowH}>합계</th>
            {cols.map((x, j) => <td key={keys[j]} style={{ textAlign: 'center', color: 'var(--text-3)', fontWeight: isSel(keys[j]) ? 700 : 500 }}>{x.length}</td>)}
            {multi && <td style={{ textAlign: 'center', fontWeight: 700, background: 'rgba(127,127,127,.12)' }}>{sumc(() => true)}</td>}
          </tr>
        </tbody>
      </table>
      <ul style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
        <li>칸 = 그 기간 그 점수대 리뷰 건수, 진할수록 많음</li>
        <li>칸을 누르면 아래 리뷰 상세가 그 기간·점수대로 걸러짐</li>
      </ul>
    </div>
  )
}
