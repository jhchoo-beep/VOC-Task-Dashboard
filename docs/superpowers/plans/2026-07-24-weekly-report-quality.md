# 주간 OTA 리포트 보고서 품질 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FO Weekly 화면 공유용으로 `/weekly-report`를 판정 카테고리 나열에서 논의 카드 한 벌로 재편하고, 결론 한 줄(`headline`)과 리뷰 원문 드릴다운을 붙인다.

**Architecture:** 판정 로직(`lib/weeklyReport.ts`의 `judgeWeek`·`pickBaseline`·`buildWeeklyReport` 골격)은 손대지 않는다. `ota_complaints`에 `headline` 컬럼을 더해 배치·수기 양쪽이 원인 한 줄을 저장하고, 화면은 저장값이 없는 과거 주를 4단계 폴백으로 받는다. 리뷰 원문은 서버(`getWeeklyReportProps`)가 미달 채널에 한해 프리로드해 내려보내므로 노션 임베드에서도 클라이언트 조회 없이 뜬다.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Supabase PostgreSQL · vitest · tsx (배치 스크립트)

**설계 정본:** `docs/superpowers/specs/2026-07-24-weekly-report-quality-design.md`
**선행 문서:** `.superpowers/sdd/weekly-report-logic.md` · `.superpowers/sdd/weekly-report-ui.md`

## Global Constraints

- **언어는 한국어.** 화면 문구·주석·커밋 메시지 전부 한국어로 쓴다.
- **`lib/weeklyReport.ts`의 판정 로직은 변경 금지** — `judgeWeek` · `pickBaseline` · `reviewCountOf` · `isThinSample` · `THIN_SAMPLE_MAX` · `listReportWeeks` · `weekLabel` · `monthBucketOf` 의 동작을 바꾸지 않는다. 기존 29개 테스트가 그대로 통과해야 한다.
- **`ota_complaints.memo`의 현재 형식 유지.** `headline`은 추가이지 대체가 아니다.
- **소급 마이그레이션 금지.** 과거 주의 `headline`은 NULL로 두고 화면 폴백으로 받는다.
- **최소 표본 컷을 도입하지 않는다.** `thinSample`은 표시 힌트이지 필터가 아니다.
- **리뷰 0건(`silent`)을 통과에 합치지 않는다.**
- 테스트는 `npm test`(vitest), 타입은 `npx tsc --noEmit`, 빌드는 `npm run build`.
- 이 repo 푸시는 `git -c credential.helper= -c credential.helper="!gh auth git-credential" push origin main` — 빈 헬퍼 리셋을 앞에 붙이지 않으면 manager가 먼저 실행돼 행이 걸린다.
- 커밋은 각 Task 끝에서 한 번씩. 푸시·배포는 Task 8에서만.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `docs/superpowers/migrations/2026-07-24-ota-complaints-headline.sql` | `headline` 컬럼 추가 DDL | 신규 |
| `app/api/ota/complaints/route.ts` | 수기 입력 저장 — `headline` 통과 | 수정 |
| `components/OtaScoresClient.tsx` | 데이터 입력 모달에 「한 줄 요약」 칸 | 수정 |
| `scripts/derive-ota-detail.ts` | `TextResult.headline` 검증·저장 | 수정 |
| `C:\Users\MGRV\.claude\commands\parse-reviews.md` | Part B 산출 규칙에 `headline` 추가 | 수정 |
| `lib/weeklyReport.ts` | `resolveHeadline` 폴백 + `WeeklyCause` 확장 | 수정 |
| `lib/weeklyReport.test.ts` | 폴백·cause 테스트 | 수정 |
| `lib/weeklyReviews.ts` | 드릴다운 순수 함수 — 버킷 리뷰 선별 + 번역 결합 | 신규 |
| `lib/weeklyReviews.test.ts` | 위 테스트 | 신규 |
| `lib/pageData.ts` | `getWeeklyReportProps`에 `headline` 컬럼 + 리뷰 프리로드 | 수정 |
| `components/WeeklyReportClient.tsx` | 논의 카드 화면 (전면 교체) | 수정 |

`app/(app)/weekly-report/page.tsx`와 `app/embed/weekly-report/page.tsx`는 **손대지 않는다** — 둘 다 `{...props}` 스프레드라 로더 반환값에 필드를 더하면 자동으로 흐른다.

---

## Task 1: `headline` 컬럼과 수기 입력 경로

**Files:**
- Create: `docs/superpowers/migrations/2026-07-24-ota-complaints-headline.sql`
- Modify: `app/api/ota/complaints/route.ts`
- Modify: `components/OtaScoresClient.tsx:1168`(상태) · `:1216`(전송) · `:1343`(입력 칸 근처)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `ota_complaints.headline TEXT` 컬럼. `POST /api/ota/complaints`가 `headline?: string` 바디 필드를 받아 저장한다.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`docs/superpowers/migrations/2026-07-24-ota-complaints-headline.sql`:

```sql
-- 주간 리포트의 결론 한 줄. memo(상세 서술)와 별개 필드다.
--
-- 왜 별도 컬럼인가: 회의 화면에 뜨는 한 줄을 memo에서 규칙으로 잘라 쓰면
-- LLM이 다음 달에 memo 형식을 바꾸는 순간 조용히 깨진다. 또 수기 memo는
-- 리뷰어별 서술 문단이라 애초에 자를 수 있는 구조가 아니다.
--
-- 작성 규칙: 원인만, 한 문장, 40자 내외. 처방·조치 문구를 넣지 않는다
-- ("~ 점검 필요", "~ 정비 필요"는 memo 쪽에 남긴다).
--
-- 과거 행은 NULL로 남긴다. 소급 채우기를 하지 않고 화면이 폴백으로 받는다
-- (lib/weeklyReport.ts resolveHeadline).
alter table ota_complaints add column if not exists headline text;
```

- [ ] **Step 2: Supabase에 적용**

Supabase MCP `apply_migration`(project_id `slyfyrkqfdkoaaochspa`, name `ota_complaints_headline`)으로 위 SQL을 실행한다.

확인:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'ota_complaints' and column_name = 'headline';
```

기대: 1행 `headline | text | YES`

- [ ] **Step 3: API 라우트에 `headline` 통과**

`app/api/ota/complaints/route.ts`의 구조분해와 upsert에 `headline`을 더한다.

```ts
const { propertyId, weekStart, granularity = 'week', roomComplaints, bathroomComplaints, memo, headline } = await req.json()
```

```ts
const { error } = await supabase.from('ota_complaints').upsert(
  { property_id: propertyId, week_start: weekStart, granularity, room_complaints: roomComplaints ?? 0, bathroom_complaints: bathroomComplaints ?? 0, memo: memo ?? '', headline: (headline ?? '').trim() || null, source: 'manual' },
  { onConflict: 'property_id,week_start,granularity' }
)
```

빈 문자열을 `null`로 접는다 — 빈 문자열이 저장되면 폴백이 안 걸려 결론 줄이 통째로 빈다.

- [ ] **Step 4: 입력 모달에 「한 줄 요약」 칸**

`components/OtaScoresClient.tsx`. `const [memo, setMemo] = useState('')` 바로 아래에 상태를 더한다.

```tsx
const [headline, setHeadline] = useState('')
```

전송 바디(`:1216` 근처)에 필드를 더한다.

```tsx
body: JSON.stringify({ propertyId, weekStart: date, granularity, roomComplaints: parseInt(roomComp)||0, bathroomComplaints: parseInt(bathComp)||0, memo, headline }),
```

메모 `<input>`(`:1343` 근처, placeholder `예: 3층 욕실 배수 점검 완료`) **바로 위**에 같은 형태의 칸을 넣는다. 라벨 마크업은 주변 필드와 동일한 패턴을 따른다.

```tsx
<input
  style={inputStyle}
  type="text"
  placeholder="한 줄 요약 — 원인만, 예: 욕실 배수 불량 수리 요청 후 미조치"
  value={headline}
  onChange={e => setHeadline(e.target.value)}
