# MGRV VOC 대시보드 — 프로젝트 컨텍스트

## 프로젝트 개요

MGRV(맹그로브) 호텔 체인의 OTA 리뷰 수집 → 분석 → 수행과제 도출 → 진행 추적을 위한 내부 웹 대시보드.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) |
| 인증 | NextAuth.js v5 + Google OAuth |
| DB | Supabase PostgreSQL |
| 배포 | Vercel |
| 스타일 | CSS Variables 다크 테마 (인라인 스타일) |
| 주요 패키지 | `@supabase/supabase-js`, `next-auth`, `lucide-react`, `recharts` |

---

## 인프라 정보

```
Supabase Project ID : slyfyrkqfdkoaaochspa
Supabase URL        : https://slyfyrkqfdkoaaochspa.supabase.co
Vercel URL          : https://voc-task-dashboard.vercel.app
GitHub Repo         : https://github.com/jhchoo-beep/VOC-Task-Dashboard
```

### 접근 제한
- `@mgrv.company` 이메일 도메인만 로그인 허용 (`ALLOWED_EMAIL_DOMAIN` 환경변수)

---

## 파일 구조

```
app/
  (app)/
    dashboard/    대시보드 (CLX, 미처리 이슈, 수행과제 진행률)
    reviews/      리뷰 데이터 (파싱·정제된 데이터)
    rawdata/      Raw Data (원본 수집 데이터)
    report/       월간 리포트
    tasks/        수행과제 트래킹
    analytics/    분석 & 트렌드
  api/
    reviews/      GET·POST·PATCH·DELETE
    rawdata/      GET·POST·DELETE
    tasks/        GET·POST·PATCH·DELETE
    tasks/logs/   진행 로그 GET·POST·DELETE
    tasks/status/ 상태 변경 PATCH
components/
  Sidebar.tsx         사이드바 (외부링크 탭 + 내부 탭)
  DashboardClient.tsx 대시보드 클라이언트
  ReviewsClient.tsx   리뷰 데이터 클라이언트
  RawDataClient.tsx   Raw Data 클라이언트
  TasksClient.tsx     수행과제 클라이언트
  ReportClient.tsx    월간 리포트 클라이언트
  AnalyticsClient.tsx 분석 & 트렌드 클라이언트
lib/
  supabase.ts   Supabase 클라이언트 + calcCLX + getSegment
  utils.ts      formatMonth, parseMonth, generateMonthOptions
```

---

## Supabase 테이블 구조

### `reviews` — 파싱·정제된 리뷰 데이터
```sql
id              UUID PK
branch          TEXT        -- 지점명 (신설/동대문/제주시티/고성)
ota_site        TEXT        -- OTA 사이트명
rating          NUMERIC     -- 0~10점
review_month    TEXT        -- 'YYYY-MM' 형식
content         TEXT        -- 원문
content_ko      TEXT        -- 한국어 번역본 (자동 번역)
categories      TEXT[]      -- ['청결','소음','시설'...]
severity        TEXT        -- Critical / High / Medium / Low
churn_triggers  TEXT[]      -- 변심 트리거
customer_segment TEXT       -- 충성 / 만족 / 위험 / 이탈
priority_score  NUMERIC
crs_score       NUMERIC
status          TEXT        -- 신규접수 / 완료 / 문서화완료 등
created_at      TIMESTAMPTZ
```

### `tasks` — 수행과제
```sql
id                  UUID PK
branch              TEXT
task_month          TEXT        -- 'YYYY-MM'
title               TEXT
severity            TEXT
churn_trigger       TEXT[]
problem_definition  TEXT
solution            TEXT
review_content      TEXT        -- 관련 리뷰 본문
category            TEXT[]
assignee            TEXT
due_date            TEXT
status              TEXT        -- 시작전 / 진행중 / 완료 / 보류
linked_review_ids   UUID[]
done_memo           TEXT
link_url            TEXT        -- 참고 링크 URL
link_label          TEXT        -- 참고 링크 제목
created_at          TIMESTAMPTZ
```

