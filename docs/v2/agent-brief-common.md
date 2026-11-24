# 2.0 화면 이식 공통 지시서 (에이전트용)

## 배경
- MGRV(맹그로브) STAY 지점의 OTA 리뷰 VOC 대시보드를 1.0에서 2.0으로 다시 만드는 중이다. 2.0 기획은 11/24 회의에서 승인됐다. 설계 문서: `docs/v2/2026-11-24-voc-2.0-rebuild.md` — 먼저 읽는다.
- 저장소 원본: `C:\Users\MGRV\.claude\VOC-Task-Dashboard` (Next.js 16 App Router + NextAuth + Supabase). `AGENTS.md`대로 **이 Next.js 는 학습 데이터와 다르다** — 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 관련 문서를 읽는다(예: 페이지 `searchParams` 는 Promise).
- 2.0 은 같은 앱의 `/v2` 경로에서 1.0 과 따로 돈다. 셸, 디자인 토큰, 홈, 불편 지수 화면은 이미 있다(커밋 774b263).

## 디자인 (반드시 따를 것)
- 기준 시안: OPS AOMS 화면 시안 D안 = A 보고서형 홈 + **B 관제 콘솔형 세부**. 원본 `C:\Users\MGRV\.claude\Output\2026-09-24_ops-aoms-blueprint\screen-samples\src\D.dc.html`(B 부분 = `isArea` 블록: 상단 52px 바(경로, 지점 세그먼트, 검색) → 지표 줄 4칸 → 3단(왼쪽 420px 목록 / 가운데 상세 / 오른쪽 360px 기준·판단·Raw Data)).
- **이미 만든 2.0 화면을 그대로 본뜬다**: `components/v2/DiscomfortConsole.tsx`(B 콘솔), `app/v2/page.tsx`(A 홈), 클래스는 `app/v2/v2.css`, 공용 조각 `components/v2/parts.tsx`. 이 셋은 **고치지 않는다**(읽고 import 만). 새 클래스가 필요하면 자기 화면 전용 CSS 파일(예: `app/v2/<탭>/<탭>.css`)에 `.v2 .<탭접두어>-…` 로만 만든다.
- 색은 CSS 변수만(`var(--panel)`, `var(--warn)` …). 다크(기본)와 라이트 둘 다에서 읽혀야 한다. 숫자는 `className="num"`(G마켓 산스). 이모지 금지. lucide 아이콘을 꼭 써야 하면 최소로.
- 문구: 한국어, 버튼·라벨·표 머리는 명사형, 「고객」 대신 「이용객」. 설명 문장·각주를 화면에 늘어놓지 않는다(데이터만). 앱이 원인이나 조치를 지어내지 않는다.
- 폭 1440·1280·820·400 에서 깨지지 않게(가로 스크롤은 표 안에서만).

## 범위 규칙
- **1.0 파일은 고치지 않는다**: `app/(app)/**`, `app/embed/*`(v2 제외), `components/*.tsx`(루트), 기존 `lib/*.ts`, `app/api/**`, `middleware.ts`, `auth.ts`, `app/globals.css`. 필요하면 읽고 import 한다. 기존 API(`app/api/**`)는 그대로 호출해 쓴다.
- 새 파일만 만든다: `app/v2/<탭>/**`, `components/v2/<탭>/**`, 필요하면 `lib/v2/<탭>*.ts`(+ 테스트), 읽기 전용 임베드 `app/embed/v2/<탭>/page.tsx`(확인용, 쓰기 컨트롤 숨김).
- `app/v2/<탭>/page.tsx` 는 지금 「작업 중」 자리 페이지다 — 이것만 덮어써도 된다.
- **DB 에 쓰지 않는다.** Supabase 는 운영 DB 다. 확인은 읽기와 화면 캡처로만 한다. 쓰기 기능(등록·수정·삭제·업로드)은 코드로 연결하되 직접 눌러 보지 않는다. 표 구조(DDL) 변경 금지.
- git: 자기 worktree 브랜치에만 커밋한다. **push, 배포, main 병합 금지.** `.env.local` 은 커밋하지 않는다.

## 확인 방법
1. worktree 에는 `node_modules` 와 `.env.local` 이 없다. `node_modules` 는 `cmd /c mklink /J node_modules C:\Users\MGRV\.claude\VOC-Task-Dashboard\node_modules` 로 연결해 보고, 빌드가 깨지면 `npm ci` 로 설치한다. `.env.local` 은 원본 저장소 것을 복사한다(값을 출력하지 말 것).
2. `npx tsc --noEmit -p .`, `npx vitest run lib/v2`
3. 운영과 같은 빌드로 띄운다(Git Bash):
   ```
   export NEXT_PUBLIC_SUPABASE_URL=https://slyfyrkqfdkoaaochspa.supabase.co
   export NEXT_PUBLIC_SUPABASE_ANON_KEY=<원본 지시자가 준 anon 키 — 아래>
   export AUTH_SECRET=local-preview-secret-0123456789abcdef GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x
   npx next build && npx next start -p <배정 포트>
   ```
   (start 는 백그라운드로)
4. 로그인 없이 보려면 임베드 경로를 연다. 캡처 스크립트:
   `MSYS_NO_PATHCONV=1 PORT=<포트> OUT=<저장 폴더> NAME=<이름> [THEME=light] [W=820] [FULL=1] [CLICK='css선택자||…'] node C:/Users/MGRV/AppData/Local/Temp/claude/ba9f5e3c19780b2d/c6f8e086-ee7e-43ae-b002-f9cbafd48b4c/scratchpad/v2shot-port.cjs "/embed/v2/<탭>?…"`
   — 출력에 상태 코드, 캡처 경로, 콘솔 오류가 나온다. **캡처를 직접 열어 보고** 다크·라이트, 1440·820 폭을 확인한다.
5. 끝나면 서버를 끈다(PowerShell `Get-NetTCPConnection -LocalPort <포트> -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`). Windows 에서 `pkill` 은 안 먹는다.

## 보고(마지막 메시지)
- 만든 파일 목록, 커밋 해시(브랜치 이름 포함)
- 1.0 기능 중 옮긴 것 / 못 옮긴 것(이유)
- 캡처 경로(다크·라이트 각 1장 이상)
- 확인하지 못한 것, 원본 지시자가 결정해야 할 것
