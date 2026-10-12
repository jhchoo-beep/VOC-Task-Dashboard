-- VOC V2 — voc_stars 고유 키에 발췌(quote)를 더한다 (2026-10-13, 2026-10-12-voc-v2-tables.sql 의 후속)
--
-- 왜: 첫 마이그레이션의 고유 키 voc_stars_one_voice = (source, source_ref, polarity, phenomenon)
--     「한 원본·한 현상·한 극성 = 별 하나」. 백필 적재 중 이 키에 걸렸다(20-stars-05).
--     원인은 A4 현상 이름 합침(「호텔식 서비스 없음」 → 「셀프 운영 번거로움」). 추출 때는 서로 다른 현상이라
--     build-stars.ts 의 「같은 리뷰에서 같은 현상 두 번」 검사를 통과했고, 합친 뒤 같은 리뷰 3건에서
--     같은 현상 별이 2개씩 됐다(S-01837·01838, S-02014·02015, S-02025·02026 — 모두 C-신설-033, 발췌는 서로 다름).
--     universe.json(별 2,108)은 화면·발표·앱이 함께 쓰는 계약이라 데이터를 바꾸지 않고, 키에 발췌를 더한다.
--     같은 발췌를 같은 현상으로 두 번 넣는 것은 계속 막는다.
-- 합친 뒤 같은 리뷰의 같은 현상 별을 하나로 줄일지는 열린 질문(설계서 「알려진 한계」).
-- 🔴 새 표(voc_stars)만 바꾼다. 다시 실행해도 같은 결과.

alter table public.voc_stars drop constraint if exists voc_stars_one_voice;
alter table public.voc_stars add constraint voc_stars_one_voice unique (source, source_ref, polarity, phenomenon, quote);
