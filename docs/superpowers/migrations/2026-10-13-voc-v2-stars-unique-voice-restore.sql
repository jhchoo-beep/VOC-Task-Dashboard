-- VOC V2 — voc_stars 고유 키를 원래대로 되돌린다 (2026-10-13, voc_v2_stars_unique_quote 취소)
--
-- 결정(2026-10-13 모더레이터, 정의 근거): 별 = 리뷰 속 목소리 1개. 한 원본·한 극성·한 현상은 별 하나다.
--     A4 현상 이름 합침(「호텔식 서비스 없음」 → 「셀프 운영 번거로움」) 뒤 같은 리뷰에서 같은 현상 별이
--     2개가 된 3쌍은 규칙을 느슨하게 두지 않고 데이터를 고쳤다. build-universe.ts(앱 브랜치 53c0965)가
--     ID를 매긴 뒤 하나만 남기고(S-01838, S-02015, S-02026), S-01837·S-02014·S-02025는 운영 표에서 ID로 지웠다.
--     그래서 키에 발췌(quote)를 더했던 후속 마이그레이션(2026-10-13-voc-v2-stars-unique-quote.sql)을 되돌린다.
-- 🔴 새 표(voc_stars)만 바꾼다. 다시 실행해도 같은 결과.

alter table public.voc_stars drop constraint if exists voc_stars_one_voice;
alter table public.voc_stars add constraint voc_stars_one_voice unique (source, source_ref, polarity, phenomenon);
