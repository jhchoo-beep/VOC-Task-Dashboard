-- VOC V2 (Constellation) — 새 표 4개
-- 2026-10-12 설계: docs/superpowers/specs/2026-10-12-voc-v2-constellation-design.md
--
-- 🔴 기존 표(reviews, raw_reviews, review_triage, tasks, weekly_tasks, task_logs, ota_*)는 바꾸지 않는다.
--    새 표에서 reviews·tasks 를 가리키는 칸(review_id, task_id)에 외래키를 걸지 않는다 — 외래키를 걸면
--    V1 의 리뷰·과제 삭제가 막히거나(RESTRICT) 별이 조용히 지워진다(CASCADE). 참조 무결성은 적재 스크립트가 확인한다.
-- 🔴 새 표는 RLS 를 켜고 anon·authenticated 에 SELECT 정책만 둔다(기존 VOC 표는 RLS 꺼짐 — 따라 하지 않음).
--    쓰기는 서비스 역할(마이그레이션·적재 스크립트·월요일 루틴)만. 앱이 쓰려면 서버 라우트 + 서비스 키로.
-- 다시 실행해도 같은 결과(IF NOT EXISTS / DROP POLICY IF EXISTS).

-- ── 별자리 ────────────────────────────────────────────────────────
create table if not exists public.voc_constellations (
  id                text primary key,                 -- 고정 ID 'C-<지점>-NNN'. 생성 시 부여, 바꾸지 않음
  branch            text not null,
  polarity          text not null check (polarity in ('neg', 'pos')),
  galaxy            text not null check (galaxy in ('청결','소음','시설','응대/환대/커뮤니티','체크인/체크아웃','위치/접근성','어메니티','가격','기타')),
  name              text not null,                    -- 「공간 + 현상」. 원인·처방 없음
  owner             text not null check (owner in ('CM','CR','FM','운영 밖')),
  status            text not null check (status in ('씨앗','열림','수행과제 진행','관찰','성운','재발','유지','흐려짐')),
  formed_at         date,                             -- 별자리 조건을 처음 채운 날(씨앗은 null) = 열린 날
  first_date        date not null,
  last_date         date not null,
  star_count        integer not null default 0,
  distinct_weeks    integer not null default 0,       -- ISO 주
  recent_4w         integer not null default 0,       -- 기준일 포함 28일
  monthly           jsonb not null default '{}'::jsonb,
  channels          jsonb not null default '{}'::jsonb,
  task_id           uuid,                             -- 연결된 수행과제(tasks.id). 외래키 없음
  observation_start date,                             -- 관찰 시작일(연결 과제 완료일)
  nebula_at         date,                             -- 성운 전환일
  relapse_count     integer not null default 0,       -- 재발 2회부터 FO가 원인 진단부터 다시(표시만)
  summary           text not null default '',         -- 이용객이 말한 사실 요약 한 문장
  sort_order        integer,                          -- 지점·극성 안 순서(최근 4주 별 수 → 최근 순)
  as_of             date not null,                    -- 이 행 값의 기준일
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint voc_constellations_polarity_status check (
    (polarity = 'neg' and status in ('씨앗','열림','수행과제 진행','관찰','성운','재발')) or
    (polarity = 'pos' and status in ('씨앗','유지','흐려짐'))
  )
);
create index if not exists voc_constellations_branch_idx on public.voc_constellations (branch, polarity, status);
create index if not exists voc_constellations_task_idx on public.voc_constellations (task_id) where task_id is not null;

