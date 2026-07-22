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
