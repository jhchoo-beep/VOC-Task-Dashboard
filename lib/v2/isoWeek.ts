// ISO 주(월~일) 라벨 — V2 별·별자리의 「서로 다른 주」 판정에 쓴다.
//
// 🔴 주간 리포트의 버킷(lib/otaDetail.ts weekLabelOf, 화~월·끝 월요일 라벨)과는 다른 축이다.
//    별의 week 필드와 별자리 규칙(서로 다른 2주)은 이 ISO 주를 쓰고, 주간 리포트에 어느 주로
//    올릴지는 weekLabelOf를 그대로 쓴다. 두 축을 섞지 말 것 — 월요일 날짜의 별은 ISO로는 그 주,
//    주간 리포트로는 전 주(화~월)의 끝 날이다.
//
// 전부 UTC 자정으로 계산한다 — 로컬 시간대가 끼면 자정 근처 날짜가 하루 밀린다.

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' → 'YYYY-Www' (ISO 8601 주). 형식이 어긋나면 던진다. */
export function isoWeekOf(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) throw new Error(`isoWeekOf: 'YYYY-MM-DD' 형식이 아닙니다 (받은 값: "${isoDate}")`)
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const dow = d.getUTCDay() || 7            // 1=월 … 7=일
  d.setUTCDate(d.getUTCDate() + 4 - dow)    // 그 주의 목요일 — 목요일이 든 해가 ISO 연도
  const isoYear = d.getUTCFullYear()
  const jan1 = Date.UTC(isoYear, 0, 1)
  const week = Math.floor((d.getTime() - jan1) / 86_400_000 / 7) + 1
  return `${isoYear}-W${pad(week)}`
}