/>
```

모달을 닫거나 저장 성공 후 초기화하는 곳이 있으면 `setHeadline('')`도 함께 넣는다(`setMemo('')`를 호출하는 지점 전부).

- [ ] **Step 5: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 출력 없음(통과)

- [ ] **Step 6: 커밋**

```bash
git add docs/superpowers/migrations/2026-07-24-ota-complaints-headline.sql app/api/ota/complaints/route.ts components/OtaScoresClient.tsx
git commit -m "feat(ota): 불만 분석에 결론 한 줄(headline) 필드 추가"
```

---

## Task 2: 파생 배치가 `headline`을 산출·저장

**Files:**
- Modify: `scripts/derive-ota-detail.ts:588-596`(`TextResult`) · `:640-670`(검증·매핑) · `:735-738`(upsert)
- Modify: `C:\Users\MGRV\.claude\commands\parse-reviews.md`

**Interfaces:**
- Consumes: Task 1의 `ota_complaints.headline` 컬럼
- Produces: `--apply-text`가 읽는 결과 JSON이 항목마다 `headline?: string`을 받아 저장한다. `/parse-reviews` Part B가 이 필드를 산출한다.

- [ ] **Step 1: `TextResult`에 필드 추가**

`scripts/derive-ota-detail.ts`의 `interface TextResult`에 `memo` 바로 위 줄로 넣는다.

```ts
interface TextResult {
  propertyId: number
  weekStart: string
  granularity?: Granularity
  roomComplaints?: number
  bathroomComplaints?: number
  headline?: string
  memo?: string
  voc?: { band: string; sentiment: 'good' | 'bad'; keyword: string }[]
}
```

- [ ] **Step 2: 검증·매핑에 반영**

`runApplyText`의 `allRows` 매핑(`memo: r.memo ?? '',` 줄 근처)에 더한다.

```ts
      // 빈 문자열은 null로 접는다 — 화면 폴백(memo→키워드)이 걸리게 하려면
      // '값이 없다'가 빈 문자열이 아니라 null이어야 한다.
      headline: (r.headline ?? '').trim() || null,
      memo: r.memo ?? '',
```

- [ ] **Step 3: upsert에 반영**

`db.from('ota_complaints').upsert({...})` 호출(`:735` 근처)에 `headline: r.headline,`을 `memo: r.memo,` 옆에 더한다.

```ts
      const { error: cErr } = await db.from('ota_complaints').upsert({
        property_id: r.propertyId, week_start: r.weekStart, granularity: r.granularity,
        room_complaints: r.roomComplaints, bathroom_complaints: r.bathroomComplaints,
        headline: r.headline, memo: r.memo,
        source: 'derived',
      }, { onConflict: 'property_id,week_start,granularity' })
```

(기존 코드의 나머지 필드·옵션은 그대로 둔다. `source: 'derived'`가 이미 있으면 중복해 넣지 않는다.)

- [ ] **Step 4: dry-run으로 스크립트가 깨지지 않는지 확인**

`.env.local`의 `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 비어 있으므로 Supabase MCP `get_publishable_keys`로 조달해 인라인 export한 뒤 실행한다.

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<조달한 키> \
npx tsx scripts/derive-ota-detail.ts --weeks 4 --emit-text /tmp/emit.json --dry-run
```
Expected: `분석 대상 N개 버킷 · 리뷰 M건 → /tmp/emit.json` 출력. 에러 없이 종료.

- [ ] **Step 5: 스킬 Part B에 산출 규칙 추가**

`C:\Users\MGRV\.claude\commands\parse-reviews.md`의 Part B(불만 분석 결과 JSON 스키마를 설명하는 부분)에 `headline` 항목을 더한다. 다음 문구를 그대로 넣는다.

```markdown
- `headline` (문자열, 필수) — 그 버킷의 **결론 한 줄**. 주간 리포트 회의 화면에
  그대로 뜨는 문장이다.
  - **원인만 쓴다.** "~ 점검 필요"·"~ 정비 필요" 같은 처방·조치 문구를 넣지 않는다
    (그건 `memo` 쪽에 남긴다). AI는 사실을 압축할 뿐 해야 할 일을 지어내지 않는다.
  - 한 문장, 40자 내외. 마침표 없이 명사형으로 끝낸다.
  - 불만이 여러 건이면 **가장 낮은 평점의 건**을 쓴다. 나열하지 않는다.
  - 그 버킷에 불만이 없으면 빈 문자열로 둔다.
  - 예: `투숙객 주차 유료 정책 예약 단계 고지 부재` / `샤워 시 물이 차오르는 객실 배수 불량`
```

- [ ] **Step 6: 타입 확인 후 커밋**

Run: `npx tsc --noEmit`
Expected: 출력 없음

```bash
git add scripts/derive-ota-detail.ts
git commit -m "feat(derive-ota-detail): 불만 분석에 결론 한 줄(headline) 산출·저장"
```

`parse-reviews.md`는 볼트(`C:\Users\MGRV\.claude`) 쪽 파일이라 이 repo 커밋에 포함되지 않는다. 볼트는 자체 백업 스케줄러가 가져간다.

---

## Task 3: `resolveHeadline` 폴백과 `WeeklyCause` 확장

**Files:**
- Modify: `lib/weeklyReport.ts` — `ComplaintRow`(:44-49) · `WeeklyCause`(:99-104) · cause 조립 블록(:271-281)
- Modify: `lib/weeklyReport.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ota_complaints.headline`
- Produces:
  ```ts
  export const HEADLINE_MAX = 60
  export type HeadlineSource = 'headline' | 'memoHead' | 'keywords'
  export function resolveHeadline(
    headline: string | null | undefined,
    memo: string | null | undefined,
    badKeywords: string[],
  ): { headline: string | null; headlineSource: HeadlineSource | null }
  export interface WeeklyCause {
    headline: string | null
    headlineSource: HeadlineSource | null
    detail: string | null
    badKeywords: string[]
    hasCause: boolean
  }
  export interface ComplaintRow {
    property_id: number
    week_start: string
    granularity: Granularity
    headline: string | null
    memo: string | null
  }
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/weeklyReport.test.ts` 맨 아래에 붙인다. import 줄에 `resolveHeadline`을 더한다.

```ts
describe('resolveHeadline — 저장된 한 줄이 없으면 순서대로 내려간다', () => {
  it('headline이 있으면 그대로 쓴다', () => {
    expect(resolveHeadline('주차비 사전 고지 부재', '아주 긴 memo 전문 — 처방', ['키워드']))
      .toEqual({ headline: '주차비 사전 고지 부재', headlineSource: 'headline' })
  })

  it('headline이 없으면 memo의 첫 em dash 앞부분을 쓴다', () => {
    // 실측(제주시티 Agoda 2026-07-20). 뒤쪽 '— … 정비 필요'는 처방이라 결론에서 뺀다.
    const memo = '투숙객 주차 유료(1박 15,000원) 예약 단계 사전 고지 부재 — 현장 응대·사후 CS 통화까지 이어진 저평점 컴플레인 1건, 고지 문구 및 응대 스크립트 정비 필요'
    expect(resolveHeadline(null, memo, ['주차비 유료 정책'])).toEqual({
      headline: '투숙객 주차 유료(1박 15,000원) 예약 단계 사전 고지 부재',
      headlineSource: 'memoHead',
    })
  })

  it('em dash가 없는 memo는 전문을 60자로 자른다', () => {
    // 실측(신설 Agoda 2026-07-13 수기). 리뷰어별 서술 문단이라 자르지 않으면 결론 줄이 무너진다.
    const memo = 'YURI(일본, 3박, 8.0): 이른 아침 도착 시 체크인 에러 발생 — 상주 스태프가 현장 대응해 해결. 엘리베이터 탑승 대기 시간이 다소 길고 설비는 미니멀하다는 언급'
    const r = resolveHeadline(null, memo, [])
    expect(r.headlineSource).toBe('memoHead')
    expect(r.headline!.length).toBeLessThanOrEqual(61)   // 60자 + '…'
    expect(r.headline!.endsWith('…')).toBe(true)
  })

  it('memo 전문에 줄바꿈이 있어도 한 줄로 접는다', () => {
    const r = resolveHeadline(null, '첫 줄\n둘째 줄', [])
    expect(r.headline).toBe('첫 줄 둘째 줄')
  })

  it('memo가 비면 bad 키워드 상위 2개를 쓴다', () => {
    // 실측(동대문 Expedia 2026-07-20)은 memo가 빈 문자열이다.
    expect(resolveHeadline(null, '', ['욕실 협소', '침대 불편', '베개 납작함'])).toEqual({
      headline: '욕실 협소 · 침대 불편',
      headlineSource: 'keywords',
    })
  })

  it('셋 다 없으면 null — 원인 미기록이 실재 상태다', () => {
    // 실측(신설 Trip.com 2026-07-20): 6.00 vs 8.70인데 메모도 bad 키워드도 없다.
    expect(resolveHeadline(null, null, [])).toEqual({ headline: null, headlineSource: null })
  })

  it('공백만 있는 headline은 값이 없는 것으로 본다', () => {
    expect(resolveHeadline('   ', '', ['욕실 협소']).headlineSource).toBe('keywords')
  })
})

