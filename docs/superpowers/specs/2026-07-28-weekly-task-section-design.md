# 주간 리포트 — 접힌 참고 제거 · 주간 수행과제 섹션 신설

- 날짜: 2026-07-28
- 대상: `components/WeeklyReportClient.tsx`, 신규 `weekly_tasks` 테이블, `/voc-analysis` 스킬
- 선행 정본: `2026-07-24-weekly-report-quality-design.md`, `2026-07-27-weekly-report-baseline-filter-design.md`

## 왜 하는가

논의 카드 5건은 **"기준 점수보다 낮은 리뷰가 났다"까지만** 말한다(2026-07-27 `e4853d3`, 원인 한 줄 제거).
거기서 끝나면 리포트는 관측으로 끝난다. 낮은 점수를 뽑아낸 이유는 **무언가를 개선하기 위해서**다.

한편 카드 아래 접힌 참고 영역(`통과 4 · 월 단위 3 · 리뷰 0건 12`)은 실제로 펼쳐 읽히지 않는다.
그 자리를 **주간 수행과제**가 가져간다.

## 원칙 — AI는 틀을 만들고, 내용은 사람이 AI로 채운다

07-27에 카드 결론 한 줄을 없앤 근거는 "AI는 사실을 압축할 뿐 해야 할 일을 지어내지 않는다"였다.
이 설계는 그 결정과 충돌하지 않는다. **앱은 어떤 문안도 생성하지 않는다.**

- 앱이 하는 일: 근거 리뷰를 모아 주고, 프롬프트로 복사해 주고, 결과를 담을 틀과 상태를 관리한다.
- 사람이 하는 일: 프롬프트를 Claude에 붙여 문안을 받고, 판단해서 폼에 넣는다.
- 앱에 LLM 연동을 넣지 않는다(API 키·비용·장애 지점을 늘리지 않는다).

## 범위

### 1. 삭제 — `ReferenceFold`

`WeeklyReportClient.tsx`의 `ReferenceFold` 컴포넌트와 호출부를 제거한다.
파일 상단 설계 주석의 "통과·월단위·리뷰0건은 맨 아래 한 줄로 접는다" 항목도 함께 지운다.

**의도적으로 잃는 것**: 2026-07-24에 "리뷰 0건은 통과가 아니다"를 숫자로 남기려고 만든 장치가 사라진다.
보정(우측 패널에 리뷰 0건 채널 표시 등)은 **하지 않는다** — 재헌 확인 완료(2026-07-28).

`report.onOrAbove` / `.silent` / `.unknown` / `.monthly` 는 `lib/weeklyReport.ts`에 **그대로 둔다**.
판정 로직과 테스트가 이들을 쓰고, 월 단위 미달은 여전히 논의 카드로 승격된다.

### 2. 신설 — 주간 수행과제 섹션

논의 카드 아래, 좌측 컬럼. `ReferenceFold`가 있던 자리.

```
주간 수행과제 2건 · 후보 리뷰 9건

[후보 리뷰]
  ☑ 신설 Agoda   6.0 · 07-24   "체크인이 오래 걸렸다…"
  ☑ 동대문 Trip  5.0 · 07-23   "프런트 응대가…"
  ☐ 제주 Booking 7.2 · 07-25   "…"
        [AI용 프롬프트 복사]   [선택 2건으로 과제 만들기]

[과제 카드]
  ▸ 체크인 대기 시간 단축   신설·동대문 · 진행중 · 근거 3건   [다음달 채택]
  ▸ 객실 냄새 재점검        신설 · 완료 · 근거 2건  [이월]
```

#### 2-1. 후보 리뷰 목록

- 원천은 **이미 서버가 프리로드한 `reviews: Record<number, ChannelReviews>`** 다. 새 쿼리를 만들지 않는다.
- 논의 카드에 오른 채널들의 `items`(= 기준선 미달 리뷰)를 지점·채널 구분 없이 한 목록으로 평탄화한다.
  - 정렬: 지점 고정 순(`BRANCH_ORDER`) → 점수 낮은 순.
  - 표시: 지점·채널 배지 · 점수 · 날짜 · 본문(번역 우선, 없으면 원문 + `원문(번역 없음)` 칩).
