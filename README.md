# 🧳 MGRV VOC Dashboard

OTA 리뷰 기반 VOC 관리 & 수행과제 트래커

## 아키텍처

```
Claude Code → Supabase MCP → Supabase PostgreSQL → Next.js (Vercel)
```

---

## 배포 순서

### 1. Supabase DB 초기화
Supabase 대시보드 → SQL Editor → supabase/schema.sql 내용 실행

### 2. Google OAuth 설정
console.cloud.google.com → OAuth 2.0 클라이언트 ID 생성
리디렉션 URI: https://your-domain.vercel.app/api/auth/callback/google

### 3. Vercel 환경변수 설정

```
NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXTAUTH_URL=https://your-domain.vercel.app
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
ALLOWED_EMAIL_DOMAIN=mgrv.company
```

### 4. GitHub push → Vercel 배포

---

## 화면 구성

| 경로 | 기능 |
|---|---|
| /dashboard | CLX 현황, Critical 알림, 수행과제 진행률 |
| /reviews | OTA 리뷰 조회/필터 |
| /report | CLX 분석, CCI Top5, 변심 트리거 |
| /tasks | 수행과제 관리 (문제→해결→추적) |
| /analytics | 월별 CLX 추이, 카테고리 분포 |

## 로컬 개발

```bash
cp .env.example .env.local
npm install
npm run dev
```
