'use client'
import { KR4_RECUR_HTML } from '../../lib/kr4RecurHtml'
import { SECTION_TITLE } from './Kr4Shared'

// FYI = 기존 개선과제 트래킹. 내용은 kr4_recur.md 로 만든 정적 조각(lib/kr4RecurHtml.ts, 갱신은 수동) — 고른 지점의 줄만 보인다
const CSS = `
.kr4-recur{font-size:15px;line-height:1.75}
.kr4-recur .nh{font-weight:700;margin-top:10px}
.kr4-recur>div>.nh:first-of-type{margin-top:6px}
.kr4-recur ul{margin:0;padding-left:20px}
.kr4-recur>div>ul>li{margin:3px 0}
.kr4-recur ul ul{font-size:14px;padding-left:20px;margin:1px 0 3px}
.kr4-recur .muted{color:var(--text-3);font-size:13px}
.kr4-recur .tk{display:inline-flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;font-size:12px;vertical-align:middle;margin:1px 2px;white-space:nowrap}
.kr4-recur .tk>b,.kr4-recur .tk>i{padding:0 5px;font-style:normal}
.kr4-recur .tk>i{border-left:1px solid var(--border);color:var(--text-3)}
.kr4-recur details{margin-top:10px}
.kr4-recur summary{cursor:pointer;color:var(--accent);font-size:14px}
.kr4-recur .tblwrap{overflow:auto;margin-top:4px}
.kr4-recur table{width:100%;border-collapse:collapse;font-size:13px}
.kr4-recur th,.kr4-recur td{border-bottom:1px solid var(--border);padding:6px;text-align:left;vertical-align:top}
`
export default function Kr4Fyi({ branchSel }: { branchSel: string[] }) {
  const hide = branchSel.length
    ? `.kr4-recur [data-b]:not(${branchSel.map(b => `[data-b="${b}"]`).join(',')}){display:none}`
    : ''
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <style>{CSS + hide}</style>
      <div style={SECTION_TITLE}>FYI</div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 14 }}>기존 개선과제 트래킹 (WIP)</summary>
        <div style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 12px' }}>재발 의심과 잘못 설정 의심만 추림(건수는 키워드 규칙 추정)</div>
        <div className="kr4-recur" dangerouslySetInnerHTML={{ __html: KR4_RECUR_HTML }} />
      </details>
    </div>
  )
}