### `task_logs` — 수행과제 진행 로그
```sql
id         UUID PK
task_id    UUID FK → tasks
author     TEXT
content    TEXT    -- '[링크] 제목||URL' 형식이면 링크로 렌더링
attachments JSONB  -- Drive fileId 배열 [{fileId,name}], 최대 5장. 진행사항 첨부 사진
created_at TIMESTAMPTZ
```

### `raw_reviews` — 원본 수집 데이터 (미처리)
```sql
id           UUID PK
branch       TEXT
ota_site     TEXT
review_month TEXT
reviewer     TEXT
country      TEXT
travel_type  TEXT
room_type    TEXT
rating       NUMERIC
content      TEXT
has_response BOOLEAN
raw_date     TEXT
created_at   TIMESTAMPTZ
```

### `ota_properties` — 지점 × OTA 채널 마스터
```sql
property_id  INTEGER PK
branch       TEXT        -- 신설 / 동대문 / 제주시티 / 고성
ota_name     TEXT        -- Agoda / Booking / Trip.com / Expedia / Airbnb / NOL / 여기어때
score_max    INTEGER     -- 채널 만점 (10 또는 5) — 점수 밴드·분포 컬럼 수를 결정
okr_target   NUMERIC
ota_url      TEXT
active       BOOLEAN
```

### `ota_scores` — 채널별 종합 점수 스냅샷
```sql
id            BIGINT PK
property_id   INTEGER FK → ota_properties
overall_score NUMERIC
review_count  INTEGER
recorded_at   DATE
cleanliness / facilities / location / service / value_for_money  NUMERIC
created_at    TIMESTAMPTZ
```

### OTA 상세 3종 — `ota_score_dist` · `ota_complaints` · `ota_voc`

세 표 모두 **전 채널 공용**이다(아고다 전용이 아니다). 공통 축이 둘 있다.

| 컬럼 | 값 | 의미 |
|---|---|---|
| `granularity` | `'week'` / `'month'` | 원본이 주 단위 날짜를 주는 채널은 `week`, 월 단위만 주는 채널(에어비앤비·여기어때)은 `month`. 월 버킷의 `week_start`는 그 달 1일 |
| `source` | `'manual'` / `'derived'` | 사람이 UI로 넣은 행인지, 파생 배치가 쓴 행인지. `--fill-empty`가 **행의 존재가 아니라 이 값으로** 보존 여부를 판단한다 |

```sql
-- ota_score_dist — 점수 분포 (raw_reviews의 실제 rating 집계, LLM 미경유)
id                BIGINT PK
property_id       INTEGER FK → ota_properties
week_start        DATE
granularity       TEXT     -- 'week' | 'month'
source            TEXT     -- 'manual' | 'derived'
score_1 … score_10 INTEGER -- 만점 5인 채널은 score_1~score_5만 사용
weekly_avg_score  NUMERIC
created_at        TIMESTAMPTZ
-- UNIQUE (property_id, week_start, granularity)

-- ota_complaints — 객실·욕실 불만 건수 (LLM 배치 산출)
id                  BIGINT PK
property_id         INTEGER FK → ota_properties
week_start          DATE
granularity         TEXT
source              TEXT
room_complaints     INTEGER
bathroom_complaints INTEGER
memo                TEXT
created_at          TIMESTAMPTZ
-- UNIQUE (property_id, week_start, granularity)

-- ota_voc — 버킷별 VOC 키워드 (LLM 배치 산출, 한 버킷에 여러 행)
id          BIGINT PK
property_id INTEGER FK → ota_properties
week_start  DATE
granularity TEXT
source      TEXT
band        TEXT     -- 점수 밴드
category    TEXT
sentiment   TEXT
keyword     TEXT
created_at  TIMESTAMPTZ
```

### `ota_branch_checkouts` — 채널별 주간 체크아웃 수 (리뷰 작성률의 분모)
```sql
id             BIGINT PK
property_id    INTEGER FK → ota_properties
week_start     DATE
checkout_count INTEGER
created_at     TIMESTAMPTZ
-- UNIQUE (property_id, week_start)
```

