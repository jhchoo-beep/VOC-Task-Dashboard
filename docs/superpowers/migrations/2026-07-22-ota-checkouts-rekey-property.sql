-- 체크아웃 수를 지점 키에서 다시 채널(property) 키로 되돌린다.
-- 이 파일은 전체가 멱등이다 — 몇 번을 다시 실행해도 결과가 같고 에러도 나지 않는다.
--
-- 배경 (설계 오류 정정, 2026-07-22):
-- 2026-07-22-ota-detail-generalize.sql이 ota_agoda_review_rate의 checkout_count를
-- (property_id, week_start) → (branch, week_start)로 옮겼다. 근거는 "체크아웃 수는
-- 채널이 아니라 지점의 속성이다 — 같은 주 신설의 체크아웃 수는 아고다든 부킹이든
-- 하나다"였다. 이 전제가 틀렸다.
--   checkout_count(신설 주당 119~147)는 지점 전체 체크아웃이 아니라
--   **아고다로 예약한 고객의 체크아웃 수**다. 데이터 소유자(재헌)가 확인해 줬다.
-- 지점 키로 옮긴 순간 신설의 비아고다 채널들이 아고다의 분모를 그대로 빌려 쓰게 됐고,
-- 분자·분모가 서로 다른 모집단을 가리키는 값이 화면에 떴다
-- (실측: 신설 Booking "3.4%" = 부킹 리뷰 4건 / 아고다 체크아웃 119건).
-- 원래의 채널 단위 키가 옳았다. 되돌린다.
--
-- 결과: 체크아웃 데이터가 있는 채널은 신설 Agoda 하나뿐이므로 작성률도 신설 Agoda에서만
-- 산출된다. 나머지 채널은 기존의 "체크아웃 수가 입력되지 않았습니다" 안내를 그대로 본다.
-- 다른 채널의 체크아웃 수를 추정해 채워 넣지 않는다.

-- 1) property_id 컬럼 추가 (백필 전이라 우선 nullable)
alter table ota_branch_checkouts add column if not exists property_id integer;

-- 2) 백필. 기존 20행은 전부 옛 ota_agoda_review_rate(전 행 property_id=1, 신설 Agoda)에서
--    이관된 아고다 행이므로, 지점의 Agoda property로 되돌리면 원래 키가 복원된다.
--    역매핑에 중의성이 없다 — 원본에 아고다 외의 채널 행이 애초에 없었다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'ota_branch_checkouts' and column_name = 'branch'
  ) then
    execute $sql$
      update ota_branch_checkouts c
         set property_id = p.property_id
        from ota_properties p
       where c.property_id is null
         and p.branch = c.branch
         and p.ota_name = 'Agoda'
    $sql$;
  end if;
end $$;

-- 3) 매핑되지 않은 행이 하나라도 남으면 중단한다(조용한 손실 차단)
do $$
declare orphan int;
begin
  select count(*) into orphan from ota_branch_checkouts where property_id is null;
  if orphan > 0 then
    raise exception 'property_id 백필 실패 행 %건 — 마이그레이션 중단', orphan;
  end if;
end $$;

alter table ota_branch_checkouts alter column property_id set not null;

-- 4) FK
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ota_branch_checkouts_property_id_fkey'
  ) then
    alter table ota_branch_checkouts
      add constraint ota_branch_checkouts_property_id_fkey
      foreign key (property_id) references ota_properties(property_id);
  end if;
end $$;

-- 5) 옛 지점 키 제거
alter table ota_branch_checkouts drop constraint if exists ota_branch_checkouts_branch_week_start_key;
alter table ota_branch_checkouts drop column if exists branch;

-- 6) 새 유일키 (property_id, week_start) — 쓰기 API upsert의 onConflict 대상
create unique index if not exists ota_branch_checkouts_key
  on ota_branch_checkouts (property_id, week_start);

-- 검증 (2026-07-22 실행): 20행 전부 id·week_start·checkout_count 그대로 살아남았고
-- 전부 property_id = 1(신설 Agoda)로 이동했다. 합계 3,068 → 3,068. 손실 0건.
-- 테이블명의 'branch'는 역사적 잔재다 — 키는 property_id다.
