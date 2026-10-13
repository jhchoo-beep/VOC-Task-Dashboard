import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UNIVERSE_TEMPLATE } from './universeTemplate'
import { DATA_MARK, HIDDEN_RULE } from '../universePage'

const head = UNIVERSE_TEMPLATE.slice(0, UNIVERSE_TEMPLATE.indexOf('</head>'))
const body = UNIVERSE_TEMPLATE.slice(UNIVERSE_TEMPLATE.indexOf('<body>'))

describe('3D 화면 템플릿 — 라우트가 돌려줄 문서의 뼈대', () => {
  it('라우트가 import 하는 문자열 = 저장소의 템플릿 문서(둘이 어긋나지 않게; Windows 체크아웃의 CRLF 는 무시)', () => {
    const file = readFileSync(join(__dirname, 'universe.template.html'), 'utf8').replace(/\r\n/g, '\n')
    expect(UNIVERSE_TEMPLATE).toBe(file)
  })

  it('완전한 문서: doctype · html lang="ko" · head(charset·viewport·title 「VOC 우주」) · body, 각 한 번', () => {
    expect(UNIVERSE_TEMPLATE.startsWith('<!doctype html>\n<html lang="ko">\n<head>\n')).toBe(true)
    expect(head).toContain('<meta charset="utf-8">')
    expect(head).toMatch(/<meta name="viewport" content="width=device-width,initial-scale=1[^"]*">/)
    expect(head).toContain('<title>VOC 우주</title>')
    for (const tag of ['<!doctype html>', '<title>', '<head>', '<body>', '</body>', '</html>']) {
      expect(UNIVERSE_TEMPLATE.split(tag).length - 1).toBe(1)
    }
  })

  it('데이터 자리는 body 의 voc-data 스크립트 안 정확히 한 곳(화면이 JSON.parse 로 읽는 자리)', () => {
    expect(UNIVERSE_TEMPLATE.split(DATA_MARK).length - 1).toBe(1)
    expect(body).toContain(`<script type="application/json" id="voc-data">${DATA_MARK}</script>`)
  })

  it('[hidden] 규칙이 head 에 있다 — 없으면 첫 화면에 빈 패널과 「예시 데이터」 꼬리표가 보인다', () => {
    expect(head).toContain(HIDDEN_RULE)
    expect(body).toContain('<aside id="panel" class="panel glass" aria-live="polite" hidden>')
    expect(body).toMatch(/id="sample-tag" hidden/)
  })

  it('외부 리소스는 three@0.160.0 과 Pretendard v1.3.9 동적 서브셋 CSS 뿐. Pretendard 는 내장하지 않고 G마켓 숫자 서브셋만 내장', () => {
    const urls = new Set(UNIVERSE_TEMPLATE.match(/https?:\/\/[^\s"')<>]+/g) ?? [])
    for (const u of urls) {
      expect(
        u.startsWith('https://cdn.jsdelivr.net/npm/three@0.160.0/') ||
        u === 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css' ||
        u === 'https://cdn.jsdelivr.net' || u.startsWith('http://www.w3.org/'),
      ).toBe(true)
    }
    expect(head).toContain('<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css">')
    expect(UNIVERSE_TEMPLATE).not.toMatch(/@font-face\{[^}]*Pretendard/)
    const gm = UNIVERSE_TEMPLATE.match(/@font-face\{font-family:'Gmarket Sans'[^}]*unicode-range:U\+0025, U\+002B-002F, U\+0030-0039, U\+003A;src:url\(data:font\/woff2;base64,/g) ?? []
    expect(gm).toHaveLength(2)
  })

  it('데이터를 넣기 전 템플릿은 300KB 아래(실데이터를 넣은 문서 3MB 상한의 여유 확보)', () => {
    expect(Buffer.byteLength(UNIVERSE_TEMPLATE, 'utf8')).toBeLessThan(300_000)
  })
  it('지점 전환은 데이터의 지점 목록(4지점)으로 만든다 — 나선팔 4개 밝기, 전환 버튼 동적 생성, 체크아웃 없는 지점은 전체 값을 대신 보여 주지 않음', () => {
    expect(UNIVERSE_TEMPLATE).toContain('uniform vec4 uArmDim')
    expect(UNIVERSE_TEMPLATE).toContain("['전체', ...M.branches]")
    expect(UNIVERSE_TEMPLATE).toContain('M.branches.slice(0, 4).forEach')
    expect(UNIVERSE_TEMPLATE).not.toContain('M.branches.slice(0, 2)')
    expect(UNIVERSE_TEMPLATE).toContain("scope: '체크아웃 데이터 없음'")
    expect(UNIVERSE_TEMPLATE).not.toContain('신설, 동대문 합산')
  })
})