> ⚠️ **표 이름의 `branch`는 역사적 잔재다. 키는 `property_id`(지점 × 채널)다.**
>
> 체크아웃 수는 지점 공용값이 **아니다**. `checkout_count`(신설 주당 119~147)는 지점 전체 체크아웃이 아니라 **그 채널로 예약한 고객의 체크아웃 수**다(신설 20행은 전부 아고다 예약 기준). 그래서 채널 단위로 저장하고, 한 채널에 넣은 값은 같은 지점의 다른 채널에 반영되지 않는다.
>
> 2026-07-22에 이 표를 잠시 `(branch, week_start)` 키로 옮긴 적이 있다. "체크아웃 수는 지점의 속성"이라는 **틀린 전제**에서 나온 변경이었고, 그 결과 신설의 비아고다 채널들이 아고다 분모를 빌려 써 분자·분모의 모집단이 어긋난 값이 화면에 떴다(신설 Booking "3.4%" = 부킹 리뷰 4건 / 아고다 체크아웃 119건). 같은 날 채널 키로 되돌렸다 — `docs/superpowers/migrations/2026-07-22-ota-checkouts-rekey-property.sql`. **다시 지점 단위로 묶지 말 것.**
>
> 현재 체크아웃 데이터가 있는 채널은 **신설 Agoda 하나뿐**이다. 따라서 작성률이 나오는 조합도 신설 Agoda 하나다. 나머지 채널은 "체크아웃 수가 입력되지 않았습니다" 안내를 본다 — 추정값으로 채우지 않는다.
>
> 분자인 리뷰 건수는 **`ota_scores` 스냅샷의 주간 델타**에서 파생한다(별도 저장하지 않는다). `lib/pageData.ts`가 채널별로 `이번 주 review_count - 지난주 review_count`를 계산하고 음수는 0으로 클램프한다. 직전 스냅샷이 없는 첫 주는 델타를 낼 수 없어 작성률이 나오지 않는다.
>
> ⚠️ **`ota_score_dist`가 아니다.** 점수 분포는 `raw_reviews` **표본**을 집계한 값이고, 작성률 분자는 OTA 사이트가 표시하는 **총 리뷰 수의 증가분(전수)** 이다. 두 서브탭의 숫자는 실제로 어긋난다 — 동대문 Agoda 2026-06-29은 스냅샷 델타 26건, raw 표본 2건이다(Agoda raw 커버리지 31~34%). 같은 소스라고 읽으면 이 차이가 버그로 보인다.
>
> 작성률(분자·분모·비율)을 통째로 들고 있던 옛 표 `ota_agoda_review_rate`는 **2026-07-22 드롭됐다**(체크아웃 20행 전부 `ota_branch_checkouts`로 이관 확인 후). 마이그레이션 기록은 `docs/superpowers/migrations/`.

---

## 주요 비즈니스 로직

### 고객 세그먼트 자동 계산
| 평점 | 세그먼트 |
|---|---|
| 9.0~10 | 충성 |
| 7.0~8.9 | 만족 |
| 5.0~6.9 | 위험 |
| 0~4.9 | 이탈 |

### Severity 자동 산정
- `청결 Critical` 트리거 → **Critical**
- `복합이슈` + 평점 < 6 → **Critical**
- `복합이슈` → **High**
- 평점 ≤ 3 → **Critical**
- 평점 ≤ 5 → **High**
- 평점 ≤ 7 → **Medium**
- 평점 > 7 → **Low**

### CLX (고객 충성도 지수)
`calcCLX(loyal_pct, satisfied_pct, at_risk_pct, churned_pct)` — `lib/supabase.ts` 참조

### 월 표시 형식
- DB 저장: `2026-03` (YYYY-MM)
- UI 표시: `2026년 3월` (`formatMonth()` 유틸 사용)

---

## 사이드바 탭 구성

```
대시보드
OTA 점수 현황
리뷰 데이터
수행과제
──────────────────
월간 리포트
분석 & 트렌드
성과 & 개선 이력
──────────────────
Raw Data
```

### OTA 점수 현황 — 상세 탭

지점 + 채널을 고르면 `📊 기본 추이` 옆에 `🔍 <채널> 상세` 탭이 뜬다. **아고다 전용이 아니라 전 채널에 존재한다.** 서브탭은 4종 — `리뷰 작성률` · `점수 분포` · `불만 분석` · `VOC`.