- `hiddenCount`(기준선 이상이라 뺀 것)는 후보에 넣지 않는다. 화면 판정과 과제 근거가 같은 기준선을 공유해야 한다.
- 원문을 확보하지 못한 채널은 후보에 오르지 않는다(아고다 raw 커버리지 한계). 이 사실을 목록 하단에 한 줄로 고지한다.

**과제 단위는 "리뷰를 골라 묶어 N건"이다.** 채널 단위로 쪼개지 않는다 — 신설 Agoda와 신설 Trip에
같은 청결 문제가 뜨면 과제가 2건으로 갈린다. VOC v3 원칙(읽기→묶기→시간축→등급)과도 맞다.
그 주에 과제가 0건일 수도 있다.

#### 2-2. 프롬프트 복사

`[AI용 프롬프트 복사]`는 선택한 리뷰들을 지시문과 함께 클립보드에 담는다. 조립은 순수 함수
`buildTaskPrompt(items)`(`lib/weeklyTasks.ts`)가 한다.

지시문이 지켜야 할 것:
- 리뷰에 **쓰여 있는 사실만** 근거로 삼고, 없는 원인을 지어내지 말 것을 명시한다.
- 산출 형식을 `제목 / 문제 정의 / 해결안` 세 덩이로 고정해 폼에 옮기기 쉽게 한다.
- 리뷰마다 지점·채널·점수·날짜를 붙여 어느 지점 일인지 헷갈리지 않게 한다.

#### 2-3. 과제 폼

`제목` · `문제 정의` · `해결안` · `담당` · `기한` · `상태`. 붙여넣기가 주 입력 수단이므로 전부 textarea/input.
`tasks`의 severity·category·priority_score·링크·사진은 **넣지 않는다**(주간 과제는 가볍게).

#### 2-4. 과제 카드 · 이월

- 상태 3종: `시작전` · `진행중` · `완료`. (`tasks`의 `보류`는 뺀다 — 주 단위에서 보류는 곧 이월이다.)
- 근거 리뷰는 펼치면 스냅샷 원문이 그대로 나온다.
- **이월**: `week_start < 이번 주` 이면서 `status !== '완료'` 이고 `escalated = false` 인 과제는
  이후 주 리포트에도 계속 뜬다. `[이월]` 배지를 단다.
- 그 주에 만든 과제(`week_start === 이번 주`)는 완료된 것도 그 주 리포트에 남는다.

#### 2-5. 승격 — `[다음달 채택]`

**플래그만 세운다.** 이 버튼은 `tasks` 행을 만들지 않는다.

- `escalated = true`, `escalated_at` 기록. 카드에 `다음달 채택` 배지가 붙고 이월 대상에서 빠진다.
- 실제 정식 변심 트리거·수행과제 등록은 다음 달 `/voc-analysis` 실행 때 이뤄진다.
- 토글이다 — 잘못 눌렀으면 해제할 수 있다.

### 3. 데이터 — `weekly_tasks` 신설

```sql
create table weekly_tasks (
  id                  uuid primary key default gen_random_uuid(),
  week_start          date        not null,   -- 생성 주 라벨. 화~월 구간의 '끝 월요일'
  branches            text[]      not null default '{}',
  title               text        not null,
  problem_definition  text,
  solution            text,
  assignee            text,
  due_date            text,
  status              text        not null default '시작전',  -- 시작전 | 진행중 | 완료
  escalated           boolean     not null default false,
  escalated_at        timestamptz,
  source_reviews      jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index weekly_tasks_week_idx on weekly_tasks (week_start desc);
```

- `week_start`는 **기존 주 라벨 규약을 그대로 따른다** — 이름과 달리 구간의 끝(월요일)이다.
  새로 계산하지 말고 리포트가 보고 있는 `week` 문자열을 그대로 쓴다.
- `branches`는 근거 리뷰에서 도출하되 컬럼에 명시 저장한다(리뷰 스냅샷을 매번 파싱하지 않게).
- `source_reviews`는 **id 참조가 아니라 스냅샷**이다:
  `[{ id, branch, otaName, rating, date, body, translated }]`.
  `raw_reviews`가 재파싱·재적재돼도 회의에서 본 근거가 그대로 남아야 한다.
  (실제로 5·6·7월 파생을 전량 재파생한 전례가 있다 — 2026-07-27.)
- `tasks` · 대시보드 진행률 · 슬랙 알림은 **건드리지 않는다.**

`docs/superpowers/migrations/2026-07-28-weekly-tasks.sql`에 DDL을 남긴다.

