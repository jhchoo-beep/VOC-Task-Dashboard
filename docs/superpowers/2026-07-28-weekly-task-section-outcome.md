# 주간 리포트 — 접힌 참고 제거 · 주간 수행과제 섹션 신설 — 작업 기록

2026-07-28. 커밋 `b44d6c8..22eb974`(구현 13커밋) + 최종 전체 리뷰 반영 1커밋.
설계 `specs/2026-07-28-weekly-task-section-design.md`.

## 무엇이 바뀌었나

`/weekly-report`(와 `/embed/weekly-report`)에서 논의 카드 아래에 있던 「접힌 참고」
(`통과 4 · 월 단위 3 · 리뷰 0건 12`, 펼쳐도 실제로는 읽히지 않던 영역)를 걷어내고, 그 자리에
**주간 수행과제** 층을 세웠다. 후보 리뷰(그 주 기준선 미달 리뷰를 지점·채널 구분 없이 모은
목록)를 체크박스로 골라 AI용 프롬프트를 클립보드로 복사하고, Claude가 낸 제목·문제 정의·해결안을
폼에 옮겨 붙이면 과제 카드가 생긴다. 과제는 시작전·진행중·완료 3단계 상태를 가지고, 완료되지
않은 채 주가 넘어가면 `[이월]` 배지를 달고 다음 주 리포트에도 계속 뜬다. `[다음달 정식 과제로
채택]`을 누르면 이월 목록에서 빠지고, 다음 달 `/voc-analysis` 실행 때 변심 트리거·수행과제 도출의
후보로 들어간다. 앱은 어떤 문안도 생성하지 않는다 — 근거 리뷰를 모으고 프롬프트를 조립하고
상태를 관리할 뿐, 실제 제목·문제 정의·해결안은 사람이 Claude에서 받아 붙여 넣는다.

| 파일 | 변경 |
|---|---|
| `docs/superpowers/migrations/2026-07-28-weekly-tasks.sql` | `weekly_tasks` 테이블 신설(RLS 미적용, 기존 표들과 동일) |
| `lib/weeklyTasks.ts` | 신규 — 순수 함수만: `flattenCandidates`·`buildTaskPrompt`·`selectVisibleTasks`·`branchesOf` |
| `lib/weeklyTasks.test.ts` | 신규 — vitest, 상대 경로 import |
| `lib/weeklyReport.ts` | `branchRank` export 추가(`weeklyTasks.ts`가 지점 고정 순 정렬에 재사용) |
| `lib/pageData.ts` | `getWeeklyTasks(week)` 추가 — 캐시 없이 직접 조회(아래 「계획과 달라진 점」 참조) |
| `app/api/weekly-tasks/route.ts` | 신규 — `POST`·`PATCH`·`DELETE` (GET 없음) |
| `components/WeeklyTaskSection.tsx` | 신규 — 후보 리뷰·프롬프트 복사·과제 폼·과제 카드 |
| `components/WeeklyReportClient.tsx` | `ReferenceFold` 제거, `WeeklyTaskSection` 배선 |
| `app/(app)/weekly-report/page.tsx` | `getWeeklyTasks` 조회 결과 배선 |
| `app/embed/weekly-report/page.tsx` | 동일 배선, `embed=true`로 쓰기 컨트롤 숨김 |

## 계획과 달라진 점과 그 이유

**캐시를 없앴다.** 설계 §4는 `getWeeklyTasks`를 별도 태그(`weekly-tasks`)로 `unstable_cache`
감싸고 API가 `revalidateTag`로 무효화하는 안이었다. 구현 후 실행해 보니 이 조합이 **같은 URL에서
`router.refresh()`가 화면을 갱신하지 못하는** 문제를 냈다 — 저장·상태 변경·채택 버튼을 눌러도
10초가 지나도 옛 값이 보였다. `revalidatePath` 대안은 같은 라우트의 무거운
`getWeeklyReportProps` 캐시(태그 `ota`·`raw-reviews`·`reviews`, revalidate 300)까지 함께
재계산시켜, 애초 캐시를 분리해서 막으려던 문제(과제 하나 저장할 때마다 리포트 전체가 다시
계산되는 것)를 그대로 되살렸다. 그래서 `getWeeklyTasks`의 캐시 자체를 걷어내고 API의
`revalidateTag` 호출도 지웠다. `getWeeklyReportProps`를 건드리지 않았으니 원래 의도는 그대로
지켜지고, 비용은 주간 리포트 렌더당 인덱스(`weekly_tasks_week_idx`) 기반 select 1회뿐이다.
자세한 경위는 설계 문서 §4에도 반영했다.