- 원본이 월 단위 날짜만 주는 채널(에어비앤비·여기어때)은 주별 토글 대신 "월 단위 날짜만 제공" 안내가 뜨고, 월별로만 표시된다
- 리뷰 작성률은 **해당 채널의** `ota_branch_checkouts`가 있어야 산출된다 — 없으면 「데이터 입력」으로 유도하는 안내가 나온다. 현재 데이터가 있는 채널은 신설 Agoda 하나뿐이라, 작성률 그래프가 뜨는 곳도 신설 Agoda 하나다

---

## 번역 처리 방식

- `reviews.content_ko` 컬럼에 한국어 번역 저장
- 노션에서 데이터 파싱 시 제가 직접 번역하여 INSERT
- 한국어 리뷰는 `content` 를 그대로 `content_ko` 에 복사
- UI에서 `content_ko` 우선 표시, 원문 토글 버튼 제공

---

## 데이터 입력 방식

### 리뷰 데이터 (`reviews`)
1. **노션 페이지 파싱** — 노션 링크 공유 시 Claude가 직접 파싱 → 번역 → Supabase INSERT
2. **수동 추가** — 앱 UI에서 직접 입력 (세그먼트·Severity 자동 계산)

### Raw Data (`raw_reviews`)
1. **텍스트 통째 붙여넣기** — OTA 페이지 복사본 그대로 저장
2. **CSV 파일 업로드** — 헤더 자동 인식 (한글/영문 모두 지원)

### OTA 상세 데이터 (`ota_score_dist` · `ota_complaints` · `ota_voc` · `ota_branch_checkouts`)
1. **수기 입력** — OTA 점수 현황 우측 상단 「데이터 입력」. 이렇게 들어간 행은 `source='manual'`
2. **파생 배치** — `npm run derive:ota`가 `raw_reviews`를 읽어 산출. 이 행은 `source='derived'`
   - `--fill-empty`는 `source='manual'` 행을 덮어쓰지 않는다(사람 손이 닿은 행 보존)
   - 점수 분포는 실제 `rating` 집계로 LLM을 거치지 않고, 불만·VOC만 LLM 배치를 탄다
   - 체크아웃 수는 파생 대상이 아니다 — **채널 단위** 수기 입력값이다(`POST /api/ota/channel-checkouts`)

---

## 환경변수 (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXTAUTH_URL=https://voc-task-dashboard.vercel.app
NEXTAUTH_SECRET=<random string>
GOOGLE_CLIENT_ID=<google oauth client id>
GOOGLE_CLIENT_SECRET=<google oauth client secret>
ALLOWED_EMAIL_DOMAIN=mgrv.company
GOOGLE_SERVICE_ACCOUNT_JSON=<진행사항 사진 업로드용 서비스 계정 키 JSON(한 줄)>
DRIVE_VOC_FOLDER_ID=<사진 저장 Drive 전용 폴더 ID>
```

> 진행사항 사진 첨부: 서비스 계정으로 Drive 전용 폴더에 업로드(`lib/drive.ts`), 업로드 파일은 '링크 있는 누구나 보기' 권한 부여(임베드 비로그인 표시용). 위 두 환경변수가 `.env.local`·Vercel에 모두 있어야 업로드가 동작한다.

---

## 윈도우 배포 방법 (매번 동일)

```bash
cd ~/Downloads/mgrv-voc-app/mgrv-voc

git init
git add .
git commit -m "커밋 메시지"
git remote add origin https://github.com/jhchoo-beep/VOC-Task-Dashboard.git
git branch -M main
git push -u origin main --force
```

> `remote origin already exists` 에러 시: `git remote set-url origin https://github.com/jhchoo-beep/VOC-Task-Dashboard.git`

---

## 팀원 온보딩

1. GitHub repo clone: `git clone https://github.com/jhchoo-beep/VOC-Task-Dashboard.git`
2. `.env.local` 파일 생성 (위 환경변수 참조)
3. `npm install && npm run dev`
4. Supabase anon key 공유 가능 / service_role key 공유 금지
