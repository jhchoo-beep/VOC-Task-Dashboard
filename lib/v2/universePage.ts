/**
 * V2 우주 화면 — HTML 문서 조립(순수 함수)
 * ────────────────────────────────────────────────────────────────
 * 템플릿(lib/v2/viewer/universe.template.html — 에이전트 B 화면을 묶은 완전한 문서)의 데이터 자리
 * `/*@@DATA@@*\/` 에 계약 JSON 을 넣는다. 데이터는 <script type="application/json" id="voc-data"> 안에
 * 들어가고 화면이 JSON.parse 로 읽는다.
 *
 * 🔴 이스케이프: 리뷰 원문에 `</script>`·`<!--` 가 있으면 스크립트 블록이 거기서 끊기거나(이후 원문이 HTML 로
 *    해석) 주석 상태로 넘어간다. JSON 문자열 안의 `<` 를 전부 유니코드 탈출(u003c)로 바꾼다 — JSON 으로도 그대로 유효하다
 *    (`<\!--` 처럼 JSON 에 없는 탈출 문자를 쓰면 JSON.parse 가 실패한다).
 * 🔴 끼워 넣기는 String.replace 를 쓰지 않는다 — 대체 문자열의 `$&`·`$'` 가 특수 패턴으로 해석돼
 *    리뷰 원문에 따라 템플릿 조각이 데이터 안에 복제된다.
 * ────────────────────────────────────────────────────────────────
 */

import type { UniverseLoad } from './universeFromDb'

export const DATA_MARK = '/*@@DATA@@*/'

/** 아티팩트 뼈대가 주던 규칙 — B 화면은 [hidden] 이 확실히 숨는다는 전제로 짜여 있다(모더레이터 확인 2026-10-13). */
export const HIDDEN_RULE = '[hidden]:not([hidden=until-found i]){display:none!important}'

// 줄 구분 문자 U+2028·U+2029(JSON 에는 유효하지만 옛 JS 문자열에서는 줄바꿈) — 소스에 그 문자를 직접 쓰지 않는다.
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)
const BS = String.fromCharCode(92)   // 역슬래시 — 탈출 문자열을 소스 탈출 규칙과 섞지 않으려고

/** <script type="application/json"> 안에 넣어도 안전한 JSON 문자열. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LS).join(BS + 'u2028')
    .split(PS).join(BS + 'u2029')
}

/** 템플릿의 데이터 자리(정확히 1곳)에 JSON 을 넣어 완전한 HTML 문서를 돌려준다. */
export function renderUniversePage(template: string, data: unknown): string {
  const first = template.indexOf(DATA_MARK)
  if (first < 0 || template.indexOf(DATA_MARK, first + DATA_MARK.length) >= 0) {
    throw new Error(`템플릿의 데이터 자리 ${DATA_MARK} 가 정확히 1곳이 아님`)
  }
  return template.slice(0, first) + embedJson(data) + template.slice(first + DATA_MARK.length)
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/**
 * 3D 화면 대신 보여 줄 상태 화면(적재 전·읽기 실패). 완전한 HTML 문서. 글은 상태 한 줄과 숫자만.
 */
export function renderStatusPage(p: { heading: string; lines?: string[] }): string {
  const lines = (p.lines ?? []).map(l => `<p>${escapeHtml(l)}</p>`).join('')
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>VOC 우주</title>
<meta name="theme-color" content="#02030a">
<style>
${HIDDEN_RULE}
:root{color-scheme:dark}
html,body{height:100%;margin:0;background:#02030a;color:#eef2fb;font:400 15px/1.6 Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
main{min-height:100%;box-sizing:border-box;display:grid;place-content:center;gap:6px;padding:24px 16px;text-align:center}
h1{margin:0 0 4px;font-size:22px;font-weight:600;letter-spacing:-0.01em}
p{margin:0;color:#b4bdd4;font-size:14px}
a{color:#d8ecff;text-underline-offset:3px}
</style>
</head>
<body>
<main><h1>${escapeHtml(p.heading)}</h1>${lines}<p><a href="/">VOC 대시보드</a></p></main>
</body>
</html>
`
}

// ─── 조립 결과 → 응답 문서(라우트와 렌더 스크립트가 같은 판단을 쓰게) ─────────

export interface PageOut { status: number; state: 'ready' | 'empty' | 'error'; html: string }

/** DB 조립 결과를 문서로. 적재 전이면 빈 우주 대신 「데이터 적재 전」. */
export function pageForLoad(load: UniverseLoad, template: string): PageOut {
  if (load.state === 'empty') {
    const t = load.tables
    const line = load.reason === 'tables_missing' ? 'V2 표 없음' : `별 ${t.voc_stars ?? 0} · 별자리 ${t.voc_constellations ?? 0}`
    return { status: 200, state: 'empty', html: renderStatusPage({ heading: '데이터 적재 전', lines: [line] }) }
  }
  return { status: 200, state: 'ready', html: renderUniversePage(template, load.universe) }
}

/** 읽기 실패 화면(500). 오류 내용은 서버 로그에만 남긴다. */
export function errorPage(): PageOut {
  return { status: 500, state: 'error', html: renderStatusPage({ heading: '데이터를 읽지 못했습니다', lines: ['잠시 뒤 새로고침'] }) }
}
