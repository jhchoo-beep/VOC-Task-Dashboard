-- KR4 STAY VOC 주간 점수 화면용 표 2개 (신규 전용. 기존 표는 건드리지 않는다)
--   kr4_runs    : 주간 러너가 한 번 올린 회차의 요약. 이 행이 들어가야 그 회차가 게시된 것이다(커밋 표지).
--   kr4_reviews : 그 회차의 정제 리뷰. 화면은 가장 최근 kr4_runs 의 run_id 행만 읽는다.
-- 쓰기는 insert 만 열고 update 는 열지 않는다. delete 는 최근 3회차보다 오래된 회차(미완성 업로드 포함)에만 열려 있다.
-- OTA 표시 평점은 기존 ota_properties + ota_scores 를 그대로 읽으므로 표를 만들지 않는다.
-- 한계: anon 키는 공개라 누구나 읽기와 insert 가 가능하다(기존 reviews 표와 같은 수준). 「최근 3회차 보호」는 정직한 러너를 전제로 한 장치이지 보안 경계가 아니다.
--       근본 해법은 서버 전용 키 전환이다.

begin;

create table if not exists public.kr4_runs (
  id                uuid primary key,
  created_at        timestamptz not null default now(),
  row_count         integer not null check (row_count > 0),
  avg10             numeric(6,3),
  collected_through date not null,
  note              text check (octet_length(note) < 2000),
  selfcheck_items   integer,
  selfcheck_fail    integer
);

create table if not exists public.kr4_reviews (
  run_id         uuid not null,
  review_id      text not null,
  branch         text not null,
  channel        text not null,
  review_date    date,
  date_unit      text not null check (date_unit in ('day', 'month')),
  assigned_month text not null check (assigned_month ~ '^[0-9]{4}-[0-9]{2}$'),
  collected_date date not null,
  scale          smallint not null check (scale in (5, 10)),
  score10        numeric(4, 2) not null check (score10 between 0 and 10),
  content        text check (octet_length(content) < 20000),
  content_ko     text check (octet_length(content_ko) < 40000),
  ko_source      text check (ko_source in ('dashboard', 'ai')),
  is_foreign     boolean not null default false,
  cause_tags     text[] not null default '{}',
  gist           text check (octet_length(gist) < 1000),
  hi_checked     boolean not null default false,
  primary key (run_id, review_id)
);

alter table public.kr4_runs enable row level security;
alter table public.kr4_reviews enable row level security;

drop policy if exists kr4_runs_read on public.kr4_runs;
drop policy if exists kr4_runs_insert on public.kr4_runs;
drop policy if exists kr4_runs_prune on public.kr4_runs;
drop policy if exists kr4_reviews_read on public.kr4_reviews;
drop policy if exists kr4_reviews_insert on public.kr4_reviews;
drop policy if exists kr4_reviews_prune on public.kr4_reviews;

create policy kr4_runs_read    on public.kr4_runs    for select using (true);
create policy kr4_runs_insert  on public.kr4_runs    for insert with check (created_at <= now() + interval '1 minute');
create policy kr4_runs_prune   on public.kr4_runs    for delete
  using (id not in (select id from public.kr4_runs order by created_at desc, id desc limit 3));

create policy kr4_reviews_read   on public.kr4_reviews for select using (true);
create policy kr4_reviews_insert on public.kr4_reviews for insert with check (true);
create policy kr4_reviews_prune  on public.kr4_reviews for delete
  using (run_id not in (select id from public.kr4_runs order by created_at desc, id desc limit 3));

-- 프로젝트 기본 권한과 무관하게 같은 결과가 되도록 명시한다(truncate, update 는 주지 않는다).
revoke all on public.kr4_runs, public.kr4_reviews from anon, authenticated;
grant select, insert, delete on public.kr4_runs, public.kr4_reviews to anon, authenticated;

commit;
