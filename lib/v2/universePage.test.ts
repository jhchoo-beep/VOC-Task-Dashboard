import { describe, it, expect } from 'vitest'
import { DATA_MARK, HIDDEN_RULE, embedJson, renderStatusPage, renderUniversePage } from './universePage'

const LS = String.fromCharCode(0x2028)
const TEMPLATE = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>VOC 우주</title></head>
<body><div id="app"></div>
<script type="application/json" id="voc-data">${DATA_MARK}</script>
<script>/* 화면 */</script>
</body></html>
`

/** 브라우저가 하듯 데이터 스크립트 블록을 꺼낸다: 여는 태그 뒤부터 처음 나오는 </script 까지(대소문자 무시). */
function dataBlock(html: string): string {
  const open = '<script type="application/json" id="voc-data">'
  const start = html.indexOf(open) + open.length
  const end = html.toLowerCase().indexOf('</script', start)
  return html.slice(start, end)
}

describe('renderUniversePage — 리뷰 원문이 문서를 깨뜨리지 않게', () => {
  const nasty = {
    text_ko: '좋았어요</script><script>alert(1)</script> 끝',
    text_orig: 'Great <!-- not a comment --> stay </SCRIPT >',
    dollar: "가격 $& 와 $' 와 $` 와 $$ 그대로",
    sep: `줄${LS}구분`,
    amp: 'A&B <b>굵게</b>',
  }

  it('데이터 블록을 브라우저처럼 꺼내 JSON.parse 하면 원래 값 그대로 — </script>·<!-- 가 블록을 끊지 않는다', () => {
    const html = renderUniversePage(TEMPLATE, { reviews: { r1: nasty } })
    const block = dataBlock(html)
    expect(JSON.parse(block)).toEqual({ reviews: { r1: nasty } })
    expect(block).not.toContain('<')
    // 블록 뒤 문서 구조가 그대로(데이터 뒤 스크립트·body 닫힘이 한 번씩)
    expect(html.match(/<\/body>/g)).toHaveLength(1)
    expect(html.match(/<script/gi)).toHaveLength(2)
  })

  it('대체 문자열 패턴($& $\' $`)이 템플릿 조각을 데이터 안에 복제하지 않는다', () => {
    const html = renderUniversePage(TEMPLATE, nasty)
    expect(html.length).toBe(TEMPLATE.length - DATA_MARK.length + embedJson(nasty).length)
    expect(JSON.parse(dataBlock(html)).dollar).toBe(nasty.dollar)
  })

  it('데이터 자리가 없거나 두 곳이면 문서를 만들지 않는다', () => {
    expect(() => renderUniversePage('<html></html>', {})).toThrow(/정확히 1곳/)
    expect(() => renderUniversePage(`${DATA_MARK}${DATA_MARK}`, {})).toThrow(/정확히 1곳/)
  })
})

describe('renderStatusPage — 적재 전·읽기 실패 화면', () => {
  it('완전한 문서(doctype·lang=ko·charset·viewport·title)이고 [hidden] 규칙을 갖는다', () => {
    const html = renderStatusPage({ heading: '데이터 적재 전', lines: ['별 0 · 별자리 0'] })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<html lang="ko">')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toMatch(/<meta name="viewport" content="width=device-width,initial-scale=1[^"]*">/)
    expect(html).toContain('<title>VOC 우주</title>')
    expect(html).toContain(HIDDEN_RULE)
    expect(html).toContain('<h1>데이터 적재 전</h1>')
    expect(html).toContain('<p>별 0 · 별자리 0</p>')
  })

  it('문구는 HTML 로 해석되지 않게 이스케이프한다', () => {
    const html = renderStatusPage({ heading: '<img src=x onerror=alert(1)>', lines: ['a & b'] })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('a &amp; b')
  })
})