describe('buildWeeklyReport — cause', () => {
  it('미달 행의 cause가 headline·detail·키워드를 모두 싣는다', () => {
    const report = buildWeeklyReport({
      weekStart: '2026-07-20',
      properties: [{ property_id: 1, branch: '동대문', ota_name: 'Agoda', score_max: 10 }],
      dist: [{ property_id: 1, week_start: '2026-07-20', granularity: 'week', source: 'derived', weekly_avg_score: 8.0, score_8: 3 }],
      scores: [{ property_id: 1, overall_score: 8.9, review_count: 100, recorded_at: '2026-07-20' }],
      complaints: [{ property_id: 1, week_start: '2026-07-20', granularity: 'week', headline: '욕실 배수 불량 수리 요청 후 미조치', memo: '샤워 시 물이 차오르는 객실 배수 불량 — 대상 호실 특정 필요' }],
      voc: [{ property_id: 1, week_start: '2026-07-20', granularity: 'week', sentiment: 'bad', keyword: '욕실 배수 불량', band: '6점대 이하' }],
    })
    const row = report.below[0]
    expect(row.cause).toEqual({
      headline: '욕실 배수 불량 수리 요청 후 미조치',
      headlineSource: 'headline',
      detail: '샤워 시 물이 차오르는 객실 배수 불량 — 대상 호실 특정 필요',
      badKeywords: ['욕실 배수 불량'],
      hasCause: true,
    })
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/weeklyReport.test.ts`
Expected: FAIL — `resolveHeadline is not a function` 및 `cause` 비교 불일치. 기존 테스트 중 `cause.memo`를 참조하던 것들도 함께 실패할 수 있다(다음 스텝에서 정리한다).

- [ ] **Step 3: `resolveHeadline` 구현**

`lib/weeklyReport.ts`의 `WeeklyCause` 정의를 아래로 교체한다(위 주석 블록은 유지하고 인터페이스만 바꾼다).

```ts
// 결론 한 줄이 어디서 왔는가. 화면이 근사도를 알 필요는 없지만, 폴백이 걸린 주를
// 디버깅할 때 '저장된 값이 없어서 memo를 잘랐다'가 데이터로 남아 있어야 한다.
export type HeadlineSource = 'headline' | 'memoHead' | 'keywords'

// 한 줄이 이보다 길면 회의 화면에서 두 줄로 접히고, 그 순간 카드가 목록이 된다.
export const HEADLINE_MAX = 60

export interface WeeklyCause {
  headline: string | null              // 결론 자리에 그대로 출력
  headlineSource: HeadlineSource | null
  detail: string | null                // memo 전문 — 펼침 안
  badKeywords: string[]                // 펼침 안 보조
  hasCause: boolean
}

/** 여러 줄·연속 공백을 한 칸으로 접고, max를 넘으면 잘라 '…'을 붙인다. */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.substring(0, max) + '…'
}

/**
 * 결론 한 줄을 고른다. 저장된 headline이 없는 과거 주를 깨뜨리지 않기 위한 폴백이다.
 *
 * 1) headline 이 있으면 그대로
 * 2) memo 의 첫 '—'(em dash) 앞부분 — 파생 배치가 「원인 — 처방」으로 쓰므로 앞이 원인이다
 * 3) bad 키워드 상위 2개
 * 4) 없음 → 원인 미기록
 *
 * 🔴 2)를 정본으로 삼지 말 것. LLM이 memo 형식을 바꾸면 조용히 깨지고, 수기 memo는
 *    애초에 '—' 구조가 아닌 리뷰어별 서술 문단이다. 그래서 headline 컬럼을 만들었다.
 *    여기서는 잘라서라도 한 줄을 만들어 과거 주가 빈 카드로 뜨지 않게만 한다.
 */
export function resolveHeadline(
  headline: string | null | undefined,
  memo: string | null | undefined,
  badKeywords: string[],
): { headline: string | null; headlineSource: HeadlineSource | null } {
  const h = (headline ?? '').trim()
  if (h) return { headline: oneLine(h, HEADLINE_MAX), headlineSource: 'headline' }

  const m = (memo ?? '').trim()
  if (m) {
    // '—'로 시작하는 memo면 앞부분이 빈 문자열이 된다 — 그때는 전문을 쓴다.
    const head = m.split('—')[0].trim() || m
    return { headline: oneLine(head, HEADLINE_MAX), headlineSource: 'memoHead' }
  }

  const k = badKeywords.map(s => s.trim()).filter(Boolean).slice(0, 2)
  if (k.length > 0) return { headline: k.join(' · '), headlineSource: 'keywords' }

  return { headline: null, headlineSource: null }
}
```

- [ ] **Step 4: `ComplaintRow`에 `headline` 추가**

```ts
export interface ComplaintRow {
  property_id: number
  week_start: string
  granularity: Granularity
  headline: string | null
  memo: string | null
}
```

- [ ] **Step 5: cause 조립 블록 교체**

`lib/weeklyReport.ts`의 `if (verdict === 'below') { ... }` 블록을 아래로 바꾼다.

```ts
  let cause: WeeklyCause | null = null
  if (verdict === 'below') {
    const detail = (complaint?.memo ?? '').trim() || null
    const badKeywords = [...new Set(
      vocRows
        .filter(v => v.sentiment === 'bad')
        .map(v => (v.keyword ?? '').trim())
        .filter(Boolean)
    )]
    const { headline, headlineSource } = resolveHeadline(complaint?.headline, detail, badKeywords)
    cause = { headline, headlineSource, detail, badKeywords, hasCause: headline !== null }
  }
```

`hasCause`의 의미는 그대로다 — memo나 키워드 중 하나라도 있으면 `resolveHeadline`이 한 줄을 만들어 내므로 `headline !== null`과 종전 조건이 같은 집합이다.

- [ ] **Step 6: 기존 테스트의 `cause.memo` 참조를 고친다**

Run: `npx vitest run lib/weeklyReport.test.ts`

`cause.memo`를 읽는 기존 단언을 `cause.detail`로 바꾸고, `hasCause`를 검사하던 테스트는 그대로 둔다. 판정·정렬·요약을 검사하는 테스트는 건드리지 않는다.

- [ ] **Step 7: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 6 파일 전부 통과. 기존 203 + 신규 8 = 211건 이상.

- [ ] **Step 8: 커밋**

```bash
git add lib/weeklyReport.ts lib/weeklyReport.test.ts
git commit -m "feat(weekly-report): 결론 한 줄 폴백(resolveHeadline)과 cause 확장"
```

---

## Task 4: 리뷰 원문 선별·번역 결합 순수 함수

**Files:**
- Create: `lib/weeklyReviews.ts`
- Create: `lib/weeklyReviews.test.ts`

**Interfaces:**
- Consumes: `lib/otaDetail.ts`의 `parseRawDate` · `weekStartOf` · `OTA_SITE_BY_NAME` · `Granularity`
- Produces:
  ```ts
  export interface RawReviewRow { id: string; branch: string; ota_site: string; review_month: string | null; raw_date: string | null; rating: number | string | null; country: string | null; room_type: string | null; content: string | null }
  export interface TranslatedRow { branch: string; ota_site: string; content: string | null; content_ko: string | null }
  export interface WeeklyReviewItem { id: string; rating: number | null; country: string | null; roomType: string | null; date: string | null; body: string; translated: boolean }
  export interface ChannelReviews { propertyId: number; items: WeeklyReviewItem[]; expectedCount: number }
  export function translationKey(content: string | null | undefined): string
  export function selectBucketReviews(rows: RawReviewRow[], branch: string, otaName: string, bucket: string, granularity: Granularity): RawReviewRow[]
  export function buildChannelReviews(rows: RawReviewRow[], translations: TranslatedRow[], target: { propertyId: number; branch: string; otaName: string; weekStart: string; granularity: Granularity; reviewCount: number }): ChannelReviews
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/weeklyReviews.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { translationKey, selectBucketReviews, buildChannelReviews } from './weeklyReviews'
import type { RawReviewRow, TranslatedRow } from './weeklyReviews'

// 실측(2026-07-20 주차). ota_site는 한글명이고 ota_properties.ota_name은 영문이다.
const RAW: RawReviewRow[] = [
  { id: 'a', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 4.0, country: 'South Korea', room_type: 'Single', content: '배수 확인 꼭 해주세요\n샤워하면 물이 차오릅니다' },
  { id: 'b', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 10.0, country: 'Taiwan', room_type: 'single room', content: '整體來說是個很不錯的住宿地方' },
  { id: 'c', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-27', rating: 9.0, country: 'Japan', room_type: 'Twin', content: '다음 주 리뷰' },
  { id: 'd', branch: '신설',   ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-21', rating: 8.0, country: 'Japan', room_type: 'Suite', content: '다른 지점' },
  { id: 'e', branch: '동대문', ota_site: '트립닷컴', review_month: '2026-07', raw_date: '2026-07-21', rating: 9.5, country: 'Korea', room_type: 'Dorm', content: '다른 채널' },
]

describe('selectBucketReviews', () => {
  it('주 버킷: 같은 지점·채널의 그 주 리뷰만 고른다', () => {
    const got = selectBucketReviews(RAW, '동대문', 'Agoda', '2026-07-20', 'week')
    expect(got.map(r => r.id).sort()).toEqual(['a', 'b'])
  })

  it('다음 주 리뷰(07-27)는 07-20 버킷에 들어가지 않는다', () => {
    const got = selectBucketReviews(RAW, '동대문', 'Agoda', '2026-07-20', 'week')
    expect(got.some(r => r.id === 'c')).toBe(false)
  })

  it('월 버킷: 일 단위 날짜가 없어도 그 달이면 포함한다', () => {
    const monthly: RawReviewRow[] = [
      { id: 'm1', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: '2026년 7월', rating: 5, country: null, room_type: null, content: '월 단위' },
      { id: 'm2', branch: '신설', ota_site: '에어비앤비', review_month: '2026-06', raw_date: '2026년 6월', rating: 4, country: null, room_type: null, content: '지난달' },
    ]
    const got = selectBucketReviews(monthly, '신설', 'Airbnb', '2026-07-01', 'month')
    expect(got.map(r => r.id)).toEqual(['m1'])
  })

  it('raw_date가 비면 review_month로 폴백해 월 버킷에는 잡힌다', () => {
    const rows: RawReviewRow[] = [
      { id: 'x', branch: '신설', ota_site: '에어비앤비', review_month: '2026-07', raw_date: null, rating: 5, country: null, room_type: null, content: '날짜 없음' },
    ]
    expect(selectBucketReviews(rows, '신설', 'Airbnb', '2026-07-01', 'month').map(r => r.id)).toEqual(['x'])
    // 주 버킷은 일 단위가 없으면 어느 주인지 알 수 없으므로 넣지 않는다
    expect(selectBucketReviews(rows, '신설', 'Airbnb', '2026-07-20', 'week')).toEqual([])
  })

  it('알 수 없는 채널명이면 빈 배열 — 잘못된 매핑으로 남의 리뷰를 끌어오지 않는다', () => {
    expect(selectBucketReviews(RAW, '동대문', '없는채널', '2026-07-20', 'week')).toEqual([])
  })
})

describe('translationKey', () => {
  it('공백·개행을 지우고 앞 60자로 키를 만든다', () => {
    expect(translationKey('배수 확인 꼭 해주세요\n샤워하면 물이 차오릅니다'))
      .toBe(translationKey('배수 확인 꼭 해주세요 샤워하면 물이 차오릅니다'))
  })

  it('빈 본문은 빈 키 — 빈 키끼리 매칭되면 안 되므로 소비자가 걸러야 한다', () => {
    expect(translationKey(null)).toBe('')
    expect(translationKey('   ')).toBe('')
  })
})

describe('buildChannelReviews', () => {
  const TRANS: TranslatedRow[] = [
    { branch: '동대문', ota_site: '아고다', content: '整體來說是個很不錯的住宿地方', content_ko: '전반적으로 아주 괜찮은 숙소였어요' },
  ]
  const target = { propertyId: 3, branch: '동대문', otaName: 'Agoda', weekStart: '2026-07-20', granularity: 'week' as const, reviewCount: 3 }

  it('저평점 순으로 정렬한다', () => {
    const got = buildChannelReviews(RAW, TRANS, target)
    expect(got.items.map(i => i.rating)).toEqual([4, 10])
  })

  it('번역본이 있으면 그것을 쓰고 translated=true', () => {
    const got = buildChannelReviews(RAW, TRANS, target)
    const zh = got.items.find(i => i.id === 'b')!
    expect(zh.body).toBe('전반적으로 아주 괜찮은 숙소였어요')
    expect(zh.translated).toBe(true)
  })

  it('번역본이 없으면 원문 그대로, translated=false', () => {
    const got = buildChannelReviews(RAW, TRANS, target)
    const ko = got.items.find(i => i.id === 'a')!
    expect(ko.body.startsWith('배수 확인 꼭 해주세요')).toBe(true)
    expect(ko.translated).toBe(false)
  })

  it('expectedCount는 판정이 쓴 건수 그대로 — 커버리지 미달을 화면이 고지할 수 있어야 한다', () => {
    // 아고다는 raw 커버리지가 31% 수준이라 '3건 8.0'인데 원문이 2건만 잡힌다.
    const got = buildChannelReviews(RAW, TRANS, target)
    expect(got.expectedCount).toBe(3)
    expect(got.items.length).toBe(2)
  })

  it('빈 본문끼리는 번역 매칭되지 않는다', () => {
    const rows: RawReviewRow[] = [
      { id: 'n', branch: '동대문', ota_site: '아고다', review_month: '2026-07', raw_date: '2026-07-20', rating: 5, country: null, room_type: null, content: null },
    ]
    const trans: TranslatedRow[] = [{ branch: '동대문', ota_site: '아고다', content: null, content_ko: '엉뚱한 번역' }]
    const got = buildChannelReviews(rows, trans, { ...target, reviewCount: 1 })
    expect(got.items[0].translated).toBe(false)
    expect(got.items[0].body).toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/weeklyReviews.test.ts`
Expected: FAIL — `Failed to resolve import "./weeklyReviews"`

- [ ] **Step 3: `lib/weeklyReviews.ts` 구현**

```ts
// 주간 리포트의 리뷰 원문 드릴다운 — 순수 함수. DB 무관.
//
// 🔴 버킷 매칭은 반드시 파생 배치와 같은 파서·같은 채널명 맵을 쓴다.
//    화면이 자기만의 매칭 규칙을 만들면 "3건 8.0"이라고 써 놓고 다른 3건을 띄운다.
//    weekly_avg_score를 만든 코드가 쓰는 것: parseRawDate · weekStartOf · OTA_SITE_BY_NAME.
//
// 🔴 OtaScoresClient의 OTA_SITE_ALIAS(NOL: ['NOL','야놀자'])를 쓰지 말 것 — 그건 표기가
//    갈리는 채널을 넓게 잡는 별개 용도라, 이쪽을 쓰면 배치가 세지 않은 행이 화면에만 뜬다.

// 상대 경로로 가져온다 — vitest는 '@/' 별칭을 풀지 않는다.
import type { Granularity } from './otaDetail'
import { parseRawDate, weekStartOf, OTA_SITE_BY_NAME } from './otaDetail'

export interface RawReviewRow {
  id: string
  branch: string
  ota_site: string
  review_month: string | null
  raw_date: string | null
  rating: number | string | null
  country: string | null
  room_type: string | null
  content: string | null
}

// reviews 테이블에서 번역본만 끌어온다. content 원문이 raw_reviews와 동일하게 들어 있어
// 이것이 조인 키가 된다(리뷰 단위 ID를 공유하는 컬럼이 없다).
export interface TranslatedRow {
  branch: string
  ota_site: string
  content: string | null
  content_ko: string | null
}

export interface WeeklyReviewItem {
  id: string
  rating: number | null
  country: string | null
  roomType: string | null
  date: string | null       // 월 입도 채널은 null
  body: string
  translated: boolean       // false = 원문 그대로(번역 없음을 화면이 밝힌다)
}

export interface ChannelReviews {
  propertyId: number
  items: WeeklyReviewItem[]
  expectedCount: number     // 판정이 쓴 reviewCount. items.length보다 클 수 있다
}

const TRANSLATION_KEY_LEN = 60

/** 공백·개행을 지우고 앞 60자. 두 표의 content가 같은 리뷰를 잇는 키다. */
export function translationKey(content: string | null | undefined): string {
  return (content ?? '').replace(/\s+/g, '').substring(0, TRANSLATION_KEY_LEN)
}

const numOrNull = (v: unknown): number | null => {
  // 🔴 Number(null)과 Number('')는 둘 다 0이다. 먼저 걸러내지 않으면 평점 없는 리뷰가
  //    0점으로 둔갑해 정렬 맨 앞 — '가장 나쁘 리뷰' 자리를 차지한다.
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 그 버킷·그 채널의 raw 리뷰만 고른다. */
export function selectBucketReviews(
  rows: RawReviewRow[],
  branch: string,
  otaName: string,
  bucket: string,
  granularity: Granularity,
): RawReviewRow[] {
  const site = OTA_SITE_BY_NAME[otaName]
  if (!site) return []          // 모르는 채널이면 아무것도 고르지 않는다
  const bucketMonth = bucket.substring(0, 7)

  return rows.filter(r => {
    if (r.branch !== branch || r.ota_site !== site) return false
    const { date, month } = parseRawDate(r.raw_date, r.review_month)
    if (granularity === 'month') return month === bucketMonth
    // 주 버킷은 일 단위가 있어야 어느 주인지 정해진다
    return date != null && weekStartOf(date) === bucket
  })
}

/** 버킷 리뷰를 저평점 순으로 정렬하고 번역본을 붙인다. */
export function buildChannelReviews(
  rows: RawReviewRow[],
  translations: TranslatedRow[],
  target: {
    propertyId: number
    branch: string
    otaName: string
    weekStart: string
    granularity: Granularity
    reviewCount: number
  },
): ChannelReviews {
  const picked = selectBucketReviews(rows, target.branch, target.otaName, target.weekStart, target.granularity)

  const site = OTA_SITE_BY_NAME[target.otaName]
  const koByKey = new Map<string, string>()
  for (const t of translations) {
    if (t.branch !== target.branch || t.ota_site !== site) continue
    const key = translationKey(t.content)
    const ko = (t.content_ko ?? '').trim()
    // 빈 키는 담지 않는다 — 본문 없는 행끼리 매칭돼 엉뚱한 번역이 붙는다.
    if (!key || !ko) continue
    if (!koByKey.has(key)) koByKey.set(key, ko)
  }

  const items: WeeklyReviewItem[] = picked.map(r => {
    const original = (r.content ?? '').trim()
    const ko = koByKey.get(translationKey(original))
    // 원문과 번역본이 같은 문자열이면(한국어 리뷰) 번역했다고 표시하지 않는다.
    const isTranslated = ko != null && ko !== original
    return {
      id: r.id,
      rating: numOrNull(r.rating),
      country: r.country,
      roomType: r.room_type,
      date: parseRawDate(r.raw_date, r.review_month).date,
      body: isTranslated ? ko! : original,
      translated: isTranslated,
    }
  })

  // 저평점 먼저. 평점이 없는 행은 뒤로 보낸다(정렬 기준이 없는 행이 맨 앞을 차지하면
  // 가장 나쁜 리뷰가 밀려난다).
  items.sort((a, b) => {
    // 둘 다 없으면 동순위(0)여야 한다 — 여기서 1을 돌려주면 compare(a,b)와
    // compare(b,a)가 모두 1이 되어 비교가 비대칭이 된다.
    if (a.rating == null && b.rating == null) return 0
    if (a.rating == null) return 1
    if (b.rating == null) return -1
    return a.rating - b.rating
  })

  return { propertyId: target.propertyId, items, expectedCount: target.reviewCount }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/weeklyReviews.test.ts`
Expected: PASS — 11건 전부

- [ ] **Step 5: 전체 테스트·타입 확인**

Run: `npm test && npx tsc --noEmit`
Expected: 7 파일 통과, 타입 출력 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/weeklyReviews.ts lib/weeklyReviews.test.ts
git commit -m "feat(weekly-report): 리뷰 원문 드릴다운 선별·번역 결합 로직"
```

---

## Task 5: 로더가 `headline`과 리뷰 원문을 실어 내린다

**Files:**
- Modify: `lib/pageData.ts:453-492` (`getWeeklyReportProps`)

**Interfaces:**
- Consumes: Task 3의 `ComplaintRow.headline`, Task 4의 `buildChannelReviews` · `ChannelReviews` · `RawReviewRow` · `TranslatedRow`
- Produces:
  ```ts
  const getWeeklyReportProps: (week?: string) => Promise<{
    report: WeeklyReport | null
    week: string
    weeks: string[]
    reviews: Record<number, ChannelReviews>   // propertyId → 그 버킷 리뷰. 미달 채널만
  }>
  ```

- [ ] **Step 1: 불만 조회에 `headline` 컬럼 추가**

`getWeeklyReportProps`의 `fetchAllRows('ota_complaints', ...)` 줄에서 컬럼 목록에 `headline`을 더한다.

```ts
    fetchAllRows('ota_complaints', 'property_id,week_start,granularity,headline,memo', q => q.order('week_start', { ascending: true })),
```

- [ ] **Step 2: import 추가**

`lib/pageData.ts` 상단의 `@/lib/weeklyReport` import 옆에 더한다.

```ts
import { buildChannelReviews } from '@/lib/weeklyReviews'
import type { ChannelReviews, RawReviewRow, TranslatedRow } from '@/lib/weeklyReviews'
```

- [ ] **Step 3: 리뷰 프리로드 로직**

`report`를 만든 뒤 `return` 하기 전에 넣는다. 기존 `return { report: buildWeeklyReport({...}), week: target, weeks }`를 아래로 교체한다.

```ts
  const report = buildWeeklyReport({
    weekStart:  target,
    properties: (propsRaw ?? []) as PropertyRow[],
    dist,
    scores:     (scoresRaw ?? []) as ScoreSnapshotRow[],
    complaints: (complaintsRaw ?? []) as ComplaintRow[],
    voc:        (vocRaw ?? []) as VocRow[],
  })

  // 리뷰 원문은 미달 채널에만 붙인다. 통과 채널까지 끌어오면 raw_reviews 1.2만 행에서
  // 필요 없는 범위를 매주 읽게 되고, 화면은 그걸 쓰지도 않는다.
  //
  // 🔴 클라이언트 조회로 만들지 말 것 — 노션 임베드는 인증 API를 타지 못한다.
  //    서버가 미리 실어 내려야 임베드에서도 보인다(진행사항 로그에서 겪은 것과 같은 함정).
  const drillTargets = [...report.below, ...report.monthly.filter(r => r.verdict === 'below')]
  const reviews: Record<number, ChannelReviews> = {}

  if (drillTargets.length > 0) {
    const branches = [...new Set(drillTargets.map(r => r.branch))]
    // 주 버킷은 두 달에 걸칠 수 있다 — 시작월과 종료월을 모두 넣는다.
    const months = [...new Set(drillTargets.flatMap(r => [r.weekStart.substring(0, 7), r.bucketEnd.substring(0, 7)]))]

    const [rawRows, transRows] = await Promise.all([
      fetchAllRows(
        'raw_reviews',
        'id,branch,ota_site,review_month,raw_date,rating,country,room_type,content',
        q => q.in('branch', branches).in('review_month', months),
      ),
      fetchAllRows(
        'reviews',
        'branch,ota_site,content,content_ko',
        q => q.in('branch', branches).in('review_month', months),
      ),
    ])

    for (const row of drillTargets) {
      reviews[row.propertyId] = buildChannelReviews(
        (rawRows ?? []) as RawReviewRow[],
        (transRows ?? []) as TranslatedRow[],
        {
          propertyId: row.propertyId,
          branch: row.branch,
          otaName: row.otaName,
          weekStart: row.weekStart,
          granularity: row.granularity,
          reviewCount: row.reviewCount,
        },
      )
    }
  }

  return { report, week: target, weeks, reviews }
```

- [ ] **Step 4: 데이터 없는 주의 조기 반환에도 `reviews`를 넣는다**

같은 함수 위쪽의 조기 반환을 고친다.

```ts
  if (!target || !weeks.includes(target)) {
    return { report: null, week: target, weeks, reviews: {} }
  }
```

- [ ] **Step 5: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 출력 없음(통과).

두 페이지가 `<WeeklyReportClient {...props} />`로 넘기는데 `props`는 객체 리터럴이 아니라 변수라, TypeScript의 초과 프로퍼티 검사가 적용되지 않는다 — 클라이언트가 아직 `reviews`를 안 받아도 이 시점에서 에러가 나지 않는다. 만약 에러가 난다면 그건 `WeeklyReportClient` 외의 파일 문제이므로 그 자리에서 고친다.

- [ ] **Step 6: 실데이터로 로더를 직접 호출해 검증**

`tmp-loader-check.ts`를 repo 루트에 만든다.

```ts
import { getWeeklyReportProps } from './lib/pageData'

const { report, reviews } = await getWeeklyReportProps('2026-07-20')
if (!report) throw new Error('report 없음')
for (const r of report.below) {
  const cr = reviews[r.propertyId]
  console.log(
    `${r.branch} ${r.otaName} | 판정건수 ${r.reviewCount} · 원문 ${cr?.items.length ?? 0}건 ` +
    `| headline(${r.cause?.headlineSource ?? '-'}) ${r.cause?.headline ?? '원인 미기록'}`
  )
  for (const it of cr?.items ?? []) {
    console.log(`    ${it.rating} ${it.country ?? '-'} ${it.date ?? '-'} ` +
      `${it.translated ? '[번역]' : '[원문]'} ${it.body.replace(/\s+/g, ' ').substring(0, 40)}`)
  }
}
```

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase MCP get_publishable_keys로 조달> \
npx tsx tmp-loader-check.ts
```

Expected: 미달 4채널이 출력되고 —
- 동대문 Agoda가 `판정건수 3 · 원문 3건` (07-20 주는 07-26까지다 — 07-20 두 건 + 07-22 한 건. `ota_score_dist`가 `score_4=1, score_10=2, avg 8.00`이라 `(4+10+10)/3`으로 일치한다. 이 채널은 커버리지 갭이 없어 「원문 확보 N/M건」 문구가 뜨지 않는다)
- 동대문 Agoda 원문에 `4 South Korea 2026-07-20 [원문] 배수 확인 꼭 해주세요 …`
- 동대문 Expedia 원문에 `[번역] 방은 아주 깨끗했지만 욕실이 좀 작았어요 …`(중국어 원문 `房間很乾淨…`의 번역)
- 제주시티 Agoda 원문에 `4.4 South Korea 2026-07-21 [원문] 투숙객에게 주차비용을 받는 숙소는 처음입니다 …`
- 모든 `headlineSource`가 `memoHead` 또는 `keywords`(이 주에는 저장된 `headline`이 없다)
- 신설 Trip.com은 `원인 미기록`

기대와 다르면 다음 태스크로 넘어가지 말고 원인을 찾는다.

- [ ] **Step 7: 임시 파일 삭제 후 커밋**

```bash
rm tmp-loader-check.ts
git add lib/pageData.ts
git commit -m "feat(weekly-report): 미달 채널 리뷰 원문 프리로드"
```

---

## Task 6: 논의 카드 화면

**Files:**
- Modify: `components/WeeklyReportClient.tsx` (전면 교체)

**Interfaces:**
- Consumes: Task 3의 `WeeklyCause`(`headline`·`detail`·`badKeywords`·`hasCause`), Task 5의 `reviews: Record<number, ChannelReviews>`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 파일 전체를 아래로 교체**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { ESTIMATOR_LABEL, type WeeklyReport, type WeeklyChannelRow } from '@/lib/weeklyReport'
import type { ChannelReviews } from '@/lib/weeklyReviews'

// FO Weekly 회의 중 노션 임베드로 화면 공유하며 읽는 보고서다. 설계 정본은
// docs/superpowers/specs/2026-07-24-weekly-report-quality-design.md.
//
//   · 논의 카드 한 벌이 화면의 전부다. 통과·월단위·리뷰0건은 맨 아래 한 줄로 접는다.
//     (숨기는 게 아니라 접는다 — '리뷰 0건은 통과가 아니다'가 숫자로 남아야 한다.)
//   · 접힌 카드의 숫자는 셋뿐이다: 누적 → 그 주, 건수. 나머지는 펼침 안으로.
//   · 지점 순서는 고정한다. 격차 순으로 정렬하면 매주 자리가 바뀌어 회의에서 찾게 된다.
//   · 타이포는 프로젝터 기준이다. 11~13px은 회의실 화면에서 읽히지 않는다.

const BRANCH_ORDER = ['신설', '동대문', '제주시티', '고성']
const BRANCH_COLOR: Record<string, string> = {
  신설: 'var(--sinseol)', 동대문: 'var(--ddm)', 제주시티: 'var(--jeju)', 고성: 'var(--goseong)',
}
const branchColor = (b: string) => BRANCH_COLOR[b] ?? 'var(--text-3)'

const fmt = (n: number) => n.toFixed(1)
const trim = (n: number) => String(Number(n.toFixed(2)))
const signed = (n: number) => (n > 0 ? '+' : '') + trim(n)

/** 지점 고정 순 → 지점 안에서 격차 큰(음수 큰) 순. */
function orderForMeeting(rows: WeeklyChannelRow[]): WeeklyChannelRow[] {
  const rank = (b: string) => {
    const i = BRANCH_ORDER.indexOf(b)
    return i === -1 ? BRANCH_ORDER.length : i   // 모르는 지점은 맨 뒤
  }
  return [...rows].sort((a, b) => {
    if (rank(a.branch) !== rank(b.branch)) return rank(a.branch) - rank(b.branch)
    return (a.gap ?? 0) - (b.gap ?? 0)
  })
}

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  const color = tone === 'warn' ? 'var(--medium)' : 'var(--text-3)'
  return (
    <span style={{
      fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 10,
      padding: '2px 8px', whiteSpace: 'nowrap', opacity: 0.9,
    }}>{children}</span>
  )
}

function ratingColor(r: number | null) {
  if (r == null) return 'var(--text-3)'
  if (r >= 9) return 'var(--done)'
  if (r >= 7) return 'var(--medium)'
  if (r >= 5) return 'var(--high)'
  return 'var(--critical)'
}

// ─── 리뷰 원문 ────────────────────────────────────────────────────────────────
function ReviewList({ cr }: { cr: ChannelReviews | undefined }) {
  if (!cr || cr.items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
        원문을 찾지 못했습니다 — 수집 커버리지 밖의 리뷰입니다
      </div>
    )
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
        리뷰 원문
        {/* 조용히 적게 보여주지 않는다 — 아고다는 raw 커버리지가 31% 수준이다 */}
        {cr.items.length < cr.expectedCount && (
          <span style={{ color: 'var(--medium)' }}> (원문 확보 {cr.items.length}/{cr.expectedCount}건)</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cr.items.map(it => (
          <div key={it.id} style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
            background: 'var(--bg-input)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span className="font-display" style={{ fontSize: 15, fontWeight: 800, color: ratingColor(it.rating) }}>
                {it.rating == null ? '—' : fmt(it.rating)}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {[it.country, it.date, it.roomType].filter(Boolean).join(' · ') || '정보 없음'}
              </span>
              {!it.translated && <Chip>원문(번역 없음)</Chip>}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>
              {it.body || '(본문 없음)'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 논의 카드 ────────────────────────────────────────────────────────────────
function DiscussionCard({ r, cr }: { r: WeeklyChannelRow; cr: ChannelReviews | undefined }) {
  const [open, setOpen] = useState(false)
  const c = r.cause
  const unit = r.granularity === 'month' ? '직전 달' : '직전 주'

  return (
    <div className="card" style={{ padding: '18px 20px', marginBottom: 12, borderLeft: '3px solid var(--critical)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: branchColor(r.branch) }} />
          {r.branch} {r.otaName}
          {r.granularity === 'month' && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
              ({r.weekStart.substring(0, 7)} 월 단위)
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {r.baseline != null ? fmt(r.baseline) : '—'} →
          </span>
          <span className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--critical)', lineHeight: 1 }}>
            {fmt(r.weekAvg)}
          </span>
          {/* 건수를 점수와 같은 크기로 — 1건짜리 격차를 붕괴로 읽지 않게 하는 장치다 */}
          <span className="font-display" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
            {r.reviewCount}건
          </span>
        </span>
      </div>

      <div style={{
        fontSize: 16, lineHeight: 1.6, marginTop: 10,
        color: c?.hasCause ? 'var(--text-1)' : 'var(--medium)',
      }}>
        {c?.hasCause
          ? c.headline
          : '⚠ 원인 미기록 — 불만 메모도 키워드도 없습니다. 리뷰 원문 확인이 먼저입니다'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
        {r.thinSample && <Chip tone="warn">소표본 {r.reviewCount}건 · 추세 아님</Chip>}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {open ? '리뷰 닫기' : '리뷰 보기'}
          <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8 }}>
            {r.wow == null ? `${unit} 데이터 없음` : (
              <>
                {unit} 대비{' '}
                <span style={{ color: r.wow > 0 ? 'var(--done)' : r.wow < 0 ? 'var(--critical)' : 'var(--text-3)', fontWeight: 700 }}>
                  {signed(r.wow)}
                </span>
                {r.prevWeekAvg != null && ` (${fmt(r.prevWeekAvg)} · ${r.prevReviewCount ?? 0}건)`}
              </>
            )}
            {' · '}{ESTIMATOR_LABEL[r.estimator]}
            {r.baselineRecordedAt && ` · 기준선 ${r.baselineRecordedAt} 스냅샷`}
            {r.baselineIsFallback && ' · 기준선 대체(이후 스냅샷)'}
          </div>

          {c?.detail && (
            <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)', marginTop: 8 }}>
              <span style={{ color: 'var(--text-3)' }}>상세 </span>{c.detail}
            </div>
          )}
          {c && c.badKeywords.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              키워드 {c.badKeywords.join(' · ')}
            </div>
          )}

          <ReviewList cr={cr} />
        </div>
      )}
    </div>
  )
}

// ─── 접힌 참고 영역 ───────────────────────────────────────────────────────────
function ReferenceFold({ report }: { report: WeeklyReport }) {
  const [open, setOpen] = useState(false)
  const s = report.summary
  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <span>
          통과 {s.onOrAboveCount} · 월 단위 {s.monthlyCount} · 리뷰 0건 {s.silentCount}
          {s.unknownCount > 0 && ` · 기준선 없음 ${s.unknownCount}`}
        </span>
        <ChevronDown size={14} style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ color: 'var(--text-2)' }}>
            <b style={{ color: 'var(--done)' }}>통과 {s.onOrAboveCount}곳</b>{' '}
            {report.onOrAbove.length === 0
              ? <span style={{ color: 'var(--text-3)' }}>없음</span>
              : report.onOrAbove.map(r => `${r.branch} ${r.otaName} ${fmt(r.weekAvg)}(${r.reviewCount}건)`).join(' · ')}
          </div>

          {report.monthly.length > 0 && (
            <div style={{ color: 'var(--text-2)' }}>
              <b>월 단위 {report.monthly.length}곳</b>
              <span style={{ color: 'var(--text-3)' }}> (원본이 일 단위 날짜를 주지 않아 그 주가 아니라 그 달의 값)</span>
              <div style={{ marginTop: 3 }}>
                {report.monthly.map(r => (
                  `${r.verdict === 'below' ? '⚠ ' : ''}${r.branch} ${r.otaName} ${fmt(r.weekAvg)}` +
                  ` (${r.reviewCount}건 · 누적 ${r.baseline != null ? fmt(r.baseline) : '—'}` +
                  `${r.gap != null ? ` · ${signed(r.gap)}` : ''} · ${r.weekStart.substring(0, 7)})`
                )).join('  ·  ')}
              </div>
            </div>
          )}

          {report.unknown.length > 0 && (
            <div style={{ color: 'var(--medium)' }}>
              기준선 없음 {report.unknown.length}곳 — 스냅샷이 없어 판정 불가:{' '}
              <span style={{ color: 'var(--text-2)' }}>
                {report.unknown.map(r => `${r.branch} ${r.otaName}(${r.reviewCount}건 ${fmt(r.weekAvg)})`).join(' · ')}
              </span>
            </div>
          )}

          {report.silent.length > 0 && (
            <div style={{ color: 'var(--text-3)' }}>
              리뷰 0건 {report.silent.length}곳 — 통과가 아니라 이번 주 목소리가 없었던 채널:{' '}
              {report.silent.map(s2 => `${s2.branch} ${s2.otaName}`).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 본체 ─────────────────────────────────────────────────────────────────────
export default function WeeklyReportClient({
  report, week, weeks, reviews, basePath, extraQuery = '',
}: {
  report: WeeklyReport | null
  week: string
  weeks: string[]
  reviews: Record<number, ChannelReviews>
  basePath: string
  extraQuery?: string   // 임베드의 ?key= 처럼 주 이동 시에도 유지해야 하는 쿼리
}) {
  const router = useRouter()
  const hrefFor = (w: string) => `${basePath}?week=${w}${extraQuery ? `&${extraQuery}` : ''}`

  const idx = weeks.indexOf(week)
  const older = idx >= 0 && idx + 1 < weeks.length ? weeks[idx + 1] : null   // 목록은 최신 우선
  const newer = idx > 0 ? weeks[idx - 1] : null

  // 월 단위 채널의 미달도 논의 대상이다 — 참고로 접으면 '에어비앤비는 문제 없었다'가 된다.
  const cards = report
    ? orderForMeeting([...report.below, ...report.monthly.filter(r => r.verdict === 'below')])
    : []

  const navBtn = (target: string | null, dir: 'prev' | 'next') => {
    const style: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
      borderRadius: 8, border: '1px solid var(--border)', fontSize: 12,
      color: target ? 'var(--text-2)' : 'var(--text-3)',
      background: 'var(--bg-card)', textDecoration: 'none',
      opacity: target ? 1 : 0.4, pointerEvents: target ? 'auto' : 'none',
    }
    const body = dir === 'prev'
      ? <><ChevronLeft size={13} /> 이전 주</>
      : <>다음 주 <ChevronRight size={13} /></>
    return target
      ? <Link href={hrefFor(target)} style={style}>{body}</Link>
      : <span style={style}>{body}</span>
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>주간 OTA 리포트</div>
          <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800 }}>
            {report ? report.label : `${week || '—'} 주차`}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
            그 주에 리뷰를 쓴 사람들의 평균을 채널 자신의 누적 점수와 비교합니다
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {navBtn(older, 'prev')}
          <select
            value={week}
            onChange={e => router.push(hrefFor(e.target.value))}
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12,
              background: 'var(--bg-input)', color: 'var(--text-1)',
              border: '1px solid var(--border)', fontFamily: 'inherit',
            }}
          >
            {weeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          {navBtn(newer, 'next')}
        </div>
      </div>

      {!report ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
          이 주에는 분포 데이터가 없어 리포트를 낼 수 없습니다.
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            데이터가 없는 주를 최신 주로 바꿔치지 않습니다 — &apos;이번 주는 문제 없었다&apos;로 읽히기 때문입니다
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            fontSize: 14, color: 'var(--text-2)', marginBottom: 16,
          }}>
            <b className="font-display" style={{ fontSize: 17, color: 'var(--text-1)' }}>
              논의 {cards.length}건
            </b>
            <span style={{ color: 'var(--text-3)' }}>· 주간 리뷰 {report.summary.reviewTotal}건</span>
          </div>

          {cards.length === 0 ? (
            <div className="card" style={{ padding: '18px 20px', fontSize: 14, color: 'var(--text-2)' }}>
              이번 주 기준선을 끌어내린 채널이 없습니다.
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                아래 참고를 펼치면 리뷰 0건 채널을 확인할 수 있습니다 — 목소리가 없었던 것은 통과가 아닙니다
              </div>
            </div>
          ) : (
            cards.map(r => <DiscussionCard key={r.propertyId} r={r} cr={reviews[r.propertyId]} />)
          )}

          <ReferenceFold report={report} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입·테스트·빌드**

Run: `npx tsc --noEmit && npm test`
Expected: 타입 출력 없음, 테스트 전부 통과

- [ ] **Step 3: 빌드**

빌드는 Supabase 접속 없이 도는데, `lib/pageData.ts`의 로더가 조회 실패 시 `throw`하므로 더미 URL만으로는 프리렌더가 죽는다. 실 키를 주입해 빌드한다.

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<조달한 키> \
npm run build
```
Expected: 통과. `/weekly-report`·`/embed/weekly-report` 둘 다 `ƒ`(동적)로 표시된다.

- [ ] **Step 4: 커밋**

```bash
git add components/WeeklyReportClient.tsx
git commit -m "feat(weekly-report): 논의 카드 중심 화면으로 재편"
```

---

## Task 7: 화면 육안 확인

**Files:** 없음(검증만). 발견한 문제는 해당 파일을 고치고 커밋한다.

**Interfaces:**
- Consumes: Task 6까지의 전부
- Produces: 없음

> 이 태스크를 건너뛰지 말 것. 지난 두 번의 주간 리포트 작업이 "OAuth 뒤라 육안 확인 못 함"으로 끝났고, 그래서 화면이 실제로 어떻게 보이는지 아무도 모르는 채 배포됐다. `/embed/*`는 middleware가 `?key=` 토큰만 검증하므로 **Google OAuth를 타지 않는다** — 이 경로로 확인할 수 있다.

- [ ] **Step 1: 프로덕션 서버 기동**

`EMBED_TOKEN` 값은 `.env.local` 또는 Vercel 환경변수에 있다. 없으면 임의 값을 정해 서버 기동 시 함께 주입한다.

Run(백그라운드):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<조달한 키> \
EMBED_TOKEN=localcheck \
npx next start -p 3100
```
Expected: `Ready in ...` 출력

> dev 서버(`npm run dev`)로는 안 된다 — 이 환경에서는 HMR 웹소켓이 실패해 하이드레이션이 안 되고, 그러면 「리뷰 보기」 클릭이 동작하지 않는다.

- [ ] **Step 2: 브라우저로 연다**

Chrome 도구로 `http://localhost:3100/embed/weekly-report?week=2026-07-20&key=localcheck`를 연다.

- [ ] **Step 3: 확인 목록**

- [ ] 논의 카드가 4장이고 순서가 신설 → 동대문 → 제주시티다
- [ ] 각 카드에 `누적 → 그 주`와 `건수`가 24px로 크게 보인다
- [ ] 결론 한 줄이 한 줄로 끝난다(두 줄로 접히지 않는다)
- [ ] 신설 Trip.com이 `⚠ 원인 미기록`으로 뜬다
- [ ] 소표본 칩이 1건짜리 카드 3장에 붙어 있다
- [ ] 「리뷰 보기」를 누르면 펼쳐지고 리뷰 원문이 보인다
- [ ] 동대문 Agoda 펼침에 리뷰 3건이 `4.0 → 10.0 → 10.0` 순으로 있고, 커버리지 갭이 없으므로 「원문 확보 N/M건」 문구는 **없다**
- [ ] 동대문 Expedia 펼침의 리뷰가 한국어로 보인다(중국어 원문의 번역)
- [ ] 맨 아래 접힌 줄에 `통과 3 · 월 단위 3 · 리뷰 0건 14`가 있고 펼치면 채널명이 나온다
- [ ] 「이전 주」를 누르면 2026-07-13으로 이동하고 `key=localcheck`가 URL에 남아 있다
- [ ] 이전 주에서도 카드가 깨지지 않는다(그 주도 저장된 `headline`이 없어 폴백이 걸린다)

- [ ] **Step 4: 스크린샷 저장**

`docs/superpowers/plans/screenshots/2026-07-24-weekly-report.png`로 접힌 상태 1장, 펼친 상태 1장을 남긴다.

- [ ] **Step 5: 서버 종료**

포트 3100 프로세스를 종료한다.

- [ ] **Step 6: 발견한 문제를 고치고 커밋**

확인 목록에서 어긋난 항목이 있으면 그 자리에서 고치고, 무엇이 어떻게 어긋났는지 커밋 메시지에 남긴다. 어긋난 게 없으면 스크린샷만 커밋한다.

```bash
git add docs/superpowers/plans/screenshots/
git commit -m "docs(weekly-report): 육안 확인 스크린샷"
```

---

## Task 8: 배포와 문서 갱신

**Files:**
- Create: `.superpowers/sdd/weekly-report-quality.md`
- Modify: `.superpowers/sdd/weekly-report-ui.md` (상단에 후속 문서 포인터 한 줄)

**Interfaces:**
- Consumes: Task 1~7 전부
- Produces: 없음

- [ ] **Step 1: 작업 기록 문서 작성**

`.superpowers/sdd/weekly-report-quality.md`를 아래 뼈대로 쓴다. 각 절은 실제로 벌어진 일로 채운다 — 계획을 복사하지 말고 결과를 적는다.

```markdown
# 주간 OTA 리포트 — 보고서 품질 개선

작성 2026-07-24. 설계 정본 `docs/superpowers/specs/2026-07-24-weekly-report-quality-design.md`,
계획 `docs/superpowers/plans/2026-07-24-weekly-report-quality.md`.

## 왜
(판정 카테고리 나열 → 논의 카드. 결론이 스크롤 끝에 있었고, memo 뒤에 bad 키워드를
이어 붙여 같은 말이 두 번 나왔다는 것까지)

## 무엇을 바꿨나
| 파일 | 변경 |
(실제 커밋에 들어간 파일만)

## 결정과 근거
- 결론 한 줄은 원인까지만 — AI가 처방을 지어내지 않는다
- headline 컬럼 신설 + 4단계 폴백, 소급 마이그레이션 없음
- 드릴다운은 서버 프리로드 (임베드가 인증 API를 못 탄다)
- 버킷 매칭에 배치와 같은 parseRawDate·OTA_SITE_BY_NAME을 쓴 이유

## 실측 검증 (2026-07-20 주차)
(Task 5 Step 6 출력 붙여넣기 — 채널별 판정건수 vs 원문 건수, headlineSource)

## 육안 확인
(Task 7 확인 목록 중 어긋난 항목과 조치. 전부 통과면 그렇게 적는다)

## 함정
(작업 중 실제로 걸린 것만. 안 걸렸으면 이 절을 지운다)

## 미결
- 반복·추세 맥락("3주 연속 미달", "지난달에도 같은 원인") — 별건
- `tasks` 테이블 연결([기등록]/[신규] 대조) — 별건
- 트립닷컴 원문/번역본 이중 적재 — 근본이 수집 단계. 드릴다운에 같은 리뷰가 두 번 뜰 수 있다
- 다음 주 `/parse-reviews` 실행 후 headlineSource='headline'이 나오는지 확인 필요
```

- [ ] **Step 2: 선행 문서에 포인터**

`.superpowers/sdd/weekly-report-ui.md` 맨 위에 한 줄을 넣는다.

```markdown
> 이 문서의 화면은 2026-07-24 작업(`weekly-report-quality.md`)에서 논의 카드 구조로 교체됐다. 아래 내용은 그 이전 상태의 기록이다.
```

- [ ] **Step 3: 전체 검증 재실행**

Run: `npm test && npx tsc --noEmit`
Expected: 전부 통과

- [ ] **Step 4: 커밋과 푸시**

```bash
git add .superpowers/sdd/
git commit -m "docs(weekly-report): 보고서 품질 개선 작업 기록"
git -c credential.helper= -c credential.helper="!gh auth git-credential" push origin main
```

> 빈 헬퍼 리셋(`-c credential.helper=`)을 앞에 붙이지 않으면 manager가 먼저 실행돼 5분간 행이 걸린다. 첫 줄에 manager의 `fatal`이 찍혀도 그 아래 `xxxxxxx..yyyyyyy main -> main`이 있으면 성공이다.

- [ ] **Step 5: Vercel 배포 확인**

PowerShell에서 실행한다. `vercel ls`는 상태표를 **stderr로 내므로** stdout 폴링은 영원히 끝나지 않는다.

Run: `vercel ls voc-task-dashboard`
그 다음 최신 배포 URL에 대해: `vercel inspect <URL>`
Expected: `Status  ● Ready`

- [ ] **Step 6: 라이브 확인**

`https://voc-task-dashboard.vercel.app/embed/weekly-report?week=2026-07-20&key=<실 EMBED_TOKEN>`을 열어 Task 7의 확인 목록 중 카드 수·순서·펼침 동작을 다시 본다.

---

## 다음 주 운영 반영

Task 2 이후 처음 도는 `/parse-reviews`부터 `headline`이 채워진다. 그 주에 `/weekly-report`를 열어 `headlineSource`가 `headline`인 행이 나오는지 확인한다(폴백이 아니라 저장값을 쓰는지). 나오지 않으면 스킬의 Part B 산출이 반영되지 않은 것이다.

## 이번 범위에서 다루지 않는 것

- 반복·추세 맥락("3주 연속 미달", "지난달에도 같은 원인")
- `tasks` 테이블 연결([기등록]/[신규] 대조, 과제 생성 버튼)
- 트립닷컴 원문/번역본 이중 적재 해소 — 근본이 수집 단계다. 드릴다운에서 사실상 같은 두 건이 나란히 뜰 수 있다
- 처방·과제 문구 생성 — "AI는 사실을 압축할 뿐 해야 할 일을 지어내지 않는다"가 이번 결정이다
