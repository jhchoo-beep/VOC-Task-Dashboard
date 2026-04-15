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
🔗 리뷰 종합 평점   → https://ota-review-dashboard.vercel.app/ (외부 링크, 새 탭)
──────────────────
대시보드
리뷰 데이터
월간 리포트
수행과제
분석 & 트렌드
Raw Data
```

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
```

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
