import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildKr4Data, rowsFor, avg, stats, summarize, kpiCells, trendKeys, wkOf, addDays, latestKey,
  KR4_BRANCHES, summaryText, BANDS, SOPT, passFilter, reviewBase, rowClass,
  type Kr4Row, type Kr4Mode,
} from './kr4'

// 숫자 전용 픽스처: 본문, 번역, 요지, 리뷰 id 는 들어 있지 않다(공개 저장소). 지점·채널·날짜·점수·원인 분류만.
// golden = 같은 입력으로 만든 현재 로컬 HTML(kr4_weekly_view)을 브라우저에서 실행해 뽑은 값(2026-11-16 수집분까지).
const fx = (f: string) => JSON.parse(readFileSync(join(__dirname, '__fixtures__', f), 'utf8'))
const NUM = fx('kr4_rows.numeric.json') as { b: string; c: string; d: string | null; k: 'day' | 'month'; m: string; col: string; s: number; cat: string[]; hc: boolean }[]
const GOLD = fx('kr4_golden.json')
const OTA = fx('kr4_ota.json') as { properties: any[]; scores: any[] }

const rows: Kr4Row[] = NUM.map(r => ({
  branch: r.b, channel: r.c, review_date: r.d, date_unit: r.k, assigned_month: r.m, collected_date: r.col,
  score10: r.s, cause_tags: r.cat, hi_checked: r.hc,
}))
const D = buildKr4Data(rows, GOLD.LAST)
const key = (b: string | null) => b ?? 'ALL'
const BRS: (string | null)[] = [null, ...KR4_BRANCHES]

describe('기간 구성', () => {
  it('주(화~월 끝 월요일), 월 목록과 수집 마감일이 현재 HTML과 같다', () => {
    expect(D.last).toBe('2026-11-16')
    expect(D.weeks).toEqual(GOLD.WEEKS)
    expect(D.months).toEqual(GOLD.MONTHS)
    expect(D.recs.length).toBe(GOLD.rowCount)
  })
  it('wkOf: 화~월을 한 주로 묶고 월요일이 주 키', () => {
    expect(wkOf('2026-11-10')).toBe('2026-11-16') // 화
    expect(wkOf('2026-11-16')).toBe('2026-11-16') // 월
    expect(wkOf('2026-11-17')).toBe('2026-11-23') // 다음 화
    expect(addDays('2026-11-16', -6)).toBe('2026-11-10')
  })
})

describe('공식값 재현 (KR4 OKR 월 평점)', () => {
  const m = (k: string) => stats(D, 'm', [k])[0]
  it('9월 9.02, 10월 8.93', () => {
    expect(m('2026-09')?.v).toBe(9.02)
    expect(m('2026-10')?.v).toBe(8.93)
  })
  it('건수도 현재 HTML과 같다(9월 233건, 10월 219건)', () => {
    expect(m('2026-09')?.n).toBe(233)
    expect(m('2026-10')?.n).toBe(219)
  })
})

describe('주간·월간 점수가 현재 HTML과 같다', () => {
  for (const b of BRS) {
    it(`주간 ${key(b)}: 20주 전체`, () => {
      const got = stats(D, 'w', D.weeks, b ? [b] : [])
      expect(got).toEqual(GOLD.weekStats[key(b)])
    })
    it(`월간 ${key(b)}: 전체 월`, () => {
      const got = stats(D, 'm', D.months, b ? [b] : [])
      expect(got).toEqual(GOLD.monthStats[key(b)])
    })
  }
  it('에어비앤비 월 단위 리뷰는 주간에서 빠지고 월간에는 들어간다', () => {
    const weekN = stats(D, 'w', D.weeks).reduce((s, x) => s + (x?.n ?? 0), 0)
    const monthN = rowsFor(D, 'm', D.months).length
    expect(weekN).toBeLessThan(monthN)
  })
})

describe('지점 카드 세 칸', () => {
  const ota = { props: OTA.properties, scores: OTA.scores }
  for (const b of BRS) {
    it(`${key(b)}: 전체 누적(OTA 표시 평점), 11월 누적, 이번 주`, () => {
      const [all, mon, wk] = kpiCells(D, ota, b)
      const g = GOLD.cards[key(b)]
      expect(all.v).toBeCloseTo(g.ota.v, 9)
      expect(all.n).toBe(g.ota.n)
      expect(mon.v).toBeCloseTo(g.curMonth.v, 9)
      expect(mon.n).toBe(g.curMonth.n)
      expect(wk.v).toBeCloseTo(g.curWeek.v, 9)
      expect(wk.n).toBe(g.curWeek.n)
    })
  }
  it('라벨', () => {
    expect(kpiCells(D, ota, null).map(c => c.label)).toEqual(['전체 누적', '11월 누적', '이번 주'])
  })
})

