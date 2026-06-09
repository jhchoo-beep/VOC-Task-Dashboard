# VOC 수행과제 새 댓글 → 슬랙 알림 설계

- 작성일: 2026-06-09
- 대상 프로젝트: voc-task-dashboard
- 목적: 수행과제(`tasks`)에 새 댓글(`task_logs`)이 작성될 때, 사용자가 앱에 직접 들어오지 않아도 알 수 있도록 지점 스쿼드 슬랙 채널로 알림을 자동 발송한다.

---

## 1. 문제

- 대시보드의 수행과제에는 진행사항을 댓글(`task_logs`)로 남길 수 있다.
- 그러나 댓글 작성 시 별도 알림이 없어, 사용자가 직접 앱에 들어와 확인하지 않으면 새 댓글을 알 수 없다.
- → 댓글이 오가는 협업이 끊긴다. 알림이 필요하다.

## 2. 목표 / 비목표

**목표**
- `task_logs`에 댓글 INSERT가 성공하면 해당 과제 지점의 슬랙 스쿼드 채널로 알림을 보낸다.
- 알림에 지점 유저그룹을 멘션해 담당 스쿼드가 인지하게 한다.
- 알림에서 클릭 한 번에 해당 과제로 바로 이동(딥링크)한다.

**비목표 (YAGNI)**
- 댓글 수정/삭제 시 알림 (작성 시점만 대상).
- 개인 단위 @멘션 (이름→Slack user 매핑). 지점 유저그룹 멘션으로 충분.
- 알림 읽음/스레드 답글 동기화 등 양방향 연동.
- 슬랙에서 앱으로 역방향 댓글 작성.

## 3. 아키텍처

### 트리거 위치
`app/api/tasks/logs/route.ts`의 `POST` 핸들러 — 댓글이 `task_logs`에 INSERT 성공한 직후.

### 흐름
1. 댓글 저장 성공 (`data` 확보).
2. `task_id`로 `tasks`에서 `branch`, `title`, `task_month` 조회.
   - `task_logs`에는 지점 정보가 없으므로 1회 추가 조회가 필요하다.
3. `branch` → (채널, 유저그룹) 매핑 조회. 매핑에 없는 지점은 알림 스킵(에러 없이 종료).
4. 슬랙 `chat.postMessage` 호출.
5. **fire-and-forget**: 슬랙 발송 결과와 무관하게 댓글 저장 응답(`200 + data`)은 정상 반환한다. 슬랙 실패가 댓글 작성을 막아선 안 된다. 실패는 서버 로그로만 남긴다.

### 발송 방식: Slack Bot Token + `chat.postMessage`
- 토큰 하나로 모든 지점 채널 발송 + 유저그룹 멘션 처리. 지점 확장 시 매핑만 추가.
- 봇을 각 스쿼드 채널에 1회 초대 필요(설정 단계).
- 대안으로 채널별 Incoming Webhook을 검토했으나, 지점 추가 시 URL 누적·환경변수 비대화 문제로 기각.

### 모듈 분리
- `lib/slack.ts` (신규): `notifyNewComment({ branch, taskId, taskTitle, taskMonth, author, content })` 단일 함수. 슬랙 호출·메시지 포맷·매핑을 캡슐화. route는 이 함수만 호출.
  - 슬랙 의존성을 한 파일에 격리 → route는 댓글 저장 로직에 집중, 테스트·교체 용이.

## 4. 지점 → 채널/유저그룹 매핑

| 지점(branch) | 채널 | 유저그룹 멘션 |
|---|---|---|
| 신설 | be-ops-ssd-squad | @ssdsquad |
| 동대문 | be-ops-ddm-squad | @ddmsquad |
| 고성 | be-ops-gs-squad | @gssquad |
| 제주시티 | be-ops-jj-squad | @jjsquad |

- 채널은 채널 ID(`C…`), 유저그룹은 subteam ID(`S…`)로 매핑에 저장한다. 이름·핸들 문자열만으로는 멘션이 활성화되지 않으므로, 설정 단계에서 `conversations.list`/`usergroups.list`로 ID를 1회 수집한다.
- 매핑은 환경변수 JSON(`SLACK_BRANCH_MAP`) 또는 `lib/slack.ts` 내 상수로 둔다. 채널/유저그룹 ID는 민감정보가 아니므로 코드 상수도 허용하되, 토큰은 반드시 환경변수.
- 매핑에 없는 지점(데이터상 등장 가능한 기타 지점)은 조용히 스킵.

## 5. 메시지 포맷

```
[VOC 새 댓글] {지점} · {과제 제목}
{유저그룹 멘션}
작성자: {author}
{content}
<딥링크|대시보드에서 보기>
```

- 딥링크: `https://voc-task-dashboard.vercel.app/tasks?task={taskId}&month={taskMonth}`
  - `tasks` 페이지가 `task`/`month` 쿼리로 해당 과제에 스크롤+하이라이트하는 기능을 이미 보유(`highlightTaskId` → `#task-{id}`).
- 댓글 내용(`content`)이 `[링크] 제목||URL` 형식(앱 내부 링크 댓글)인 경우, 슬랙 메시지에서는 사람이 읽을 수 있게 제목+URL로 풀어 표기.
- 댓글 본문이 매우 길면 일정 길이로 잘라 `…` 처리(슬랙 메시지 과대 방지).

## 6. 환경변수

| 변수 | 용도 |
|---|---|
| `SLACK_BOT_TOKEN` | 봇 토큰(`xoxb-…`). 발송 인증. **메모리/코드 비저장, 환경변수만**. |
| (선택) `SLACK_BRANCH_MAP` | 지점→채널/유저그룹 ID 매핑 JSON. 코드 상수로 둘 경우 생략. |

- 로컬 `.env.local`과 Vercel 환경변수 양쪽에 등록.

## 7. 엣지/에러 처리

- `SLACK_BOT_TOKEN` 미설정: 알림 스킵 + 경고 로그(댓글 저장은 정상).
- `tasks` 조회 실패/해당 task 없음: 알림 스킵 + 로그.
- 슬랙 API 오류(채널 미초대 `not_in_channel`, 권한 등): 로그만 남기고 사용자 응답에는 영향 없음.
- 노션 임베드(`/embed/*`)는 읽기전용으로 댓글 POST가 발생하지 않으므로 알림 대상 아님 — 실제 앱에서 댓글 작성 시에만 발송.

## 8. 테스트

- `lib/slack.ts`의 메시지 포맷/매핑 로직: 슬랙 fetch를 모킹해 단위 테스트.
  - 매핑된 지점 → 올바른 채널 ID·멘션 포함 페이로드 생성.
  - 매핑 없는 지점 → 발송 호출 안 함.
  - `[링크]…||URL` 형식 댓글 → 사람이 읽을 형태로 변환.
  - 긴 본문 → 절단 처리.
- route 통합: 슬랙 실패해도 POST가 `200 + data`를 반환하는지(fire-and-forget) 확인.

## 9. 설정 작업(구현과 별개의 운영 1회 작업)

1. Slack 앱 생성 + 봇 토큰 발급, 스코프: `chat:write`, `usergroups:read`.
2. 봇을 4개 스쿼드 채널에 초대.
3. 채널 ID·유저그룹 ID 수집 → 매핑 반영.
4. `SLACK_BOT_TOKEN`을 `.env.local`·Vercel에 등록.