**`GET /api/weekly-tasks`를 만들지 않았다.** 설계는 `GET`·`POST`·`PATCH`·`DELETE` 4종을
전제했지만, 읽기는 서버 컴포넌트(`app/(app)/weekly-report/page.tsx`,
`app/embed/weekly-report/page.tsx`)가 `getWeeklyTasks(week)`를 직접 호출해서 한다. 클라이언트가
과제 목록을 fetch할 필요가 없어(임베드도 읽기 전용 프롭으로 받는다) API 라우트를 거칠 이유가
없었다.

각 태스크 리뷰에서 나와 그때그때 고친 것들:
- **주 전환 시 섹션 상태 초기화** — `WeeklyTaskSection`에 `key={week}`를 안 주면 주를 넘겨도
  리마운트되지 않아 `selected`·`openCandidates`·`copied`가 지난 주 값 그대로 남았다.
  `DiscussionCard`에서 같은 이유로 이미 겪은 버그였다(2026-07-24 `3d45805`).
- **저장 실패 표시 및 근거 리뷰 스냅샷 고정** — `TaskForm`의 `save()`가 `fetch` 실패(네트워크
  단절)와 API의 4xx 응답을 모두 잡아 폼 안에 에러 문구로 보여주고, 폼은 지우지 않는다.
  폼에 넘길 근거 리뷰는 「선택 N건으로 과제 만들기」를 누르는 순간 `formSources`로 스냅샷 고정한다
  — `chosen`을 그대로 넘기면 폼이 열린 채로 체크박스를 만질 때마다 저장될 근거가 바뀐다.
- **삭제 confirm 가드** — `TaskCard.remove()`에 `confirm(...)`을 넣었다(`e33edee`). 초기
  구현은 확인 없이 바로 삭제 API를 호출했다.
- **`WeeklyTaskRow.updated_at` 추가** — 설계 DDL에는 있었지만 초기 타입 정의에서 빠뜨렸다.
  PATCH가 서버에서 `updated_at`을 갱신하므로(DB 트리거 없음) 타입에도 반영했다.

## 실행 중 발견한 함정

🔴 **`unstable_cache` + `revalidateTag`가 같은 URL의 `router.refresh()`를 갱신하지 못한다**
(Next 16.2.2, 2026-07-28 SDD 격리 재현으로 확인). `revalidateTag`는 Data Cache 자체는 즉시
비운다 — 하드 네비게이션이나 다른 URL로 이동하면 최신값이 나온다. 하지만 같은 라우트에 대한
`router.refresh()`의 RSC 재요청은 그 무효화를 타지 않고 계속 캐시된 값을 반환한다. 그래서 겉으로는
"서버는 멀쩡한데(API 응답도 200, DB도 갱신됨) 화면만 안 바뀐다"는 형태로 나타나 원인을 캐시가
아니라 상태 관리 쪽에서 먼저 찾게 만든다.

