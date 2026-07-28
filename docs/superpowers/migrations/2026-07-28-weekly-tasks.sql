-- 2026-07-28 · 주간 수행과제
--
-- 주간 OTA 리포트의 논의 카드에서 도출한 '그 주에 처리할' 과제를 담는다.
-- tasks(월간 · 변심 트리거 기반)와는 별개 층이다 — 연결 컬럼을 두지 않는다.
--
-- week_start 는 이름과 달리 구간의 '끝' 월요일이다(화~월 7일).
-- ota_score_dist 등 기존 표와 같은 규약이며, 리포트가 들고 있는 week 문자열을 그대로 넣는다.
--
-- RLS 는 켜지 않는다 — 이 프로젝트의 다른 표(reviews·tasks·task_logs·ota_complaints)와
-- 동일하게 서버가 anon 키로 접근하고, 접근 통제는 NextAuth 세션 검사가 맡는다.

create table if not exists weekly_tasks (
  id                  uuid        primary key default gen_random_uuid(),
  week_start          date        not null,
  branches            text[]      not null default '{}',
  title               text        not null,
  problem_definition  text,
  solution            text,
  assignee            text,
  due_date            text,
  status              text        not null default '시작전',
  escalated           boolean     not null default false,
  escalated_at        timestamptz,
  -- 근거 리뷰 스냅샷: [{ id, branch, otaName, rating, date, body, translated }]
  -- id 참조가 아니라 원문 박제다. raw_reviews 를 재파생해도 회의에서 본 근거가 남아야 한다.
  source_reviews      jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint weekly_tasks_status_chk check (status in ('시작전', '진행중', '완료'))
);

create index if not exists weekly_tasks_week_idx on weekly_tasks (week_start desc);

alter table weekly_tasks disable row level security;
