# MGRV 리뷰 데이터 수집 자동화 가이드

## 개요

Claude Code(터미널)에서 OTA 리뷰를 수집하여 Supabase `reviews` 테이블에 INSERT할 때 반드시 지켜야 할 규칙 모음.

---

## DB 삽입 전 필수 체크리스트

### ✅ 1. 한국어 번역 (`content_ko`)
- 외국어 리뷰(일본어, 중국어, 영어 등)는 반드시 자연스러운 한국어로 번역
- 한국어 리뷰는 `content` 내용을 그대로 `content_ko`에 복사
- 번역 시 원문 뉘앙스와 불만 강도를 유지할 것 (순화 금지)

```sql
-- 예시
content    = "とても清潔で快適でした"
content_ko = "매우 청결하고 쾌적했습니다"
```

---

### ✅ 2. OTA별 평점 환산 (10점 만점 기준)

| OTA | 원본 만점 | 환산 방식 |
|---|---|---|
| 아고다 | 10점 | 그대로 사용 |
| 부킹닷컴 | 10점 | 그대로 사용 |
| 트립닷컴 | 10점 | 그대로 사용 |
| 익스피디아 | 10점 | 그대로 사용 |
| **야놀자** | **5점** | **× 2 환산** (예: 4.5점 → 9.0점) |
| **여기어때** | **5점** | **× 2 환산** (예: 3.0점 → 6.0점) |
| **에어비앤비** | **5점** | **× 2 환산** (예: 4.0점 → 8.0점) |
| **NOL** | **5점** | **× 2 환산** (예: 4.0점 → 8.0점) |

> ⚠️ 새로운 OTA 추가 시 반드시 만점 기준 확인 후 이 파일에 추가할 것

---

### ✅ 3. 고객 세그먼트 자동 산정 (`customer_segment`)

환산된 10점 만점 기준으로 계산:

| 평점 | 세그먼트 |
|---|---|
| 9.0 ~ 10.0 | `충성` |
| 7.0 ~ 8.9 | `만족` |
| 5.0 ~ 6.9 | `위험` |
| 0.0 ~ 4.9 | `이탈` |

---

### ✅ 4. Severity 자동 산정

우선순위 순서로 적용:

1. `청결 Critical` 트리거 포함 → **Critical**
2. `복합이슈` 트리거 + 평점 < 6 → **Critical**
3. `복합이슈` 트리거 + 평점 ≥ 6 → **High**
4. 평점 ≤ 3 → **Critical**
5. 평점 ≤ 5 → **High**
6. 평점 ≤ 7 → **Medium**
7. 평점 > 7 → **Low**

---

### ✅ 5. 변심 트리거 추출 (`churn_triggers`)

리뷰 내용에서 아래 트리거를 감지하여 배열로 삽입:

| 트리거 | 감지 기준 |
|---|---|
| `청결 Critical` | 이불 얼룩, 두드러기, 벌레, 심각한 위생 문제 언급 |
| `복합이슈` | 2가지 이상 불만 카테고리 + 평점 6 이하 |
| `서비스 실패` | 직원 불응, 연락 두절, 문제 미해결, 환불 거부 언급 |
| `가격 불일치` | 표시 가격과 실제 청구 금액 차이, 숨겨진 요금 언급 |

---

### ✅ 6. 카테고리 태깅 (`categories`)

리뷰 내용 키워드 기반으로 복수 선택:

| 카테고리 | 감지 키워드 예시 |
|---|---|
| `청결` | 더럽다, 냄새, 얼룩, 청소, 위생, 먼지, dirty, clean, 清潔, 清掃, きれい |
| `소음` | 시끄럽다, 소음, 방음, 문소리, うるさい, noise, loud |
| `시설` | 시설, TV, 거울, 콘센트, 드라이어, 냉장고, facility, 設備 |
| `직원서비스` | 직원, 스태프, 체크인, 대응, staff, 対応, スタッフ |
| `체크인/체크아웃` | 체크인, 체크아웃, 셀프, QR, チェックイン |
| `위치/접근성` | 위치, 교통, 지하철, 역, location, 交通, 駅 |
| `어메니티` | 어메니티, 수건, 샴푸, 세면도구, amenity, タオル |
| `가격` | 가격, 코스파, 가성비, CP값, price, コスパ |
| `보안` | 보안, 잠금, 열쇠, 안전, security, lock, 防犯 |

---

### ✅ 7. 중복 삽입 방지

삽입 전 동일 데이터 존재 여부 확인:

```sql
SELECT id FROM reviews
WHERE branch = '{지점}'
  AND ota_site = '{OTA}'
  AND review_month = '{YYYY-MM}'
  AND content = '{원문 일부}'
LIMIT 1;
```

결과가 있으면 INSERT 건너뜀.

---

### ✅ 8. 필수 필드 누락 방지