describe('요약(이번/직전)이 현재 HTML과 같다', () => {
  for (const g of GOLD.summaries as any[]) {
    it(`${g.label} · ${g.branchSel.join('+') || '전체'} · ${g.sel.join(',')}`, () => {
      const S = summarize(D, g.mode as Kr4Mode, g.sel, g.branchSel)
      expect(S.a).toBeCloseTo(g.a, 10)
      if (g.pa == null) expect(S.pa).toBeNull(); else expect(S.pa).toBeCloseTo(g.pa, 10)
      if (g.d == null) expect(S.d).toBeNull(); else expect(S.d).toBeCloseTo(g.d, 10)
      expect([S.n, S.pn, S.low, S.plow, S.hid, S.phid]).toEqual([g.n, g.pn, g.low, g.plow, g.hid, g.phid])
      expect(S.pk).toEqual(g.pk)
      expect(S.per).toBe(g.per)
      expect(S.prevPer).toBe(g.prevPer)
      expect(S.name).toBe(g.name)
      expect(S.cmp).toBe(g.cmp)
      expect(S.cut).toBe(g.cut)
      expect(S.cn).toBe(g.cn)
      expect(S.ov).toBe(g.ov)
      expect(S.brs?.map(x => x.b)).toEqual(g.brs?.map((x: any) => x.b))
      S.brs?.forEach((x, i) => { if (x.v == null) expect(g.brs[i].v).toBeNull(); else expect(x.v).toBeCloseTo(g.brs[i].v, 10) })
      expect(S.pbrs?.map(x => x.b)).toEqual(g.pbrs?.map((x: any) => x.b))
      expect(S.mv?.kind).toBe(g.mv?.kind)
      expect(S.mv?.rows).toEqual(g.mv?.rows)
      expect(S.mv?.side?.t ?? null).toBe(g.mv?.side ?? null)
    })
  }
})

describe('추이 가로축', () => {
  it('직전 n주 비교를 켜면 고른 기간 앞쪽 n주가 붙는다', () => {
    const lw = latestKey(D, 'w')
    const t = trendKeys(D, 'w', [lw], 4)
    expect(t.keys).toEqual(GOLD.trendKeysCmp)
    expect(t.prev).toEqual(GOLD.trendKeysCmp.slice(0, 4))
  })
  it('비교를 끄면 고른 기간만', () => {
    const lw = latestKey(D, 'w')
    expect(trendKeys(D, 'w', [lw]).keys).toEqual([lw])
  })
  it('여러 주를 고르면 처음부터 끝까지 이어 붙는다', () => {
    const a = D.weeks[D.weeks.length - 3], b = D.weeks[D.weeks.length - 1]
    expect(trendKeys(D, 'w', [a, b]).keys).toEqual(D.weeks.slice(-3))
  })
})

describe('빈 값', () => {
  it('리뷰가 없는 기간은 평균 null', () => {
    expect(avg([])).toBeNull()
    expect(stats(D, 'w', ['1999-01-04'])[0]).toBeNull()
  })
})

describe('리뷰 상세 · 점수대 분포 (HTML 히트맵·필터와 같은 값, 이번 주 11/10~11/16)', () => {
  const wk = latestKey(D, 'w'), cur = rowsFor(D, 'w', [wk])
  it('점수대별 건수 13·16·17·7·4, 9점 미만 28, 합계 57', () => {
    expect(BANDS.map(([, f]) => cur.filter(f).length)).toEqual([13, 16, 17, 7, 4])
    expect(cur.filter(r => r.s < 9).length).toBe(28)
    expect(cur.length).toBe(57)
  })
  it('필터: 가려진 리뷰 8건, 9점 미만 28건, 지점 필터는 그 지점만', () => {
    expect(cur.filter(r => passFilter(r, { s: 'hid' })).length).toBe(8)
    expect(cur.filter(r => passFilter(r, { s: 'lo' })).length).toBe(28)
    const only = cur.filter(r => passFilter(r, { b: ['신설'] }))
    expect(only.length).toBeGreaterThan(0)
    expect(only.every(r => r.b === '신설')).toBe(true)
    expect(SOPT.length).toBe(3 + BANDS.length)
  })
  it('히트맵 칸을 누르면 그 기간 전체로 바뀐다(F.k), 행 색 구분은 lo/mid/hi', () => {
    const prev = latestKey(D, 'w') && D.weeks[D.weeks.length - 2]
    expect(reviewBase(D, 'w', [wk], [], { k: prev, s: 'b0' })).toEqual(rowsFor(D, 'w', [prev]))
    expect(cur.filter(r => rowClass(r) === 'mid').length).toBe(8)
    expect(cur.filter(r => rowClass(r) === 'lo').length).toBe(28)
  })
})

describe('요약 복사 문구 = 현재 HTML sumText 와 글자까지 같다 (HTML 에서 뽑은 기준값)', () => {
  const G = fx('kr4_sumtext_golden.json') as { name: string; mode: Kr4Mode; sel: string[]; branchSel: string[]; text: string }[]
  for (const g of G) {
    it(g.name, () => { expect(summaryText(D, summarize(D, g.mode, g.sel, g.branchSel))).toBe(g.text) })
  }
  it('대시보드 방식을 끄면 월 표기 리뷰가 주간에서 빠진다(주 목록은 같음)', () => {
    const off = buildKr4Data(rows, GOLD.LAST, false)
    expect(off.weeks).toEqual(D.weeks)
    expect(off.recs.every(r => r.wc === null)).toBe(true)
    expect(rowsFor(off, 'w', [latestKey(off, 'w')]).length).toBeLessThan(rowsFor(D, 'w', [latestKey(D, 'w')]).length)
  })
})
