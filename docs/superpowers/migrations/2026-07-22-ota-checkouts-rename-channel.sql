-- 체크아웃 표 이름을 ota_branch_checkouts → ota_channel_checkouts로 바꾼다.
-- 이 파일은 전체가 멱등이다 — 몇 번을 다시 실행해도 결과가 같고 에러도 나지 않는다.
--
-- 배경: 이 표는 2026-07-22-ota-checkouts-rekey-property.sql로 이미 (property_id, week_start)
-- 키, 즉 지점이 아니라 **채널** 단위로 되돌아왔다. 그런데 이름만 'branch'로 남았다.
-- 그 이름이 바로 직전 사고의 원인이다 — 표 이름을 읽은 사람이 checkout_count를
-- "지점 전체가 공유하는 주간 체크아웃"으로 이해했고, 신설의 비아고다 채널들이 아고다
-- 분모를 빌려 쓴 가짜 작성률이 운영팀 화면에 떴다
-- (신설 Booking "3.4%" = 부킹 리뷰 4건 / 아고다 체크아웃 119건).
-- 값은 언제나 **그 채널로 예약한 고객의 체크아웃 수**였다. 이름을 사실에 맞춘다.
--
-- 데이터는 건드리지 않는다. 순수 개명이며 행·값·키 제약이 그대로 살아남아야 한다.
-- 개명 대상: 표 1개 + 인덱스 2개 + 제약 2개 + 시퀀스 1개.

-- 1) 표 개명 (이미 개명된 뒤 재실행해도 아무 일도 일어나지 않는다)
do $$
begin
  if to_regclass('public.ota_branch_checkouts') is not null
     and to_regclass('public.ota_channel_checkouts') is null then
    alter table public.ota_branch_checkouts rename to ota_channel_checkouts;
  end if;
end $$;

-- 2) 유일키 인덱스 개명 — (property_id, week_start). 쓰기 API upsert의 onConflict 대상이다.
do $$
begin
  if to_regclass('public.ota_branch_checkouts_key') is not null
     and to_regclass('public.ota_channel_checkouts_key') is null then
    alter index public.ota_branch_checkouts_key rename to ota_channel_checkouts_key;
  end if;
end $$;

-- 3) PK 제약 개명 (제약을 개명하면 뒤따르는 인덱스도 함께 개명된다)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.ota_channel_checkouts'::regclass
      and conname = 'ota_branch_checkouts_pkey'
  ) then
    alter table public.ota_channel_checkouts
      rename constraint ota_branch_checkouts_pkey to ota_channel_checkouts_pkey;
  end if;
end $$;

-- 4) FK 제약 개명 → ota_properties(property_id)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.ota_channel_checkouts'::regclass
      and conname = 'ota_branch_checkouts_property_id_fkey'
  ) then
    alter table public.ota_channel_checkouts
      rename constraint ota_branch_checkouts_property_id_fkey
      to ota_channel_checkouts_property_id_fkey;
  end if;
end $$;

-- 5) id 시퀀스 개명 (default nextval은 OID로 묶여 있어 개명해도 그대로 동작한다)
do $$
begin
  if to_regclass('public.ota_branch_checkouts_id_seq') is not null
     and to_regclass('public.ota_channel_checkouts_id_seq') is null then
    alter sequence public.ota_branch_checkouts_id_seq rename to ota_channel_checkouts_id_seq;
  end if;
end $$;

-- 6) 검증 — 개명 전후로 행 수·합계·유일키가 그대로여야 한다.
--    개명 전 실측(2026-07-22): 20행 / checkout_count 합계 3,068 / property_id 1종(=1, 신설 Agoda)
do $$
declare n int; s bigint;
begin
  select count(*), coalesce(sum(checkout_count), 0) into n, s from public.ota_channel_checkouts;
  if n <> 20 or s <> 3068 then
    raise exception '개명 후 데이터 불일치 — 행 % (기대 20), 합계 % (기대 3068)', n, s;
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'ota_channel_checkouts'
      and indexdef like '%UNIQUE%(property_id, week_start)%'
  ) then
    raise exception '(property_id, week_start) 유일키가 사라졌다 — 개명 실패';
  end if;
end $$;

-- 실행 결과 (2026-07-22): 20행 / 합계 3,068 / property_id = 1 단일 / 유일키
-- ota_channel_checkouts_key (property_id, week_start) 유지. 옛 이름은 남아 있지 않다.
