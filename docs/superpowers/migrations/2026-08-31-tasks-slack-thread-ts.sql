-- 2026-08-31 — 수행과제 슬랙 알림을 등록 스레드에 묶기
--
-- 배경: 진행사항 댓글마다 스쿼드 채널에 새 최상위 메시지가 생겨 노이즈가 됐다.
-- 등록 알림 메시지의 ts를 과제에 저장해 두고, 이후 알림을 그 스레드의 답글로 보낸다
-- (reply_broadcast=true로 채널에도 함께 표시).
--
-- NULL이면 이 기능 이전에 등록된 과제다 — 기존처럼 채널 최상위 메시지로 나간다(lib/slack.ts 폴백).
-- 코드보다 먼저 적용해야 한다: 컬럼이 없으면 등록 직후 ts 저장 UPDATE가 실패한다.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS slack_thread_ts TEXT;

-- 2026-08 수행과제 4건 백필 — /voc-analysis 실행 중 직접 발송한 등록 알림의 ts.
-- (스킬이 앱 API를 우회해 Supabase에 INSERT하므로 앱의 ts 저장 경로를 타지 않았다)
UPDATE tasks SET slack_thread_ts = '1788177972.875829' WHERE id = '154c35f2-3e8a-428a-b973-5b91b83b06d3';
UPDATE tasks SET slack_thread_ts = '1788177973.247059' WHERE id = '39dad1d9-ca66-46c4-a1a5-77d38ac60891';
UPDATE tasks SET slack_thread_ts = '1788177973.610479' WHERE id = '13e3e0c4-cb01-4bbb-bef5-edc172fb8b7d';
UPDATE tasks SET slack_thread_ts = '1788177974.001269' WHERE id = '61671514-2ab7-479e-a30b-ca993c9ed498';

-- 아직 살아있는(진행중·보류) 기존 과제 백필 — 스쿼드 채널의 등록 알림 메시지에서 ts를 찾아 매칭.
-- 완료 32건은 앞으로 댓글이 붙지 않아 대상에서 제외했다.
-- 제주시티 「소음 반복 구간 특정 및 야간 정숙 안내 배치」는 채널(C07HSELN5S9)을 읽을 수 없어 백필하지 못했다
-- — 값이 NULL이라 기존처럼 최상위 메시지로 나간다(동작에는 문제 없음).
UPDATE tasks SET slack_thread_ts = '1782868736.833849' WHERE id = 'a77e882f-fcf5-47a5-8805-57c3dca3b1fa';
UPDATE tasks SET slack_thread_ts = '1782868737.165519' WHERE id = '3701b9e7-b2cc-4c32-908a-2cba4be1e666';
UPDATE tasks SET slack_thread_ts = '1785636519.341479' WHERE id = '4a95b104-c9ef-45c0-8309-e7c21124013c';
UPDATE tasks SET slack_thread_ts = '1782868738.340349' WHERE id = '196fb06f-719b-4779-8921-c7ea3bb86dff';
UPDATE tasks SET slack_thread_ts = '1785636539.682109' WHERE id = 'e01b6fbc-e02e-44ef-90ca-3b6a84a5d8cf';
