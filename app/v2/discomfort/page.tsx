// STAY VOC 2.0 불편 지수 — B 관제 콘솔형. 지점·달은 주소(?branch=&month=)로, 고른 불편·리뷰는 화면 안 상태로.
export const dynamic = 'force-dynamic'

import { getReviewTexts, getV2Base } from '@/lib/v2/data'
import { ALL, BRANCHES, inScope, monthsOf, periodMonths, type Scope } from '@/lib/v2/metrics'
import DiscomfortConsole from '@/components/v2/DiscomfortConsole'

export default async function DiscomfortPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams
  const base = await getV2Base()
  const months = monthsOf(base.revs)
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined)
  const month = months.includes(str('month') ?? '') ? str('month')! : months[months.length - 1]
  const b = str('branch')
  const scope: Scope = b && (BRANCHES as readonly string[]).includes(b) ? (b as Scope) : ALL

  if (!month) {
    return <main className="v2-console"><div className="empty">{base.error ?? '아직 분석한 리뷰가 없습니다.'}</div></main>
  }

  const pm = periodMonths(scope, month)
  const revs = inScope(base.revs, scope, pm)
  const stars = inScope(base.stars, scope, pm)
  // 불편별 달 건수 막대용: 그 지점의 고른 달까지 최근 6개월 별(현상과 날짜만)
  const shown = months.slice(0, months.indexOf(month) + 1).slice(-6)
  const trendStars = inScope(base.stars, scope, shown).map(s => ({ phenomenon: s.phenomenon, date: s.date, branch: s.branch }))
  const texts = await getReviewTexts(revs.map(r => r.id))

  return (
    <DiscomfortConsole key={`${scope}-${month}`}
      scope={scope} month={month} months={months} periodMonths={pm} shownMonths={shown}
      revs={revs} stars={stars} trendStars={trendStars} texts={texts}
      initialTab={str('tab') === 'low' ? 'low' : str('tab') === 'reviews' ? 'reviews' : 'rank'}
      initialSel={str('p') ?? null}
      error={base.error}
    />
  )
}