-- ── 별 ────────────────────────────────────────────────────────────
create table if not exists public.voc_stars (
  id                text primary key,                 -- 'S-NNNNN'(백필) — 루틴은 같은 형식으로 이어서 부여
  source            text not null default 'ota_review' check (source in ('ota_review','channel_talk','live')),
  source_ref        text not null,                    -- 원본 참조(OTA 리뷰 = reviews.id, 채널톡 = 상담 ID, LIVE = 해당 원천 ID)
  review_id         uuid,                             -- source='ota_review' 일 때 reviews.id. 외래키 없음
  branch            text not null,
  channel           text,                             -- ota_properties.ota_name 표기(Agoda·Booking…)
  star_date         date not null,                    -- lib/otaDetail.ts resolveReviewDate 규칙
  date_source       text not null check (date_source in ('raw','collected','month')),
  iso_week          text not null,                    -- 'YYYY-Www'
  week_label        date,                             -- 주간 리포트 버킷(weekLabelOf, 화~월의 끝 월요일)
  polarity          text not null check (polarity in ('neg','pos')),
  galaxy            text not null check (galaxy in ('청결','소음','시설','응대/환대/커뮤니티','체크인/체크아웃','위치/접근성','어메니티','가격','기타')),
  phenomenon        text not null,
  quote             text not null,                    -- 원문(번역본)에서 이 목소리에 해당하는 발췌. 리뷰 전문은 reviews 에만
  owner             text not null check (owner in ('CM','CR','FM','운영 밖')),
  relation_signal   text check (relation_signal in ('감정 고조','재문의','보상 요구','평판 리스크')),
  constellation_id  text references public.voc_constellations (id) on delete set null,
  extracted_by      text not null default 'llm',      -- 'llm-backfill-2026-10-13' 등
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint voc_stars_one_voice unique (source, source_ref, polarity, phenomenon)   -- 한 원본·한 현상·한 극성 = 별 하나
);
create index if not exists voc_stars_constellation_idx on public.voc_stars (constellation_id);
create index if not exists voc_stars_branch_date_idx on public.voc_stars (branch, star_date);
create index if not exists voc_stars_review_idx on public.voc_stars (review_id) where review_id is not null;
create index if not exists voc_stars_week_label_idx on public.voc_stars (week_label);

-- ── 별자리 이력(병합·분리·이름 변경·상태 변경, 누가 언제) ──────────
create table if not exists public.voc_constellation_events (
  id                text primary key,                 -- '<별자리 ID>#NN' (적재를 다시 해도 같은 행)
  constellation_id  text not null references public.voc_constellations (id) on delete cascade,
  event_type        text not null check (event_type in ('seed','formed','merge','split','rename','task_linked','observing','relapse','nebula','fading','kept','status_change')),
  event_at          date not null,
  note              text not null default '',
  actor             text not null default 'llm',      -- 'llm-backfill' · 'fo:<이름>' · 'routine'
  created_at        timestamptz not null default now()
);
create index if not exists voc_constellation_events_cid_idx on public.voc_constellation_events (constellation_id, event_at);

-- ── 월 지표 ───────────────────────────────────────────────────────
create table if not exists public.voc_metrics_monthly (
  branch            text not null,
  month             text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  channel           text not null default '전체',     -- 북극성·목소리 비율은 체크아웃이 있는 채널 단위
  stars             integer not null default 0,
  neg_stars         integer not null default 0,
  pos_stars         integer not null default 0,
  neg_by_galaxy     jsonb not null default '{}'::jsonb,
  pos_by_galaxy     jsonb not null default '{}'::jsonb,
  north_star        numeric,                          -- 불편 없이 끝난 체류 비율(추정이면 is_estimate)
  voice_ratio       numeric,                          -- V1 리뷰 작성률과 같은 계산
  inputs            jsonb not null default '{}'::jsonb, -- 분자·분모·주 목록 등 산출 근거
  scope             text not null default '',
  is_estimate       boolean not null default true,
  computed_at       timestamptz not null default now(),
  primary key (branch, month, channel)
);

-- ── RLS: 읽기만 공개(anon·authenticated), 쓰기 정책 없음 ────────────
alter table public.voc_constellations       enable row level security;
alter table public.voc_stars                enable row level security;
alter table public.voc_constellation_events enable row level security;
alter table public.voc_metrics_monthly      enable row level security;

drop policy if exists voc_constellations_read on public.voc_constellations;
create policy voc_constellations_read on public.voc_constellations for select to anon, authenticated using (true);
drop policy if exists voc_stars_read on public.voc_stars;
create policy voc_stars_read on public.voc_stars for select to anon, authenticated using (true);
drop policy if exists voc_constellation_events_read on public.voc_constellation_events;
create policy voc_constellation_events_read on public.voc_constellation_events for select to anon, authenticated using (true);
drop policy if exists voc_metrics_monthly_read on public.voc_metrics_monthly;
create policy voc_metrics_monthly_read on public.voc_metrics_monthly for select to anon, authenticated using (true);

comment on table public.voc_stars is 'VOC V2 별 — 이용객 목소리 1개(리뷰 한 건에서 여러 개). 원천 3종 공통 형식, 첫 가동은 OTA 리뷰';
comment on table public.voc_constellations is 'VOC V2 별자리·씨앗 — 같은 지점·같은 현상. 묶음과 이름은 LLM 자동 확정, 수행과제 등록은 FO';
comment on table public.voc_constellation_events is 'VOC V2 별자리 이력 — 병합·분리·이름 변경·상태 변경';
comment on table public.voc_metrics_monthly is 'VOC V2 월 지표 — 북극성·목소리 비율·은하별 별 수';
