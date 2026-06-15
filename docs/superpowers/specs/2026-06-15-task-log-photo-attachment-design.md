# 진행사항 사진 첨부 (Google Drive) — 설계 문서

- **작성일**: 2026-06-15
- **대상**: VOC Task Dashboard — 수행과제 진행사항(`task_logs`)
- **목표**: 진행사항 글 작성 시 사진(최대 5장)을 함께 첨부하고, MGRV 구글 워크스페이스 Drive에 저장하여, 임베드를 포함한 모든 뷰에서 썸네일로 본다.

---

## 1. 배경 / 현재 구조

- 진행사항은 `task_logs` 테이블의 단일 `content` 텍스트로 운영된다. 타입은 말머리 인코딩으로 구분한다: `[이슈] `, `[해결] `, `[링크] 제목||URL`, 그 외는 일반 업데이트.
- 진행사항 읽기는 인증 API가 아닌 **Supabase 직접 조회**(`select('*')`)로 한다. 비로그인 노션 임베드(`/embed`)에서도 보이게 하기 위함이다.
- 현재 구글 로그인(NextAuth)은 **인증 전용**으로 Drive 쓰기 scope가 없다. 따라서 Drive 업로드에는 별도의 서버 권한이 필요하다.

## 2. 결정 사항 (확정)

| 항목 | 결정 | 근거 |
|---|---|---|
| 저장소 | MGRV 워크스페이스 Drive 전용 폴더 | 시설 PWA 등 워크스페이스 기반과 일관 |
| 인증 | 구글 **서비스 계정** | 로그인 OAuth에 Drive scope 없음. 누가 올려도 한 계정으로 일관 저장 |
| 첨부 모델 | 글에 사진 함께 첨부 (업데이트/이슈/해결 글에 동봉) | 글과 증거 사진이 한 항목으로 보임 |
| 장수 | 최대 5장 | before/after·여러 각도 증거 |
| 파일 공개 범위 | "링크가 있는 누구나 보기" | 임베드(비로그인)에서 사진 표시 필요. 앱 진입엔 인증이 있어 내부적으로 수용 가능 |

## 3. 아키텍처

### 3.1 저장 (Google Drive)
- 신규 모듈 `lib/drive.ts`:
  - `uploadImage(buffer, filename, mime) → { fileId }`: 서비스 계정으로 전용 폴더에 업로드 후, 해당 파일에 `anyone: reader` 권한 부여.
  - `deleteImage(fileId)`: best-effort 삭제.
- 표시 URL (DB에는 `fileId`만 저장, URL은 렌더 시 생성):
  - 썸네일: `https://drive.google.com/thumbnail?id={fileId}&sz=w1000`
  - 원본 열기: `https://drive.google.com/file/d/{fileId}/view`
- 환경변수:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` — 서비스 계정 키(JSON 문자열). Vercel·`.env.local`에만 저장, 메모리·리포 비저장.
  - `DRIVE_VOC_FOLDER_ID` — 업로드 대상 Drive 폴더 ID.
- 의존성: `googleapis` 패키지 추가.

### 3.2 데이터 (Supabase)
- `task_logs`에 컬럼 1개 추가:
  ```sql
  ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
  ```
  - 형식: `[{ "fileId": "...", "name": "..." }]` (최대 5개)
  - 기존 텍스트·말머리 인코딩은 그대로 둔다. 사진만 별도 컬럼.
  - 임베드는 `select('*')`라 자동 포함된다.

### 3.3 업로드 흐름 (2단계)
1. **업로드 API** — `POST /api/tasks/logs/upload` (multipart/form-data)
   - 로그인 세션 검증(`auth()`). 비로그인 거부.
   - 검증: 이미지 MIME만, 장당 ~10MB, 요청당 최대 5장.
   - Drive 업로드 → `[{ fileId, name }]` 반환.
2. **로그 생성 API** — 기존 `POST /api/tasks/logs` 확장
   - body에 `attachments?: [{fileId, name}]` 추가 수신 → insert 시 컬럼 채움.
   - 기존 슬랙 알림(`after()` + `notifyNewComment`) 동작 유지. (본문에 "사진 N장" 표기 추가는 선택)
   - 캐시 무효화 `revalidateTag('tasks', 'max')` 패턴 유지(누락 시 60초 지연 회귀).

### 3.4 UI (`components/TasksClient.tsx`)
- **입력부** (진행사항 추가 영역, 링크 버튼 옆):
  - 사진 버튼(🖼 아이콘) → `<input type="file" accept="image/*" multiple>`.
  - 선택 즉시 클라이언트 미리보기 썸네일(개별 × 제거), 5장 초과 차단.
  - "추가" 클릭 → ① `/upload`로 업로드 → ② 받은 `attachments`와 텍스트를 `/api/tasks/logs` POST → ③ `refreshLogs()`.
  - 업로드 중 로딩 표시(`submitting`/`Loader2` 기존 패턴 재사용).
- **렌더부** (로그 항목):
  - `l.attachments?.length > 0`이면 텍스트 아래 썸네일 그리드(2~3열). 클릭 시 원본 URL 새 탭.
  - 기존 `[링크]`/`[이슈]`/`[해결]` 렌더와 공존.
- **임베드**: 썸네일은 표시(공개 Drive URL), 업로드/삭제 버튼은 기존 `!embed` 가드로 숨김.

### 3.5 삭제
- 로그 삭제(`/api/tasks/logs/delete`) 시, 해당 로그의 `attachments`에 든 `fileId`들을 `after()`로 best-effort Drive 삭제. 실패해도 DB 삭제는 진행.

## 4. 선행 작업 (배포 전 1회 셋업) — 워크스페이스 관리 필요

1. Google Cloud Console에서 프로젝트 선택 → **서비스 계정 생성** → JSON 키 발급.
2. Drive API 사용 설정(Enable).
3. Drive에 **VOC 사진 전용 폴더** 생성 → 그 폴더를 서비스 계정 이메일(`...@...iam.gserviceaccount.com`)에 **편집자**로 공유 → 폴더 ID 확보.
4. `GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_VOC_FOLDER_ID`를 `.env.local`·Vercel 환경변수에 등록.

> 이 단계는 재헌님(또는 워크스페이스 관리자)이 수행. 구현은 이 셋업 완료를 전제로 한다. 단계별 안내 제공 가능.

## 5. 범위 밖 (YAGNI)

- 사진 단독 첨부(글 없이 사진만) — 글에 동봉으로 충분.
- 라이트박스/캐러셀 뷰어 — 1차는 새 탭 열기로. 필요 시 추후.
- 이미지 리사이즈·압축 — 1차는 원본 업로드. 용량 이슈 발생 시 추후.
- 영상·문서 등 비이미지 파일.

## 6. 영향받는 파일

- 신규: `lib/drive.ts`, `app/api/tasks/logs/upload/route.ts`
- 수정: `app/api/tasks/logs/route.ts`(POST 확장), `app/api/tasks/logs/delete/route.ts`(Drive 삭제), `components/TasksClient.tsx`(입력·렌더), `supabase/schema.sql`(컬럼), `package.json`(googleapis), `.env.local`/Vercel(환경변수), `CLAUDE.md`(문서)