### 4. API · 캐시

`app/api/weekly-tasks/route.ts` — `GET` · `POST` · `PATCH` · `DELETE`. 기존 `tasks` 라우트 패턴을 따른다
(`auth()` 세션 검사 → Supabase → `revalidateTag`).

- 캐시 태그는 **`weekly-tasks` 로 분리한다.** `getWeeklyReportProps`(태그 `ota`·`raw-reviews`·`reviews`,
  revalidate 300)에 얹으면 과제 하나 저장할 때마다 무거운 리포트 전체가 다시 계산된다.
- `lib/pageData.ts`에 `getWeeklyTasks(week)`를 별도 `unstable_cache`로 추가한다
  (`tags: ['weekly-tasks']`, revalidate 60).
- 조회 범위: `week_start <= week` 인 행 중 (a) `week_start = week` 전부, (b) 이월 조건에 맞는 과거 행.
  판정은 순수 함수 `selectVisibleTasks(rows, week)`가 한다.
- 🔴 `revalidateTag('weekly-tasks', 'max')` — Next 16은 2-인자다.

### 5. 임베드

`/embed/weekly-report`는 **읽기 전용을 유지한다.** 과제 카드 목록·근거 리뷰는 보이되
후보 리뷰 체크박스·프롬프트 복사·과제 폼·상태 변경·`[다음달 채택]`은 숨긴다.

근거: 임베드는 OAuth를 타지 않고 `?key=` 토큰만으로 열린다. 쓰기를 열면 토큰을 아는 누구나 쓸 수 있다.
동선상으로도 프롬프트 왕복은 회의 중에 못 한다 — 회의에선 논의하고, 과제 작성은 회의 후 실앱에서 한다.

`WeeklyReportClient`에 `embed?: boolean` 프롭을 받아 내려보낸다(기존 다른 클라이언트와 같은 방식).

### 6. `/voc-analysis` 스킬 연동

월 분석 입력 단계에 한 항목을 추가한다: **직전 달에 `escalated = true`로 표시된 `weekly_tasks` 조회.**

- 조회 조건: `escalated = true` AND `week_start`가 분석 대상 월 범위.
- 이 목록은 리뷰 원문(`source_reviews`)과 사람이 이미 쓴 문제 정의·해결안을 들고 온다 —
  변심 트리거·수행과제 도출의 **선행 후보**로 쓴다. 자동 변환이 아니라 분석의 입력이다.
- 스킬이 정식 과제를 만든 뒤 주간 과제를 자동으로 닫지 않는다(연결 컬럼을 두지 않는다).
  주간·월간은 별개 층으로 유지한다.

### 7. 코드 배치 · 테스트

- `components/WeeklyTaskSection.tsx` 신설. `WeeklyReportClient.tsx`(456행)에 섞지 않는다.
- `lib/weeklyTasks.ts` — 순수 함수만:
  - `flattenCandidates(cards, reviews)` — 후보 리뷰 평탄화·정렬
  - `buildTaskPrompt(items)` — 프롬프트 조립
  - `selectVisibleTasks(rows, week)` — 그 주 + 이월 판정
  - `branchesOf(items)` — 근거 리뷰에서 지점 목록 도출
  - (별도 스냅샷 함수는 두지 않는다 — `flattenCandidates`가 내는 `CandidateReview`가 곧
    `source_reviews`에 저장할 모양이다)
- `lib/weeklyTasks.test.ts` — vitest. 상대 경로 import(`@/` 별칭을 vitest가 풀지 않는다).

## 비범위

- 앱 내 LLM 호출
- `tasks` 테이블·수행과제 탭·대시보드 진행률·슬랙 알림 변경
- 주간 과제의 사진 첨부·진행 로그(필요해지면 그때)
- 임베드에서의 쓰기

## 검증

- `npm test` — `weeklyTasks.test.ts` 신규 + 기존 전량 통과
- `npm run build`
- **육안 확인 필수**: `.next` 삭제 → dev 기동 → 실앱과 `/embed/weekly-report?key=` 양쪽.
  (임베드에서 쓰기 컨트롤이 정말 숨는지, 이월 과제가 주를 넘겨 따라오는지는 화면 아니면 못 잡는다.)
- 🔴 카드 `key`에 `week`를 포함한다. 이 repo는 같은 컴포넌트 복제·재사용 시 상태가 새는 버그가 반복됐다.