**확인 필요**: 이 repo의 다른 라우트도 같은 패턴(`unstable_cache` + 같은 URL 안에서
`revalidateTag` 후 `router.refresh()`)을 쓰고 있다 — `app/api/ota/{scores,score-dist,complaints,
voc,channel-checkouts}/route.ts`가 전부 태그 `'ota'`로 `revalidateTag('ota', 'max')`를 부르고,
그 태그를 쓰는 `getWeeklyReportProps`·(추정) OTA 점수 현황 페이지의 캐시가 같은 URL에서
`router.refresh()`로 무효화되는지는 이번에 검증하지 않았다. `app/api/{reviews,rawdata,tasks}/
route.ts`도 각자의 태그(`reviews`·`raw-reviews`·`tasks`)로 같은 형태를 쓴다. 이번 버그가
`weekly_tasks`에 국한된 것인지, 이 repo 전반에 잠재하는지는 후속 확인이 필요하다.

## 미해결·후속

- 이월 컷오프가 없다. 완료도 채택도 안 된 과제는 무한히 따라온다 — 안 읽히는 영역이 다른 형태로
  돌아올 수 있다
- `getWeeklyTasks`의 `.select('*').lte(...)`에 limit이 없다. 이 repo의 PostgREST 1000행 조용한
  절삭 함정과 같은 형태(현 규모로는 수년치)
- 「채택 대기」 과제를 다시 볼 화면이 없다. 채택하면 이월에서 빠지므로 자기 주로 되돌아가야만
  보인다
- `/voc-analysis` 쿼리 D의 월 경계 규약 미확정 — `week_start`가 구간의 '끝'이라 07-28~08-03
  주는 8월 분석으로 분류된다. 첫 월 분석 전 결정 필요
- 과제 편집 UI 없음(PATCH는 지원하나 화면에 없다). 오타 하나에 삭제 후 재작성
- 과거 주 리포트의 이월 목록은 조회 시점 status로 계산돼, 나중에 열면 달라 보인다(회의록
  재현성 한계)
- `ratingColor`가 10점 척도 하드코딩이라 5점 만점 채널(에어비앤비·야놀자)의 저평점이 과하게
  빨갛다. 기존 `WeeklyReportClient`와 같은 동작이나 **이제 같은 결함이 두 벌**이라 한쪽만
  고치면 갈라진다

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과(무출력) |
| `npm test` | 8 파일 249 통과 |
| `npm run build` | 통과(Turbopack, Next 16.2.2). `/weekly-report`·`/embed/weekly-report`·`/api/weekly-tasks` 전부 동적(ƒ) |

## 범위 밖 (설계에서 명시)

앱 내 LLM 호출 · `tasks` 테이블/수행과제 탭/대시보드 진행률/슬랙 알림 변경 · 주간 과제의 사진
첨부·진행 로그 · 임베드에서의 쓰기.

## 리뷰에서 나왔으나 미루기로 한 것

태스크별 리뷰가 Minor로 낸 것들. 최종 전체 리뷰가 각각 "병합 후로 미뤄도 됨" 또는 "수정 불필요"로
판정했다. 이 층을 다시 열 때 함께 처리하면 된다.

- `POST`/`PATCH`에서 `branches`·`source_reviews`가 배열이 아니면 400 대신 조용히 `[]`로 치환된다.
  현재 호출자는 항상 배열을 보내지만, 근거 스냅샷을 조용히 비우는 자리라 손볼 때 400 + 로그로 함께.
- `PATCH`의 `escalated`에 문자열 `"false"`가 오면 `Boolean()`이 `true`로 읽는다. 유일한 호출자가
  JSON boolean을 왕복해 실제 경로는 없다 — 수정 불필요로 판정.
- 폼 `save()`에 재진입 가드가 없다(UI `disabled`에만 의존). 중복 생성 시 dedup·수정 UI가 없어
  삭제 후 재작성이 유일한 복구라는 점만 기억해 둘 것.
- 임베드에서 `key` 없는 RSC 프리페치가 403 콘솔 에러를 낸다. 토큰 게이트의 기존 동작이고
  임베드엔 쓰기가 없어 화면 영향 없음.

## 검증 후 정리

검증용으로 만든 `weekly_tasks` 행 3건은 전량 삭제했다(남은 행 0). 프로덕션 배포 후
노션 임베드 URL로 라이브 화면을 열어 접힌 참고 제거·주간 수행과제 섹션·읽기 전용을 확인했다.
