-- 행의 출처(수기 입력 vs 파생 배치)를 구분한다.
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

alter table ota_score_dist add constraint ota_score_dist_source_chk check (source in ('manual','derived'));
alter table ota_complaints add constraint ota_complaints_source_chk check (source in ('manual','derived'));
alter table ota_voc        add constraint ota_voc_source_chk        check (source in ('manual','derived'));