아래 필드는 반드시 값이 있어야 INSERT 가능:

| 필드 | 필수 여부 | 비고 |
|---|---|---|
| `branch` | ✅ 필수 | 신설/동대문/제주시티/고성 |
| `ota_site` | ✅ 필수 | 원문 그대로 (아고다, 에어비앤비 등) |
| `rating` | ✅ 필수 | 10점 만점으로 환산된 값 |
| `review_month` | ✅ 필수 | `YYYY-MM` 형식 |
| `content` | ✅ 필수 | 원문 (번역 전) |
| `content_ko` | ✅ 필수 | 한국어 번역본 |
| `severity` | ✅ 필수 | Critical/High/Medium/Low |
| `customer_segment` | ✅ 필수 | 충성/만족/위험/이탈 |
| `categories` | ✅ 필수 | 최소 1개 이상 |
| `status` | ✅ 필수 | 기본값: `신규접수` |

---

### ✅ 9. 리뷰 내용이 없는 경우 처리

- 평점만 있고 리뷰 본문 없는 경우 → `content = '(코멘트 없음)'`, `content_ko = '(코멘트 없음)'`
- 완전히 빈 행 → INSERT 건너뜀
- 리뷰 내용이 매우 짧은 경우 (예: "Good", "좋아요") → 그대로 삽입, 카테고리는 `['기타']`

---

### ✅ 10. `review_month` 날짜 형식

- 반드시 `YYYY-MM` 형식으로 통일
- 잘못된 예: `2026년 3월`, `26/03`, `March 2026`
- 올바른 예: `2026-03`

---

### ✅ 11. 지점명 표준화

반드시 아래 표준 지점명 사용:

| 표준 지점명 | 허용 별칭 |
|---|---|
| `신설` | 신설동, Sinseol |
| `동대문` | DDM, Dongdaemun |
| `제주시티` | 제주, Jeju, Jeju City |
| `고성` | Goseong |

---

### ✅ 12. 삽입 후 검증

INSERT 완료 후 아래 쿼리로 정상 삽입 확인:

```sql
SELECT
  branch,
  ota_site,
  COUNT(*) as 건수,
  ROUND(AVG(rating)::numeric, 2) as 평균평점,
  COUNT(*) FILTER (WHERE content_ko IS NULL) as 번역누락,
  COUNT(*) FILTER (WHERE severity IS NULL) as severity누락,
  COUNT(*) FILTER (WHERE customer_segment IS NULL) as 세그먼트누락
FROM reviews
WHERE review_month = '{삽입한 월}'
GROUP BY branch, ota_site
ORDER BY branch, ota_site;
```

`번역누락`, `severity누락`, `세그먼트누락`이 모두 0이어야 정상.

---

## INSERT 예시 템플릿

```sql
INSERT INTO reviews (
  branch, ota_site, rating, review_month,
  content, content_ko,
  categories, severity, churn_triggers,
  customer_segment, priority_score, crs_score, status
) VALUES (
  '동대문',          -- branch
  '아고다',          -- ota_site
  8.8,               -- rating (10점 만점 환산값)
  '2026-04',         -- review_month (YYYY-MM)
  '원문 내용',       -- content
  '한국어 번역본',   -- content_ko
  ARRAY['청결','위치/접근성'],  -- categories
  'Low',             -- severity
  ARRAY[]::text[],   -- churn_triggers
  '만족',            -- customer_segment
  0, 0,              -- priority_score, crs_score
  '신규접수'         -- status
);
```

---

## OTA별 리뷰 수집 시 유의사항

| OTA | 특이사항 |
|---|---|
| 아고다 | 노션 표 형식으로 수집 가능. 날짜·점수·리뷰어·국가·여행유형·객실·리뷰내용·답변 컬럼 |
| 에어비앤비 | **5점 만점 → 2배 환산 필수**. 날짜가 "약(約)" 표기될 수 있음 |
| 야놀자 | **5점 만점 → 2배 환산 필수** |
| 여기어때 | **5점 만점 → 2배 환산 필수** |
| 트립닷컴 | xls 다운로드 후 투숙일자 기준으로 필터링 필요. 리뷰 시간과 투숙 날짜가 다를 수 있음 |
| 부킹닷컴 | 코멘트 없는 평점만 있는 리뷰도 포함 가능 |
| NOL | **5점 만점 → 2배 환산 필수**. 리뷰 없음인 경우가 많으므로 페이지 확인 후 수집 |
| 익스피디아 | 리뷰 없음인 경우가 많으므로 페이지 확인 후 수집 |

---

## 관련 파일

- `lib/supabase.ts` — `calcCLX()`, `getSegment()` 함수
- `lib/utils.ts` — `formatMonth()`, `parseMonth()` 유틸
- `supabase/schema.sql` — 전체 테이블 스키마
- `CLAUDE.md` — 프로젝트 전체 컨텍스트

