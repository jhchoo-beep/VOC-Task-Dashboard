# 전 OTA 채널 상세 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `OTA 점수 현황`에서 Agoda에만 있던 상세 탭(리뷰 작성률·점수 분포·불만 분석·VOC)을 전 OTA 채널에 열고, 그 데이터를 이미 DB에 쌓인 `raw_reviews`에서 파생해 채운다.

**Architecture:** 상세 4개 테이블은 이미 `property_id` 키라 스키마 변경이 최소다. 테이블명을 일반화하고, `lib/pageData.ts`의 Agoda 필터를 걷어내고, 클라이언트 자료구조를 `Record<지점, X>`에서 `Record<지점, Record<OTA, X>>`로 한 겹 확장한다. 데이터는 `scripts/derive-ota-detail.ts` 배치가 `raw_reviews`에서 파생한다 — 숫자 집계(점수 분포)는 스크립트가 결정론적으로, 텍스트 판단(불만·VOC)은 스크립트가 뽑아준 본문을 Claude가 읽고 결과 JSON을 되돌려주는 2단 구조다.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase JS · vitest · tsx(신규 devDependency)

## Global Constraints

- 언어: 화면 문구·커밋 메시지 전부 한국어.
- 테스트 대상 순수 함수는 반드시 `lib/` 아래에 둔다 — `vitest.config.ts`의 `include`가 `lib/**/*.test.ts`로 제한돼 있어 다른 위치의 테스트는 **실행조차 되지 않는다**.
- 쓰기 경로를 건드리면 `revalidateTag('ota', 'max')`를 반드시 호출한다(Next 16은 2-인자). 누락 시 최대 300초간 화면에 반영되지 않는다.
- `raw_reviews`·`reviews`·`tasks` 등 사용자 실데이터는 **삭제·비우기 금지**. 검증은 읽기 쿼리 또는 `--dry-run`으로 한다.
- Supabase project_id: `slyfyrkqfdkoaaochspa`. 스키마 변경은 `apply_migration`으로 한다.
- 백필은 `--fill-empty` 모드로만 실행한다. 기존 행이 있는 키는 건드리지 않는다(신설 Agoda 14주 보존).
- 5점 만점 채널(Airbnb·NOL)은 원척도 1~5 밴드. ×2 환산하지 않는다.
- 지점 표기는 `신설·동대문·제주시티·고성`, OTA 표기는 `ota_properties.ota_name`(`Agoda·Booking·Trip.com·Expedia·여기어때·Airbnb·NOL`). `raw_reviews.ota_site`는 한글명(`아고다·부킹닷컴·트립닷컴·익스피디아·여기어때·에어비앤비·야놀자`)이라 **매핑이 필요하다**.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/otaDetail.ts` (신규) | 순수 함수 — 날짜 정규화, 주/월 버킷 키, 밴드 정의, 점수 분포 집계, OTA명 매핑 |
| `lib/otaDetail.test.ts` (신규) | 위 함수 전부의 단위테스트 |
| `lib/pageData.ts` (수정) | Agoda 필터 제거, 자료구조 한 겹 확장, 리뷰 작성률 파생 조립 |
| `components/OtaScoresClient.tsx` (수정) | Agoda 게이트 제거, `OtaDetailTabs` 일반화, 밴드 전환, 월별 전용 안내 |
| `app/api/ota/*/route.ts` (수정) | 일반화된 테이블명으로 갱신, 체크아웃 라우트 신설 |
| `scripts/derive-ota-detail.ts` (신규) | 파생 배치 — DB I/O + 결정론 집계 + 텍스트 추출/적재 |
| `commands/derive-ota-detail.md` (신규, `~/.claude/commands/`) | 배치 실행 절차 — 스크립트 호출 사이에 Claude가 텍스트 분석 |

---

### Task 1: 날짜 정규화 순수 함수

**Files:**
- Create: `lib/otaDetail.ts`
- Test: `lib/otaDetail.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type Granularity = 'week' | 'month'`
  - `interface ParsedDate { date: string | null; month: string | null }`
  - `function parseRawDate(rawDate: string | null | undefined, reviewMonth?: string | null): ParsedDate`
  - `function weekStartOf(isoDate: string): string` — 월요일 시작 `YYYY-MM-DD`
  - `function monthStartOf(month: string): string` — `'2026-06'` → `'2026-06-01'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/otaDetail.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import { parseRawDate, weekStartOf, monthStartOf } from './otaDetail'

describe('parseRawDate', () => {
  it('ISO 형식(아고다·익스피디아)을 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026-07-21')).toEqual({ date: '2026-07-21', month: '2026-07' })
  })

  it('한글 전체 날짜(부킹·트립닷컴)를 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026년 7월 22일')).toEqual({ date: '2026-07-22', month: '2026-07' })
    expect(parseRawDate('2023년 7월 29일')).toEqual({ date: '2023-07-29', month: '2023-07' })
  })

  it('점 구분 형식(야놀자)을 일 단위로 파싱한다', () => {
    expect(parseRawDate('2026.07.04')).toEqual({ date: '2026-07-04', month: '2026-07' })
    expect(parseRawDate('2026.06.08')).toEqual({ date: '2026-06-08', month: '2026-06' })
  })

  it('한글 연월(에어비앤비)은 일이 없으므로 date가 null이다', () => {
    expect(parseRawDate('2026년 6월')).toEqual({ date: null, month: '2026-06' })
  })

  it('상대 표현(여기어때)은 review_month로 대체한다', () => {
    expect(parseRawDate('2개월 전', '2026-04')).toEqual({ date: null, month: '2026-04' })
  })

  it('해석 불가 + review_month도 없으면 둘 다 null이다', () => {
    expect(parseRawDate('알 수 없음')).toEqual({ date: null, month: null })
    expect(parseRawDate(null)).toEqual({ date: null, month: null })
    expect(parseRawDate('')).toEqual({ date: null, month: null })
  })

  it('한 자리 월·일을 0으로 채운다', () => {
    expect(parseRawDate('2026년 3월 5일')).toEqual({ date: '2026-03-05', month: '2026-03' })
  })
})

describe('weekStartOf', () => {
  it('월요일 시작 주로 내린다', () => {
    expect(weekStartOf('2026-07-22')).toBe('2026-07-20') // 수 → 월
    expect(weekStartOf('2026-07-20')).toBe('2026-07-20') // 월 → 그대로
    expect(weekStartOf('2026-07-26')).toBe('2026-07-20') // 일 → 그 주 월
  })

  it('월 경계를 넘어가도 맞는 월요일을 찾는다', () => {
    expect(weekStartOf('2026-07-01')).toBe('2026-06-29')
  })
})

describe('monthStartOf', () => {
  it('월 첫날로 정규화한다', () => {
    expect(monthStartOf('2026-06')).toBe('2026-06-01')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -- lib/otaDetail.test.ts`
Expected: FAIL — `Failed to resolve import "./otaDetail"`

- [ ] **Step 3: 최소 구현을 쓴다**

`lib/otaDetail.ts` 생성:

```ts
// OTA 상세 탭 파생용 순수 함수.
// raw_reviews.raw_date는 채널마다 형식이 다르다 — 여기서 한 형식으로 모은다.

export type Granularity = 'week' | 'month'

export interface ParsedDate {
  date:  string | null   // 'YYYY-MM-DD' — 일 단위를 알 수 없으면 null
  month: string | null   // 'YYYY-MM'
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseRawDate(
  rawDate: string | null | undefined,
  reviewMonth?: string | null,
): ParsedDate {
  const s = (rawDate ?? '').trim()
  const fallbackMonth = reviewMonth?.trim() || null

  // 2026-07-21 (아고다·익스피디아)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, month: `${iso[1]}-${iso[2]}` }

  // 2026년 7월 22일 (부킹·트립닷컴)
  const kFull = s.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (kFull) {
    const [, y, m, d] = kFull
    return { date: `${y}-${pad(+m)}-${pad(+d)}`, month: `${y}-${pad(+m)}` }
  }

  // 2026.07.04 (야놀자)
  const dot = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (dot) {
    const [, y, m, d] = dot
    return { date: `${y}-${pad(+m)}-${pad(+d)}`, month: `${y}-${pad(+m)}` }
  }

  // 2026년 6월 (에어비앤비) — 일 단위 없음
  const kMonth = s.match(/^(\d{4})년\s*(\d{1,2})월\s*$/)
  if (kMonth) {
    const [, y, m] = kMonth
    return { date: null, month: `${y}-${pad(+m)}` }
  }

  // '2개월 전' 등 상대 표현(여기어때) — 절대값 복원 불가, review_month로 대체
  return { date: null, month: fallbackMonth }
}

export function weekStartOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = d.getUTCDay()            // 0=일 … 6=토
  const back = dow === 0 ? 6 : dow - 1 // 월요일까지 되돌릴 일수
  d.setUTCDate(d.getUTCDate() - back)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function monthStartOf(month: string): string {
  return `${month}-01`
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -- lib/otaDetail.test.ts`
Expected: PASS — 10 tests passed

- [ ] **Step 5: 커밋한다**

```bash
git add lib/otaDetail.ts lib/otaDetail.test.ts
git commit -m "feat(ota): raw_date 채널별 형식 정규화 순수 함수"
```

---

### Task 2: 점수 분포 집계 · 밴드 · OTA명 매핑

**Files:**
- Modify: `lib/otaDetail.ts`
- Modify: `lib/otaDetail.test.ts`

**Interfaces:**
- Consumes: Task 1의 `lib/otaDetail.ts`
- Produces:
  - `function bandsFor(scoreMax: number): string[]` — 10점: `['1점대'…'9점대','10점']`(10개) / 5점: `['1점','2점','3점','4점','5점']`(5개)
  - `function distColumnsFor(scoreMax: number): string[]` — 10점: `['score_1'…'score_10']` / 5점: `['score_1'…'score_5']`
  - `interface ScoreDist { counts: Record<string, number>; avg: number; total: number }`
  - `function distFromRatings(ratings: number[], scoreMax: number): ScoreDist`
  - `const OTA_SITE_BY_NAME: Record<string, string>` — `ota_properties.ota_name` → `raw_reviews.ota_site`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`lib/otaDetail.test.ts` 하단에 추가:

```ts
import { bandsFor, distColumnsFor, distFromRatings, OTA_SITE_BY_NAME } from './otaDetail'

describe('bandsFor', () => {
  it('10점 채널은 1점대~10점 10밴드다', () => {
    // 부킹·트립·여기어때에 1.0점 리뷰가 실재하므로 1점대를 포함한다
    expect(bandsFor(10)).toEqual(['1점대','2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점'])
  })

  it('5점 채널은 원척도 1~5점 5밴드다', () => {
    expect(bandsFor(5)).toEqual(['1점','2점','3점','4점','5점'])
  })
})

describe('distColumnsFor', () => {
  it('밴드 수만큼의 컬럼명을 준다', () => {
    expect(distColumnsFor(10)).toHaveLength(10)
    expect(distColumnsFor(10)[0]).toBe('score_1')
    expect(distColumnsFor(10)[9]).toBe('score_10')
    expect(distColumnsFor(5)).toEqual(['score_1','score_2','score_3','score_4','score_5'])
  })
})

describe('distFromRatings', () => {
  it('10점 채널의 점수를 내림해 밴드에 담는다', () => {
    const r = distFromRatings([10, 10, 8.4, 8.0, 9.9], 10)
    expect(r.counts.score_10).toBe(2)
    expect(r.counts.score_8).toBe(2)
    expect(r.counts.score_9).toBe(1)
    expect(r.total).toBe(5)
  })

  it('평균은 밴드가 아니라 실제 rating으로 낸다', () => {
    // 밴드 중앙값이었다면 (10+10+8+8+9)/5 = 9.0으로 잘못 나온다
    const r = distFromRatings([10, 10, 8.4, 8.0, 9.9], 10)
    expect(r.avg).toBe(9.3)
  })

  it('10점 채널의 1점대를 버리지 않는다', () => {
    const r = distFromRatings([1.0, 1.5, 2.0], 10)
    expect(r.counts.score_1).toBe(2)
    expect(r.counts.score_2).toBe(1)
  })

  it('5점 채널은 원척도 그대로 담는다', () => {
    const r = distFromRatings([5, 5, 4, 1], 5)
    expect(r.counts.score_5).toBe(2)
    expect(r.counts.score_4).toBe(1)
    expect(r.counts.score_1).toBe(1)
    expect(r.avg).toBe(3.8)
  })

  it('척도 밖 값은 양 끝 밴드로 클램프한다', () => {
    const r = distFromRatings([0, 11], 10)
    expect(r.counts.score_1).toBe(1)
    expect(r.counts.score_10).toBe(1)
  })

  it('빈 입력은 avg 0, total 0이다', () => {
    const r = distFromRatings([], 10)
    expect(r.avg).toBe(0)
    expect(r.total).toBe(0)
    expect(r.counts.score_5).toBe(0)
  })
})

describe('OTA_SITE_BY_NAME', () => {
  it('ota_properties의 영문명을 raw_reviews의 한글명으로 옮긴다', () => {
    expect(OTA_SITE_BY_NAME['Agoda']).toBe('아고다')
    expect(OTA_SITE_BY_NAME['Booking']).toBe('부킹닷컴')
    expect(OTA_SITE_BY_NAME['Trip.com']).toBe('트립닷컴')
    expect(OTA_SITE_BY_NAME['Expedia']).toBe('익스피디아')
    expect(OTA_SITE_BY_NAME['Airbnb']).toBe('에어비앤비')
    expect(OTA_SITE_BY_NAME['NOL']).toBe('야놀자')
    expect(OTA_SITE_BY_NAME['여기어때']).toBe('여기어때')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -- lib/otaDetail.test.ts`
Expected: FAIL — `bandsFor is not a function` (또는 import 해석 실패)

- [ ] **Step 3: 최소 구현을 쓴다**

`lib/otaDetail.ts` 하단에 추가:

```ts
// ota_properties.ota_name → raw_reviews.ota_site (같은 채널의 두 표기)
export const OTA_SITE_BY_NAME: Record<string, string> = {
  'Agoda':    '아고다',
  'Booking':  '부킹닷컴',
  'Trip.com': '트립닷컴',
  'Expedia':  '익스피디아',
  'Airbnb':   '에어비앤비',
  'NOL':      '야놀자',
  '여기어때':  '여기어때',
}

export function bandsFor(scoreMax: number): string[] {
  if (scoreMax === 5) return ['1점', '2점', '3점', '4점', '5점']
  return ['1점대','2점대','3점대','4점대','5점대','6점대','7점대','8점대','9점대','10점']
}

export function distColumnsFor(scoreMax: number): string[] {
  const n = scoreMax === 5 ? 5 : 10
  return Array.from({ length: n }, (_, i) => `score_${i + 1}`)
}

export interface ScoreDist {
  counts: Record<string, number>
  avg:    number
  total:  number
}

export function distFromRatings(ratings: number[], scoreMax: number): ScoreDist {
  const cols   = distColumnsFor(scoreMax)
  const counts: Record<string, number> = {}
  cols.forEach(c => { counts[c] = 0 })

  let sum = 0
  ratings.forEach(r => {
    const clamped = Math.min(Math.max(r, 1), scoreMax)
    const idx     = Math.min(Math.floor(clamped) - 1, cols.length - 1)
    counts[cols[idx]] += 1
    sum += r
  })

  const total = ratings.length
  return {
    counts,
    total,
    avg: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
  }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npm test -- lib/otaDetail.test.ts`
Expected: PASS — 21 tests passed

- [ ] **Step 5: 커밋한다**

```bash
git add lib/otaDetail.ts lib/otaDetail.test.ts
git commit -m "feat(ota): 점수 분포 집계·밴드·채널명 매핑 순수 함수"
```

---

### Task 3: DB 마이그레이션 — 테이블 일반화

**Files:**
- Supabase 마이그레이션 (`apply_migration`, project_id `slyfyrkqfdkoaaochspa`)
- Create: `docs/superpowers/migrations/2026-07-22-ota-detail-generalize.sql` (실행한 SQL 기록용)

**Interfaces:**
- Consumes: 없음
- Produces: 테이블 `ota_score_dist` · `ota_complaints` · `ota_voc` · `ota_branch_checkouts`

- [ ] **Step 1: 마이그레이션 전 현황을 기록한다**

다음 쿼리를 실행하고 결과를 적어둔다(Step 5 검증에서 대조).

```sql
select 'dist' t, count(*) n from ota_agoda_score_dist
union all select 'comp', count(*) from ota_agoda_complaints
union all select 'voc',  count(*) from ota_agoda_voc
union all select 'rate', count(*) from ota_agoda_review_rate;
```

Expected: dist 15 · comp 15 · voc 178 · rate 20 근처(정확한 수를 적어둘 것)

- [ ] **Step 2: 마이그레이션을 적용한다**

`apply_migration` 이름: `ota_detail_generalize`

```sql
-- 1) 테이블명 일반화
alter table ota_agoda_score_dist rename to ota_score_dist;
alter table ota_agoda_complaints rename to ota_complaints;
alter table ota_agoda_voc        rename to ota_voc;

-- 2) 1점대 밴드 컬럼 (부킹·트립·여기어때에 1.0점 리뷰가 실재한다)
alter table ota_score_dist add column if not exists score_1 integer not null default 0;

-- 3) 주간/월간 행 구분 (에어비앤비·여기어때는 월 단위만 가능)
alter table ota_score_dist add column if not exists granularity text not null default 'week';
alter table ota_complaints add column if not exists granularity text not null default 'week';
alter table ota_voc        add column if not exists granularity text not null default 'week';

alter table ota_score_dist add constraint ota_score_dist_granularity_chk check (granularity in ('week','month'));
alter table ota_complaints add constraint ota_complaints_granularity_chk check (granularity in ('week','month'));
alter table ota_voc        add constraint ota_voc_granularity_chk        check (granularity in ('week','month'));

-- 4) unique 제약을 granularity 포함으로 교체.
--    교체하지 않으면 월간 행이 같은 property의 주간 행을 조용히 덮어쓴다.
alter table ota_score_dist drop constraint if exists ota_agoda_score_dist_property_id_week_start_key;
alter table ota_complaints drop constraint if exists ota_agoda_complaints_property_id_week_start_key;
create unique index if not exists ota_score_dist_key on ota_score_dist (property_id, week_start, granularity);
create unique index if not exists ota_complaints_key on ota_complaints (property_id, week_start, granularity);

-- 5) 체크아웃(리뷰 작성률의 분모)을 지점 단위 테이블로 분리
create table if not exists ota_branch_checkouts (
  id             bigserial primary key,
  branch         text    not null,
  week_start     date    not null,
  checkout_count integer not null,
  created_at     timestamptz default now(),
  unique (branch, week_start)
);

insert into ota_branch_checkouts (branch, week_start, checkout_count)
select p.branch, r.week_start, r.checkout_count
from ota_agoda_review_rate r
join ota_properties p using (property_id)
where r.checkout_count > 0
on conflict (branch, week_start) do nothing;
```

주의: `ota_agoda_review_rate`는 **이 단계에서 드롭하지 않는다.** Task 4·5가 참조를 끊은 뒤 Task 9에서 드롭한다.

- [ ] **Step 3: unique 제약 실제 이름을 확인한다**

Step 2의 `drop constraint if exists`는 이름이 다르면 조용히 넘어간다. 실제로 지워졌는지 확인한다.

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('ota_score_dist'::regclass, 'ota_complaints'::regclass, 'ota_voc'::regclass)
  and contype = 'u';
```

Expected: `(property_id, week_start)`만으로 된 unique 제약이 **하나도 남아 있지 않아야 한다**. 남아 있으면 그 이름으로 `alter table … drop constraint <실제이름>;`을 다시 실행한다.

- [ ] **Step 4: 데이터가 보존됐는지 확인한다**

```sql
select 'dist' t, count(*) n from ota_score_dist
union all select 'comp', count(*) from ota_complaints
union all select 'voc',  count(*) from ota_voc
union all select 'checkouts', count(*) from ota_branch_checkouts;
```

Expected: dist·comp·voc는 Step 1과 **같은 수**. `checkouts`는 20(신설 20주).

- [ ] **Step 5: 실행한 SQL을 기록하고 커밋한다**

Step 2의 SQL을 `docs/superpowers/migrations/2026-07-22-ota-detail-generalize.sql`에 그대로 저장한다.

```bash
git add docs/superpowers/migrations/2026-07-22-ota-detail-generalize.sql
git commit -m "chore(db): OTA 상세 테이블 일반화 마이그레이션 기록"
```

---

### Task 4: 쓰기 API 라우트 갱신

**Files:**
- Modify: `app/api/ota/agoda-dist/route.ts` → `app/api/ota/score-dist/route.ts` (이동)
- Modify: `app/api/ota/agoda-complaints/route.ts` → `app/api/ota/complaints/route.ts` (이동)
- Modify: `app/api/ota/agoda-voc/route.ts` → `app/api/ota/voc/route.ts` (이동)
- Delete: `app/api/ota/agoda-rate/route.ts`
- Create: `app/api/ota/branch-checkouts/route.ts`

**Interfaces:**
- Consumes: Task 3의 테이블
- Produces: `POST /api/ota/score-dist` `{propertyId, weekStart, granularity?, scoreMax, counts}` · `POST /api/ota/complaints` `{propertyId, weekStart, granularity?, roomComplaints, bathroomComplaints, memo}` · `POST /api/ota/voc` `{propertyId, weekStart, granularity?, items}` · `POST /api/ota/branch-checkouts` `{branch, weekStart, checkoutCount}`

- [ ] **Step 1: `score-dist` 라우트를 옮기고 다시 쓴다**

```bash
git mv app/api/ota/agoda-dist app/api/ota/score-dist
```

`app/api/ota/score-dist/route.ts` 전체를 아래로 교체:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { distColumnsFor } from '@/lib/otaDetail'

export async function POST(req: NextRequest) {
  try {
    const { propertyId, weekStart, granularity = 'week', scoreMax = 10, counts } = await req.json()
    if (!propertyId || !weekStart || !counts) {
      return NextResponse.json({ error: 'propertyId, weekStart, counts 필수' }, { status: 400 })
    }

    // 가중 평균 — 밴드 대표값(score_N → N점)으로 계산한다.
    // 배치 파생은 실제 rating 평균을 쓰지만, 수기 입력은 분포만 알므로 여기서는 밴드 근사가 최선이다.
    const cols = distColumnsFor(Number(scoreMax))
    let total = 0, count = 0
    const row: Record<string, number> = {}
    cols.forEach((c, i) => {
      const n = Number(counts[c] ?? 0)
      row[c] = n
      total += n * (i + 1)
      count += n
    })
    const avg = count > 0 ? Math.round(total / count * 10) / 10 : 0

    const { error } = await supabase.from('ota_score_dist').upsert(
      { property_id: propertyId, week_start: weekStart, granularity, ...row, weekly_avg_score: avg },
      { onConflict: 'property_id,week_start,granularity' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: `complaints`·`voc` 라우트를 옮기고 갱신한다**

```bash
git mv app/api/ota/agoda-complaints app/api/ota/complaints
git mv app/api/ota/agoda-voc app/api/ota/voc
```

`app/api/ota/complaints/route.ts`에서 두 줄만 바꾼다:

```ts
    const { propertyId, weekStart, granularity = 'week', roomComplaints, bathroomComplaints, memo } = await req.json()
```
```ts
    const { error } = await supabase.from('ota_complaints').upsert(
      { property_id: propertyId, week_start: weekStart, granularity, room_complaints: roomComplaints ?? 0, bathroom_complaints: bathroomComplaints ?? 0, memo: memo ?? '' },
      { onConflict: 'property_id,week_start,granularity' }
    )
```

`app/api/ota/voc/route.ts`는 insert 전에 같은 키의 기존 행을 지운다(키워드는 누적이 아니라 대체):

```ts
    const { propertyId, weekStart, granularity = 'week', items } = await req.json()
    if (!propertyId || !weekStart || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'propertyId, weekStart, items 필수' }, { status: 400 })
    }
    await supabase.from('ota_voc')
      .delete()
      .eq('property_id', propertyId).eq('week_start', weekStart).eq('granularity', granularity)

    const rows = items.map((item: { band: string; sentiment: string; keyword: string }) => ({
      property_id: propertyId,
      week_start: weekStart,
      granularity,
      band: item.band,
      sentiment: item.sentiment,
      keyword: item.keyword,
    }))
    const { error } = await supabase.from('ota_voc').insert(rows)
```

- [ ] **Step 3: 체크아웃 라우트를 신설하고 옛 rate 라우트를 지운다**

```bash
git rm -r app/api/ota/agoda-rate
```

`app/api/ota/branch-checkouts/route.ts` 생성:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'

// 리뷰 작성률의 분모. 지점 단위 주간 체크아웃 수 — 채널별로 나뉘지 않는다.
export async function POST(req: NextRequest) {
  try {
    const { branch, weekStart, checkoutCount } = await req.json()
    if (!branch || !weekStart || checkoutCount == null) {
      return NextResponse.json({ error: 'branch, weekStart, checkoutCount 필수' }, { status: 400 })
    }
    const { error } = await supabase.from('ota_branch_checkouts').upsert(
      { branch, week_start: weekStart, checkout_count: Number(checkoutCount) },
      { onConflict: 'branch,week_start' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag('ota', 'max')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Step 4: 옛 경로 참조가 남아 있지 않은지 확인한다**

Run: `grep -rn "agoda-dist\|agoda-rate\|agoda-complaints\|agoda-voc\|ota_agoda_" --include=*.ts --include=*.tsx app lib components`
Expected: `components/OtaScoresClient.tsx`의 `fetch` 호출 4곳만 남는다(Task 6에서 정리). `app/`·`lib/`에는 결과가 없어야 한다.

- [ ] **Step 5: 커밋한다**

```bash
git add -A app/api/ota
git commit -m "refactor(api): OTA 상세 쓰기 라우트를 채널 무관하게 일반화"
```

---

### Task 5: `lib/pageData.ts` — Agoda 필터 제거 · 자료구조 확장

**Files:**
- Modify: `lib/pageData.ts:9-148`

**Interfaces:**
- Consumes: Task 2의 `OTA_SITE_BY_NAME`, Task 3의 테이블
- Produces: `getOtaScoresProps()`의 반환 필드
  - `scoreDist:  Record<string, Record<string, { week: string; scores: number[]; avgScore: number; granularity: 'week'|'month' }[]>>`
  - `complaints: Record<string, Record<string, { week: string; room: number; bathroom: number }[]>>`
  - `complaintMemos: Record<string, Record<string, string>>`
  - `voc: Record<string, Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]>>`
  - `reviewRate: Record<string, Record<string, { week: string; reviewCount: number; checkoutCount: number; ratePct: number }[]>>`
  - `scoreMaxByBranchOta: Record<string, Record<string, number>>`
  - (기존 유지) `recordedAt` `scoreHistory` `reviewHistory` `dateLabels` `dates` `otaList` `branchOtaToId`

  `scores` 배열은 **밴드 순서 그대로**(10점 채널 10칸 = 1점대…10점 / 5점 채널 5칸 = 1점…5점)다. 기존 9칸(2점대~10점)에서 바뀌었다.

- [ ] **Step 1: 쿼리와 조립 로직을 교체한다**

`lib/pageData.ts`의 `getOtaScoresProps` 안에서, 쿼리 블록(18-24행)을 아래로 바꾼다:

```ts
    supabase.from('ota_scores').select('property_id,overall_score,review_count,recorded_at').order('recorded_at', { ascending: true }),
    supabase.from('ota_properties').select('property_id,branch,ota_name,score_max,okr_target').eq('active', true),
    supabase.from('ota_score_dist').select('*').order('week_start', { ascending: true }),
    supabase.from('ota_complaints').select('*').order('week_start', { ascending: true }),
    supabase.from('ota_voc').select('*').order('week_start', { ascending: false }),
    supabase.from('ota_branch_checkouts').select('branch,week_start,checkout_count').order('week_start', { ascending: true }),
```

마지막 구조 분해도 `{ data: checkoutsRaw }`로 바꾼다.

- [ ] **Step 2: `agodaProps` 블록(72-123행)을 전 채널 조립으로 교체한다**

72행부터 123행까지를 통째로 아래로 교체:

```ts
  // 채널 무관 조립. Agoda 필터를 걸지 않는다.
  const dist2      = <T,>() => ({} as Record<string, Record<string, T>>)
  const put = <T,>(o: Record<string, Record<string, T>>, b: string, ota: string, v: T) => {
    if (!o[b]) o[b] = {}
    o[b][ota] = v
  }

  const fmtWeek = (ws: string) => ws.substring(5).replace('-', '/')

  const scoreDist      = dist2<{ week: string; scores: number[]; avgScore: number; granularity: 'week' | 'month' }[]>()
  const complaints2    = dist2<{ week: string; room: number; bathroom: number }[]>()
  const complaintMemos = dist2<string>()
  const voc2           = dist2<{ week_start: string; band: string; sentiment: string; keyword: string }[]>()
  const scoreMaxByBranchOta = dist2<number>()

  properties.forEach((p: any) => {
    const max  = p.score_max === 5 ? 5 : 10
    const cols = distColumnsFor(max)
    put(scoreMaxByBranchOta, p.branch, p.ota_name, max)

    const dRows = (dist as any[]).filter(d => d.property_id === p.property_id)
    put(scoreDist, p.branch, p.ota_name, dRows.slice(-10).map((r: any) => ({
      week:        r.granularity === 'month' ? `${parseInt(r.week_start.substring(5, 7))}월` : fmtWeek(r.week_start),
      scores:      cols.map(c => r[c] ?? 0),
      avgScore:    Number(r.weekly_avg_score) || 0,
      granularity: (r.granularity ?? 'week') as 'week' | 'month',
    })))

    const cRows = (complaints as any[]).filter(c => c.property_id === p.property_id)
    put(complaints2, p.branch, p.ota_name, cRows.slice(-8).map((c: any) => ({
      week:     c.granularity === 'month' ? `${parseInt(c.week_start.substring(5, 7))}월` : fmtWeek(c.week_start),
      room:     c.room_complaints,
      bathroom: c.bathroom_complaints,
    })))
    put(complaintMemos, p.branch, p.ota_name, cRows[cRows.length - 1]?.memo ?? '')

    const vRows = (voc as any[]).filter(v => v.property_id === p.property_id)
    put(voc2, p.branch, p.ota_name, vRows.map((v: any) => ({
      week_start: v.week_start, band: v.band, sentiment: v.sentiment, keyword: v.keyword,
    })))
  })

  // 리뷰 작성률 = 채널별 주간 신규 리뷰(ota_scores 델타) / 지점 주간 체크아웃.
  // 분자를 저장하지 않는 이유: collect-ota-scores가 이미 매주 누적 리뷰 수를 찍고 있다.
  const checkoutByBranchWeek = new Map<string, number>()
  ;(checkoutsRaw ?? []).forEach((c: any) => checkoutByBranchWeek.set(`${c.branch}|${c.week_start}`, c.checkout_count))

  const reviewRate = dist2<{ week: string; reviewCount: number; checkoutCount: number; ratePct: number }[]>()
  properties.forEach((p: any) => {
    const snaps = scores
      .filter((s: any) => s.property_id === p.property_id)
      .sort((a: any, b: any) => a.recorded_at < b.recorded_at ? -1 : 1)

    const rows: { week: string; reviewCount: number; checkoutCount: number; ratePct: number }[] = []
    for (let i = 1; i < snaps.length; i++) {
      const ws = snaps[i].recorded_at
      const co = checkoutByBranchWeek.get(`${p.branch}|${ws}`)
      if (!co) continue // 체크아웃 미입력 주는 작성률을 낼 수 없다
      const delta = Math.max(0, (snaps[i].review_count ?? 0) - (snaps[i - 1].review_count ?? 0))
      rows.push({
        week: fmtWeek(ws),
        reviewCount: delta,
        checkoutCount: co,
        ratePct: Math.round(delta / co * 1000) / 10,
      })
    }
    put(reviewRate, p.branch, p.ota_name, rows)
  })
```

- [ ] **Step 3: import와 반환 블록을 갱신한다**

파일 상단 import에 추가:

```ts
import { distColumnsFor } from '@/lib/otaDetail'
```

반환 블록(134-147행)의 5개 키를 교체:

```ts
  return {
    recordedAt: latestDate,
    scoreHistory,
    reviewHistory,
    dateLabels,
    dates: allDates,
    otaList,
    scoreDist,
    complaints: complaints2,
    complaintMemos,
    voc: voc2,
    reviewRate,
    scoreMaxByBranchOta,
    branchOtaToId,
  }
```

- [ ] **Step 4: 타입 검사로 소비처 오류를 드러낸다**

Run: `npx tsc --noEmit`
Expected: FAIL — `components/OtaScoresClient.tsx`에서 `agodaDist` 등 없는 프롭 관련 오류. Task 6에서 해소한다. `lib/pageData.ts` 자체 오류는 **0이어야 한다** — 있으면 여기서 고친다.

- [ ] **Step 5: 커밋한다**

```bash
git add lib/pageData.ts
git commit -m "refactor(pageData): OTA 상세 데이터를 전 채널로 확장하고 작성률을 파생으로 전환"
```

---

### Task 6: `OtaScoresClient.tsx` — 상세 탭 일반화

**Files:**
- Modify: `components/OtaScoresClient.tsx`

**Interfaces:**
- Consumes: Task 5의 프롭, Task 2의 `bandsFor`
- Produces: 전 채널에서 동작하는 `OtaDetailTabs`

- [ ] **Step 1: 타입·프롭·상수를 갱신한다**

상단 import에 추가:

```ts
import { bandsFor } from '@/lib/otaDetail'
```

`interface OtaData`(26-37행)를 교체:

```ts
interface OtaData {
  branches:        string[]
  otaList:         OtaEntry[]
  dateLabels:      string[]
  scoreHistory:    ScoreHistory
  reviewHistory:   ReviewHistory
  scoreDist:       Record<string, Record<string, DistWeek[]>>
  complaints:      Record<string, Record<string, { week: string; room: number; bathroom: number }[]>>
  complaintMemos:  Record<string, Record<string, string>>
  voc:             Record<string, Record<string, { week_start: string; band: string; sentiment: string; keyword: string }[]>>
  reviewRate:      Record<string, Record<string, ReviewRateWeek[]>>
  scoreMaxByBranchOta: Record<string, Record<string, number>>
}
```

`AgodaDistWeek`→`DistWeek`, `AgodaReviewRateWeek`→`ReviewRateWeek`로 이름을 바꾸고 `DistWeek`에 필드를 추가:

```ts
interface DistWeek { week: string; scores: number[]; avgScore?: number; granularity?: 'week' | 'month' }
interface ReviewRateWeek { week: string; reviewCount: number; checkoutCount: number; ratePct: number }
```

`HEATMAP_BANDS` 상수(94행)를 **삭제**한다 — `bandsFor(scoreMax)`가 대신한다.

`ModalMode`(19행)를 교체:

```ts
type ModalMode = 'basic' | 'checkouts' | 'score-dist' | 'complaints' | 'voc'
```

- [ ] **Step 2: `AgodaDetailTabs`를 `OtaDetailTabs`로 일반화한다**

695-701행을 교체:

```ts
type DetailSubTab = '리뷰 작성률' | '점수 분포' | '불만 분석' | 'VOC'

function OtaDetailTabs({ branch, ota, d, sub, onSubChange }: {
  branch: string; ota: string; d: OtaData
  sub: DetailSubTab
  onSubChange: (s: DetailSubTab) => void
}) {
```

`AgodaSubTab` 타입 참조를 전부 `DetailSubTab`으로 바꾼다.

708-732행의 Agoda 하드코딩을 교체:

```ts
  const otaEntry    = d.otaList.find(o => o.name === ota) ?? { okr: 9.0, max: 10 }
  const scoreMax    = d.scoreMaxByBranchOta[branch]?.[ota] ?? 10
  const bands       = bandsFor(scoreMax)
  const scoreHist   = d.scoreHistory[branch]?.[ota] ?? []
  const curScore    = scoreHist[scoreHist.length - 1] ?? 0
  const prevScore   = scoreHist[scoreHist.length - 2] ?? 0
  const reviewHist   = d.reviewHistory[branch]?.[ota] ?? []
  const totalReviews = reviewHist[reviewHist.length - 1] ?? 0

  const distHistoryRaw = d.scoreDist[branch]?.[ota] ?? []
  // 원본이 이미 월 단위인 채널(에어비앤비·여기어때)은 주별 집계가 불가능하다
  const monthlyOnly    = distHistoryRaw.length > 0 && distHistoryRaw.every(r => r.granularity === 'month')
  const effectiveTime  = monthlyOnly ? 'monthly' : timeMode
  const distHistory    = (effectiveTime === 'monthly' && !monthlyOnly) ? groupDistByMonth(distHistoryRaw) : distHistoryRaw
  const heatmapMaxVal  = Math.max(
    ...distHistory.flatMap(({ scores }) => {
      const total = scores.reduce((s, v) => s + v, 0) || 1
      return distViewMode === 'ratio' ? scores.map(cnt => Math.round(cnt / total * 1000) / 10) : scores
    }), 1
  )

  const complaintsRaw   = d.complaints[branch]?.[ota] ?? []
  const complaints      = (effectiveTime === 'monthly' && !monthlyOnly) ? groupComplaintsByMonth(complaintsRaw) : complaintsRaw
  const baseRoom        = complaintsRaw.slice(0, 4).reduce((s, c) => s + c.room, 0) / Math.max(complaintsRaw.slice(0, 4).length, 1)
  const baseBath        = complaintsRaw.slice(0, 4).reduce((s, c) => s + c.bathroom, 0) / Math.max(complaintsRaw.slice(0, 4).length, 1)
  const latestComplaint = complaintsRaw[complaintsRaw.length - 1]

  const reviewRateRaw = d.reviewRate[branch]?.[ota] ?? []
  const reviewRate    = (effectiveTime === 'monthly' && !monthlyOnly) ? groupReviewRateByMonth(reviewRateRaw) : reviewRateRaw
  const latestRate    = reviewRateRaw[reviewRateRaw.length - 1]
```

`agodaOTA` 참조를 전부 `otaEntry`로 바꾼다(749·839·840·841행).

- [ ] **Step 3: 월별 전용 안내와 밴드 전환을 넣는다**

`timeModeToggle`(734-742행)을 교체 — 월별 전용 채널은 토글 대신 사유를 표시한다:

```ts
  const timeModeToggle = monthlyOnly ? (
    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
      이 채널은 OTA가 월 단위 날짜만 제공합니다 — 월별로만 표시
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['weekly', 'monthly'] as const).map(m => (
        <button key={m} onClick={() => setTimeMode(m)} style={TOGGLE_BTN(timeMode === m)}>
          {m === 'weekly' ? '📅 주별' : '📅 월별'}
        </button>
      ))}
    </div>
  )
```

히트맵 본문의 `HEATMAP_BANDS.map`(852행)을 `bands.map`으로 바꾼다. 헤더의 `timeMode === 'weekly'` 조건(827행)은 `effectiveTime === 'weekly'`로, 평균 추이 제목(889행)의 `timeMode === 'monthly'`도 `effectiveTime === 'monthly'`로 바꾼다. 불만 차트의 `timeMode === 'weekly'` 기준선 조건(931·935행)도 `effectiveTime`으로 바꾼다.

VOC 섹션(989·1014행)의 `d.agodaVoc[branch]`를 `d.voc[branch]?.[ota]`로, 제목의 `{branch} Agoda`를 `{branch} {ota}`로 바꾼다. 불만 메모(977·978행)의 `d.complaintMemos[branch]`를 `d.complaintMemos[branch]?.[ota]`로 바꾼다.

리뷰 작성률 제목(779행)의 `Agoda 리뷰 작성률 추이`를 `{ota} 리뷰 작성률 추이`로 바꾸고, 빈 상태 문구(784행)를 교체:

```tsx
                <div style={{ fontSize: 13 }}>지점 주간 체크아웃 수가 입력되지 않았습니다</div>
                <div style={{ fontSize: 11, marginTop: 6 }}>우측 상단 「데이터 입력」에서 {branch}의 주간 체크아웃 수를 넣으면 전 채널 작성률이 함께 산출됩니다</div>
```

- [ ] **Step 4: 상세 뷰의 Agoda 게이트를 제거한다**

`OtaDetailView`(1335-1345행)를 교체:

```ts
  const [mainTab, setMainTab]   = useState<'basic' | 'detail'>('basic')
  const [detailSub, setDetailSub] = useState<DetailSubTab>('리뷰 작성률')
  const [showModal, setShowModal] = useState(false)

  function getModalMode(): ModalMode {
    if (mainTab === 'basic')          return 'basic'
    if (detailSub === '리뷰 작성률')  return 'checkouts'
    if (detailSub === '점수 분포')    return 'score-dist'
    if (detailSub === '불만 분석')    return 'complaints'
    return 'voc'
  }
```

탭바(1415-1438행)를 교체:

```tsx
      {/* 탭바 — 전 채널 */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([['basic', '📊 기본 추이'], ['detail', `🔍 ${ota} 상세`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setMainTab(key)} style={{
            padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: mainTab === key ? 700 : 400,
            color: mainTab === key ? 'var(--accent)' : 'var(--text-3)',
            borderBottom: mainTab === key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {mainTab === 'basic' && (
        <OtaDetailBasic branch={branch} ota={ota} otaEntry={otaEntry}
          last8Labels={last8Labels} last8Scores={last8Scores} weeklyReviews={weeklyReviews} />
      )}

      {mainTab === 'detail' && (
        <OtaDetailTabs branch={branch} ota={ota} d={d} sub={detailSub} onSubChange={setDetailSub} />
      )}
```

- [ ] **Step 5: 입력 모달을 갱신한다**

`MODAL_TITLE`(1090-1096행)을 교체:

```ts
const MODAL_TITLE: Record<ModalMode, string> = {
  'basic':      '기본 추이 입력 — 평점 & 리뷰 수',
  'checkouts':  '지점 주간 체크아웃 수 입력',
  'score-dist': '점수 분포 입력',
  'complaints': '불만 분석 입력',
  'voc':        'VOC 키워드 입력',
}
```

`InputModal` 시그니처에 `scoreMax`를 추가하고(`scoreMax: number`), `OtaDetailView`의 호출부(1442행)에 `scoreMax={d.scoreMaxByBranchOta[branch]?.[ota] ?? 10}`를 넘긴다.

`save()`의 `review-rate` 분기(1146-1152행)를 교체:

```ts
      } else if (mode === 'checkouts') {
        if (!date || !checkouts) { setError('날짜와 체크아웃 수는 필수입니다.'); setSaving(false); return }
        const res = await fetch('/api/ota/branch-checkouts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch, weekStart: date, checkoutCount: parseInt(checkouts) }),
        })
        if (!res.ok) throw new Error(await res.text())
```

`score-dist` 분기(1154-1162행)를 교체 — 밴드 수가 척도에 따라 다르므로 고정 9칸을 쓸 수 없다:

```ts
      } else if (mode === 'score-dist') {
        if (!date) { setError('날짜는 필수입니다.'); setSaving(false); return }
        const counts: Record<string, number> = {}
        distVals.forEach((v, i) => { counts[`score_${i + 1}`] = v })
        if (!distVals.some(v => v > 0)) { setError('점수 분포 값을 1개 이상 입력하세요.'); setSaving(false); return }
        const res = await fetch('/api/ota/score-dist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, weekStart: date, scoreMax, counts }),
        })
        if (!res.ok) throw new Error(await res.text())
```

`complaints`·`voc` 분기의 fetch 경로를 `/api/ota/complaints`·`/api/ota/voc`로 바꾼다.

개별 `s2`~`s10` 상태(1114-1116행)를 밴드 수에 맞춘 배열 하나로 교체한다:

```ts
  const [distVals, setDistVals] = useState<number[]>(() => new Array(scoreMax === 5 ? 5 : 10).fill(0))
```

점수 분포 입력 UI(1247-1256행)를 교체:

```tsx
        {mode === 'score-dist' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {bandsFor(scoreMax).map((label, i) => (
              <div key={label}>
                <label style={labelStyle}>{label}</label>
                <input style={inputStyle} type="number" min="0" value={distVals[i]}
                  onChange={e => setDistVals(prev => prev.map((v, idx) => idx === i ? (parseInt(e.target.value) || 0) : v))} />
              </div>
            ))}
          </div>
        )}
```

리뷰 작성률 입력 UI(1225-1244행)를 체크아웃 단일 입력으로 교체:

```tsx
        {mode === 'checkouts' && (
          <div>
            <label style={labelStyle}>{branch} 주간 체크아웃 수</label>
            <input style={inputStyle} type="number" placeholder="예: 120" value={checkouts} onChange={e => setCheckouts(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.7 }}>
              지점 공용값입니다. 한 번 입력하면 이 지점의 모든 채널 작성률이 함께 산출됩니다.
              분자(채널별 신규 리뷰 수)는 주간 점수 스냅샷에서 자동으로 계산됩니다.
            </div>
          </div>
        )}
```

`rateDisplay` 상수(1126-1127행)와 `VOC_BANDS` 옆의 미사용 상태를 정리한다.

- [ ] **Step 6: 컴포넌트 프롭 기본값을 갱신한다**

`OtaScoresClientProps`(1453-1466행)와 구조 분해 기본값(1468-1481행)의 5개 키를 Task 5의 새 이름으로 바꾸고, `scoreMaxByBranchOta = {}`를 추가한다. `data: OtaData` 조립(1490-1500행)도 새 키로 맞춘다. `branches` 계산(1486-1488행)의 `agodaDist`를 `scoreDist`로 바꾼다.

- [ ] **Step 7: 타입 검사와 빌드를 돌린다**

Run: `npx tsc --noEmit`
Expected: PASS — 오류 0

Run: `npm run build`
Expected: PASS — `Compiled successfully`

- [ ] **Step 8: 커밋한다**

```bash
git add components/OtaScoresClient.tsx
git commit -m "feat(ota): 상세 탭을 전 OTA 채널로 확장"
```

---

### Task 7: 파생 배치 — 결정론 부분

**Files:**
- Create: `scripts/derive-ota-detail.ts`
- Modify: `package.json` (devDependency `tsx`, script `derive:ota`)

**Interfaces:**
- Consumes: Task 1·2의 `lib/otaDetail.ts`, Task 3의 테이블
- Produces:
  - `npm run derive:ota -- --weeks 4 --fill-empty [--dry-run] [--branch 신설] [--ota Agoda]` — 점수 분포 upsert
  - `npm run derive:ota -- --weeks 4 --emit-text out.json` — 불만·VOC 분석용 본문 묶음 출력

- [ ] **Step 1: `tsx`를 추가한다**

```bash
npm install -D tsx
```

`package.json`의 `scripts`에 추가:

```json
    "derive:ota": "tsx scripts/derive-ota-detail.ts"
```

- [ ] **Step 2: 스크립트를 쓴다**

`scripts/derive-ota-detail.ts` 생성:

```ts
/**
 * raw_reviews에서 OTA 상세 탭 데이터를 파생한다.
 *
 *   npm run derive:ota -- --weeks 4 --fill-empty            점수 분포 적재
 *   npm run derive:ota -- --weeks 4 --dry-run               적재 없이 출력만
 *   npm run derive:ota -- --weeks 4 --emit-text buckets.json  불만·VOC용 본문 묶음 출력
 *   npm run derive:ota -- --apply-text results.json         분석 결과 적재
 *
 * 점수 분포는 LLM을 타지 않는다 — 재실행 시 값이 같아야 하고 검산이 가능해야 한다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import {
  parseRawDate, weekStartOf, monthStartOf, distFromRatings, distColumnsFor,
  OTA_SITE_BY_NAME, type Granularity,
} from '../lib/otaDetail'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / KEY 환경변수가 필요합니다'); process.exit(1) }
const db = createClient(url, key)

// 일 단위 날짜를 제공하지 않는 채널 — 월 버킷으로만 적재한다
const MONTHLY_ONLY = new Set(['에어비앤비', '여기어때'])

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)
const opt  = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }

const weeks     = parseInt(opt('weeks') ?? '4')
const dryRun    = flag('dry-run')
const fillEmpty = flag('fill-empty')
const onlyBranch = opt('branch')
const onlyOta    = opt('ota')
const emitText   = opt('emit-text')
const applyText  = opt('apply-text')

interface Bucket {
  propertyId: number
  branch: string
  ota: string
  scoreMax: number
  weekStart: string
  granularity: Granularity
  ratings: number[]
  texts: string[]
}

function recentWeekStarts(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - i * 7)
    out.push(weekStartOf(d.toISOString().substring(0, 10)))
  }
  return [...new Set(out)].sort()
}

function dedupe<T extends { reviewer?: string; raw_date?: string; rating?: number; content?: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter(r => {
    const k = `${r.reviewer ?? ''}|${r.raw_date ?? ''}|${r.rating ?? ''}|${(r.content ?? '').slice(0, 80)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function buildBuckets(): Promise<Bucket[]> {
  const targetWeeks  = recentWeekStarts(weeks)
  const targetMonths = [...new Set(targetWeeks.map(w => w.substring(0, 7)))]

  const { data: props, error: pErr } = await db
    .from('ota_properties').select('property_id,branch,ota_name,score_max').eq('active', true)
  if (pErr) throw pErr

  const buckets: Bucket[] = []
  let unparsed = 0

  for (const p of props ?? []) {
    if (onlyBranch && p.branch !== onlyBranch) continue
    if (onlyOta && p.ota_name !== onlyOta) continue
    const site = OTA_SITE_BY_NAME[p.ota_name]
    if (!site) { console.warn(`매핑 없는 채널: ${p.ota_name} — 건너뜀`); continue }

    const { data: raw, error: rErr } = await db
      .from('raw_reviews')
      .select('reviewer,raw_date,review_month,rating,content')
      .eq('branch', p.branch).eq('ota_site', site)
      .in('review_month', targetMonths)
    if (rErr) throw rErr

    const monthly  = MONTHLY_ONLY.has(site)
    const scoreMax = p.score_max === 5 ? 5 : 10
    const byKey    = new Map<string, Bucket>()

    for (const r of dedupe(raw ?? [])) {
      const { date, month } = parseRawDate(r.raw_date, r.review_month)
      if (!date && !month) { unparsed++; continue }

      const granularity: Granularity = (monthly || !date) ? 'month' : 'week'
      const weekStart = granularity === 'month' ? monthStartOf(month!) : weekStartOf(date!)
      if (granularity === 'week' && !targetWeeks.includes(weekStart)) continue
      if (granularity === 'month' && !targetMonths.includes(month!)) continue

      const k = `${weekStart}|${granularity}`
      if (!byKey.has(k)) {
        byKey.set(k, {
          propertyId: p.property_id, branch: p.branch, ota: p.ota_name,
          scoreMax, weekStart, granularity, ratings: [], texts: [],
        })
      }
      const b = byKey.get(k)!
      if (r.rating != null) b.ratings.push(Number(r.rating))
      if (r.content && r.content.trim().length > 5) b.texts.push(r.content.trim())
    }
    buckets.push(...byKey.values())
  }

  if (unparsed > 0) console.warn(`날짜 해석 실패로 제외한 리뷰: ${unparsed}건`)
  return buckets
}

async function existingKeys(table: string): Promise<Set<string>> {
  const { data, error } = await db.from(table).select('property_id,week_start,granularity')
  if (error) throw error
  return new Set((data ?? []).map((r: any) => `${r.property_id}|${r.week_start}|${r.granularity ?? 'week'}`))
}

async function runDist(buckets: Bucket[]) {
  const have = fillEmpty ? await existingKeys('ota_score_dist') : new Set<string>()
  let wrote = 0, skipped = 0

  for (const b of buckets) {
    if (b.ratings.length === 0) continue
    const k = `${b.propertyId}|${b.weekStart}|${b.granularity}`
    if (have.has(k)) { skipped++; continue }

    const { counts, avg, total } = distFromRatings(b.ratings, b.scoreMax)
    const row = {
      property_id: b.propertyId, week_start: b.weekStart, granularity: b.granularity,
      ...counts, weekly_avg_score: avg,
    }
    console.log(`${b.branch} ${b.ota} ${b.weekStart}(${b.granularity}) — ${total}건 avg ${avg} ` +
      distColumnsFor(b.scoreMax).map(c => `${c.replace('score_','')}:${counts[c]}`).filter(s => !s.endsWith(':0')).join(' '))

    if (!dryRun) {
      const { error } = await db.from('ota_score_dist').upsert(row, { onConflict: 'property_id,week_start,granularity' })
      if (error) throw error
      wrote++
    }
  }
  console.log(`\n점수 분포 — 기록 ${wrote}건 · 기존 보존 ${skipped}건${dryRun ? ' (dry-run)' : ''}`)
}

async function runEmitText(buckets: Bucket[], path: string) {
  const have = fillEmpty ? await existingKeys('ota_complaints') : new Set<string>()
  const payload = buckets
    .filter(b => b.texts.length > 0)
    .filter(b => !have.has(`${b.propertyId}|${b.weekStart}|${b.granularity}`))
    .map(b => ({
      propertyId: b.propertyId, branch: b.branch, ota: b.ota,
      weekStart: b.weekStart, granularity: b.granularity,
      scoreMax: b.scoreMax, reviews: b.texts,
    }))
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`분석 대상 ${payload.length}개 버킷 · 리뷰 ${payload.reduce((s, p) => s + p.reviews.length, 0)}건 → ${path}`)
}

async function runApplyText(path: string) {
  const results = JSON.parse(readFileSync(path, 'utf8')) as {
    propertyId: number; weekStart: string; granularity: Granularity
    roomComplaints: number; bathroomComplaints: number; memo: string
    voc: { band: string; sentiment: 'good' | 'bad'; keyword: string }[]
  }[]

  for (const r of results) {
    if (dryRun) { console.log(`(dry-run) ${r.propertyId} ${r.weekStart} 객실 ${r.roomComplaints} 욕실 ${r.bathroomComplaints} VOC ${r.voc.length}`); continue }

    const { error: cErr } = await db.from('ota_complaints').upsert({
      property_id: r.propertyId, week_start: r.weekStart, granularity: r.granularity,
      room_complaints: r.roomComplaints, bathroom_complaints: r.bathroomComplaints, memo: r.memo,
    }, { onConflict: 'property_id,week_start,granularity' })
    if (cErr) throw cErr

    // VOC는 누적이 아니라 대체 — 같은 키의 기존 행을 지우고 다시 넣는다
    await db.from('ota_voc').delete()
      .eq('property_id', r.propertyId).eq('week_start', r.weekStart).eq('granularity', r.granularity)
    if (r.voc.length > 0) {
      const { error: vErr } = await db.from('ota_voc').insert(
        r.voc.map(v => ({
          property_id: r.propertyId, week_start: r.weekStart, granularity: r.granularity,
          band: v.band, sentiment: v.sentiment, keyword: v.keyword,
        }))
      )
      if (vErr) throw vErr
    }
  }
  console.log(`불만·VOC ${results.length}개 버킷 적재 완료${dryRun ? ' (dry-run)' : ''}`)
}

async function main() {
  if (applyText) { await runApplyText(applyText); return }
  const buckets = await buildBuckets()
  console.log(`버킷 ${buckets.length}개 구성 (최근 ${weeks}주)\n`)
  if (emitText) { await runEmitText(buckets, emitText); return }
  await runDist(buckets)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: dry-run으로 파서가 실제 데이터에 먹는지 확인한다**

```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' .env.local | xargs)
npm run derive:ota -- --weeks 4 --dry-run --branch 신설
```

Expected: 신설의 각 채널×주 버킷이 출력된다. `날짜 해석 실패로 제외한 리뷰` 경고가 **전체의 5%를 넘으면 멈추고 원인을 확인한다** — `parseRawDate`가 놓치는 형식이 있다는 뜻이다.

- [ ] **Step 4: 기존 신설 Agoda 수기값과 대조한다**

```bash
npm run derive:ota -- --weeks 4 --dry-run --branch 신설 --ota Agoda
```

출력된 주별 분포·평균을 아래 쿼리 결과와 나란히 비교해 표로 남긴다.

```sql
select week_start, score_8, score_9, score_10, weekly_avg_score
from ota_score_dist where property_id = 1 and week_start >= '2026-06-29' order by week_start;
```

Agoda는 raw 커버리지가 31%라 **건수는 다를 것이 정상**이다. 평균 점수가 0.5 이상 벌어지면 표본 편향을 의심하고 보고한다. **어느 쪽이든 덮어쓰지 않는다.**

- [ ] **Step 5: 커밋한다**

```bash
git add scripts/derive-ota-detail.ts package.json package-lock.json
git commit -m "feat(ota): raw_reviews 파생 배치 — 점수 분포 결정론 산출"
```

---

### Task 8: 불만·VOC 분석 커맨드

**Files:**
- Create: `C:\Users\MGRV\.claude\commands\derive-ota-detail.md`

**Interfaces:**
- Consumes: Task 7의 `--emit-text` / `--apply-text`
- Produces: 주간 실행 절차

- [ ] **Step 1: 커맨드 문서를 쓴다**

`C:\Users\MGRV\.claude\commands\derive-ota-detail.md` 생성:

````markdown
# OTA 상세 데이터 주간 파생

`raw_reviews`에서 전 OTA 채널의 상세 탭 데이터를 파생한다. 점수 분포는 스크립트가 결정론적으로 산출하고, 불만·VOC는 리뷰 본문을 읽고 판단해 채운다.

작업 폴더: `C:\Users\MGRV\.claude\VOC-Task-Dashboard`

## 1. 환경변수 로드 + 점수 분포 적재

```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' .env.local | xargs)
npm run derive:ota -- --weeks 1 --fill-empty
```

`날짜 해석 실패` 경고 건수를 확인한다. 5%를 넘으면 새 날짜 형식이 등장한 것이므로 `lib/otaDetail.ts`의 `parseRawDate`를 먼저 고친다.

## 2. 분석 대상 본문 추출

```bash
npm run derive:ota -- --weeks 1 --fill-empty --emit-text /tmp/ota-buckets.json
```

## 3. 본문을 읽고 분석한다

`/tmp/ota-buckets.json`을 읽는다. 각 버킷(`{propertyId, branch, ota, weekStart, granularity, scoreMax, reviews[]}`)에 대해 판단한다.

**불만 분석**
- `roomComplaints` — 객실 관련 불만 건수(청소 미흡·냄새·소음·시설 고장·침구 불편·온도). 리뷰 **건수**이지 언급 횟수가 아니다. 한 리뷰가 객실 불만 3개를 말해도 1건이다.
- `bathroomComplaints` — 욕실 관련 불만 건수(배수·수압·온수·곰팡이·환기).
- `memo` — 실제 대응이 필요한 건을 한 줄로. 불만이 없으면 빈 문자열.
- 반어·비교 표현에 주의한다. "소음이 걱정됐는데 전혀 없었다"는 불만이 아니다.

**VOC 키워드**
- 밴드는 `scoreMax`에 따른다. 10점 채널 = `10점 / 9점대 / 8점대 / 7점대 / 6점대 이하`, 5점 채널 = `5점 / 4점 / 3점 / 2점 이하`.
- 각 항목은 `{band, sentiment: 'good'|'bad', keyword}`. 키워드는 **명사구**로 짧게(`셀프 체크인 편리`, `욕실 배수 불량`). 문장으로 쓰지 않는다.
- 리뷰에 실제로 나온 말만 쓴다. 추론해서 만들지 않는다.

결과를 아래 형식의 JSON 배열로 `/tmp/ota-results.json`에 저장한다.

```json
[
  {
    "propertyId": 15,
    "weekStart": "2026-07-20",
    "granularity": "week",
    "roomComplaints": 1,
    "bathroomComplaints": 0,
    "memo": "3층 객실 에어컨 소음 1건",
    "voc": [
      { "band": "10점", "sentiment": "good", "keyword": "역 접근성" },
      { "band": "7점대", "sentiment": "bad", "keyword": "에어컨 소음" }
    ]
  }
]
```

## 4. 적재

```bash
npm run derive:ota -- --apply-text /tmp/ota-results.json
```

## 5. 확인

`https://voc-task-dashboard.vercel.app/ota-scores`에서 지점 → 채널 → 상세 탭을 연다. 반영이 안 보이면 최대 300초 캐시를 기다리거나 쓰기 API를 한 번 태운다.

## 주의

- 기존 행이 있는 키는 `--fill-empty`가 자동으로 건너뛴다. 신설 Agoda의 수기 데이터를 덮어쓰지 않는다.
- 에어비앤비·여기어때는 `granularity: "month"`로 나온다. `weekStart`가 월 1일이면 월 버킷이다.
````

- [ ] **Step 2: 커맨드가 참조하는 경로가 맞는지 확인한다**

Run: `ls C:/Users/MGRV/.claude/VOC-Task-Dashboard/package.json && grep -n "derive:ota" C:/Users/MGRV/.claude/VOC-Task-Dashboard/package.json`
Expected: 파일이 있고 `derive:ota` 스크립트가 보인다

- [ ] **Step 3: 커밋한다**

`~/.claude/commands/`는 별도 리포이므로 그쪽에서 커밋한다.

```bash
cd C:/Users/MGRV/.claude && git add commands/derive-ota-detail.md && git commit -m "feat: OTA 상세 데이터 주간 파생 커맨드"
```

---

### Task 9: 백필 실행 · 옛 테이블 정리 · 배포

**Files:**
- Supabase (`ota_agoda_review_rate` 드롭)
- 실행만 — 코드 변경 없음

**Interfaces:**
- Consumes: Task 3~8 전부

- [ ] **Step 1: 전체 테스트와 빌드를 통과시킨다**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 전부 PASS. 기존 테스트(`otaTrend` 18개 등)도 함께 통과해야 한다.

- [ ] **Step 2: 4개 지점 × 전 채널 최근 4주를 백필한다**

```bash
export $(grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)=' .env.local | xargs)
npm run derive:ota -- --weeks 4 --fill-empty --dry-run   # 먼저 눈으로 확인
npm run derive:ota -- --weeks 4 --fill-empty             # 적재
```

Expected: `기존 보존` 건수에 신설 Agoda 4주가 포함된다(덮어쓰지 않았다는 증거).

- [ ] **Step 3: 불만·VOC를 백필한다**

Task 8 커맨드의 2~4단계를 `--weeks 4`로 실행한다.

- [ ] **Step 4: 적재 결과를 확인한다**

```sql
select p.branch, p.ota_name, d.granularity, count(*) weeks, max(d.week_start) latest
from ota_score_dist d join ota_properties p using (property_id)
group by 1,2,3 order by 1,2;
```

Expected: 신설 Agoda는 14주 이상(기존 보존 + 신규 없음), 나머지 채널은 데이터가 있는 만큼 1~4주. 에어비앤비·여기어때는 `granularity = 'month'`.

신설 Agoda 기존 행이 변형되지 않았는지 확인한다:

```sql
select week_start, score_8, score_9, score_10, weekly_avg_score, granularity
from ota_score_dist where property_id = 1 order by week_start desc limit 6;
```

Expected: Task 3 Step 1 시점의 값과 동일. `granularity`는 전부 `'week'`.

- [ ] **Step 5: 옛 테이블을 드롭한다**

참조가 모두 끊긴 것을 먼저 확인한다.

Run: `grep -rn "ota_agoda_review_rate" --include=*.ts --include=*.tsx .  | grep -v node_modules | grep -v docs/`
Expected: 결과 없음

`apply_migration` 이름 `ota_drop_legacy_review_rate`:

```sql
drop table if exists ota_agoda_review_rate;
```

- [ ] **Step 6: 배포한다**

```bash
git -c credential.helper="!gh auth git-credential" push origin main
```

첫 줄에 credential manager의 `fatal`이 찍혀도 그 아래 `<old>..<new>  main -> main`이 있으면 성공이다. 에러 줄만 보고 실패로 판단하지 않는다.

배포 상태는 **PowerShell에서** 확인한다(bash에서는 `vercel` 래퍼가 실행되지 않는다).

Run (PowerShell): `vercel ls voc-task-dashboard`
Expected: 최신 배포가 `Ready`

- [ ] **Step 7: 라이브에서 눈으로 확인한다**

`https://voc-task-dashboard.vercel.app/ota-scores`에서 확인한다.
- 신설 → Booking → `🔍 Booking 상세` 탭이 보이고 점수 분포가 채워져 있다
- 신설 → Airbnb → 주별 토글 대신 "월 단위 날짜만 제공" 안내가 보인다
- 신설 → Agoda → 기존 14주 히트맵이 그대로다(1점대 행이 늘고 값은 0)
- 리뷰 작성률 → 신설은 값이 나오고, 체크아웃 미입력 지점은 안내 문구가 보인다

- [ ] **Step 8: 문서를 갱신하고 커밋한다**

`CLAUDE.md`의 Supabase 테이블 구조 섹션에 일반화된 4개 테이블을 추가하고, 사이드바/데이터 입력 설명을 갱신한다.

```bash
git add CLAUDE.md
git commit -m "docs: OTA 상세 테이블 일반화 반영"
git -c credential.helper="!gh auth git-credential" push origin main
```

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 담당 태스크 |
|---|---|
| 테이블 4종 일반화 | Task 3 |
| `score_1` 추가 (1점대 실재) | Task 3 Step 2 · Task 2 `bandsFor` |
| `granularity` + unique 제약 교체 | Task 3 Step 2·3 |
| `ota_branch_checkouts` 분리·이관 | Task 3 Step 2 · Task 4 Step 3 |
| 리뷰 작성률 분자 파생(음수 클램프) | Task 5 Step 2 |
| 날짜 정규화 5종 파서 | Task 1 |
| dedup(부킹 257건) | Task 7 Step 2 `dedupe` |
| 점수 분포 = LLM 미경유·실제 rating 평균 | Task 7 `runDist` · Task 2 테스트 |
| 불만·VOC LLM 배치 | Task 7 `--emit-text`/`--apply-text` · Task 8 |
| `--fill-empty` 멱등 | Task 7 `existingKeys` |
| pageData 필터 제거·한 겹 확장 | Task 5 |
| 클라이언트 게이트 제거·밴드 전환·월별 안내 | Task 6 |
| 입력 모달 체크아웃 지점 단위 | Task 6 Step 5 |
| `revalidateTag('ota','max')` 유지 | Task 4 (4개 라우트 전부) |
| 백필 4지점 × 4주 · 빈 칸만 | Task 9 Step 2·3 |
| 신설 Agoda 대조표(덮어쓰지 않음) | Task 7 Step 4 · Task 9 Step 4 |
| tsc·프로덕션 빌드 | Task 6 Step 7 · Task 9 Step 1 |

누락 없음.

**타입 일관성 확인**
- `distColumnsFor` — Task 2 정의 → Task 4(API)·Task 5(pageData)·Task 7(스크립트)에서 같은 이름·시그니처로 사용.
- `bandsFor` — Task 2 정의 → Task 6 히트맵·입력 모달에서 사용.
- `Granularity` — Task 1 정의 → Task 5 프롭·Task 7 버킷에서 사용.
- `DetailSubTab` — Task 6에서 `AgodaSubTab`을 대체하며 `OtaDetailTabs`·`OtaDetailView` 양쪽에서 같은 이름 사용.
- `ScoreDist.counts`는 `score_1`~`score_N` 키 — API `counts` 페이로드, 스크립트 upsert row와 키 형식이 일치.
- 프롭 이름 `scoreDist`·`complaints`·`complaintMemos`·`voc`·`reviewRate`·`scoreMaxByBranchOta` — Task 5 반환과 Task 6 `OtaScoresClientProps`가 일치.
