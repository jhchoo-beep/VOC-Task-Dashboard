-- 행의 출처(수기 입력 vs 파생 배치)를 구분한다.
-- 이 파일은 전체가 멱등이다 — 몇 번을 다시 실행해도 결과가 같고 에러도 나지 않는다.
--
-- 배경: --fill-empty가 '행이 있으면 건너뛴다'로 동작해 두 가지 영구 손상을 만들었다.
--   1) 대상 주에는 항상 아직 끝나지 않은 이번 주가 들어 있어, 첫 실행이 쓴 부분값
--      (7일 중 3일)이 그대로 굳는다.
--   2) raw_reviews는 주기적 수집이라 구간이 끝난 뒤에도 그 구간의 리뷰가 들어온다
--      (에어비앤비 실측: 한 달치의 14~52%가 그 달이 끝난 뒤 적재).
-- 보호해야 할 것은 '기존 행'이 아니라 '사람이 넣은 행'이므로, 존재가 아니라 출처로 판단한다.
--
-- 기본값 'manual'이 곧 정답이다 — 적용 시점의 기존 행은 전부 손으로 넣은 아고다 데이터다
-- (ota_score_dist 15행 / ota_complaints 15행 / ota_voc 178행).
alter table ota_score_dist add column if not exists source text not null default 'manual';
alter table ota_complaints add column if not exists source text not null default 'manual';
alter table ota_voc        add column if not exists source text not null default 'manual';

-- 제약도 컬럼과 같이 여러 번 실행해도 안전해야 한다.
-- 'add column if not exists'와 맨 'add constraint'를 섞어 두면 파일은 재실행해도 되는 것처럼
-- 보이지만 두 번째 실행에서 duplicate_object로 죽는다. Postgres에는 'add constraint if not
-- exists'가 없으므로 pg_constraint를 직접 확인한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ota_score_dist'::regclass and conname = 'ota_score_dist_source_chk'
  ) then
    alter table ota_score_dist add constraint ota_score_dist_source_chk check (source in ('manual','derived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ota_complaints'::regclass and conname = 'ota_complaints_source_chk'
  ) then
    alter table ota_complaints add constraint ota_complaints_source_chk check (source in ('manual','derived'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'ota_voc'::regclass and conname = 'ota_voc_source_chk'
  ) then
    alter table ota_voc add constraint ota_voc_source_chk check (source in ('manual','derived'));
  end if;
end $$;
